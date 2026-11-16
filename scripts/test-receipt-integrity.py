"""Test receipt integrity with isolated PostgreSQL connections, never Supabase.

Requires PostgreSQL server binaries on PATH or in PG_BIN. Creates and removes a
private temporary cluster; no credentials or application database are read.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
PG_BIN = os.environ.get("PG_BIN", "")


def executable(name: str) -> str:
    candidate = str(Path(PG_BIN) / name) if PG_BIN else shutil.which(name)
    if not candidate or not Path(candidate).exists():
        raise RuntimeError("Install PostgreSQL server binaries or set PG_BIN.")
    return candidate


def main() -> None:
    passed: list[str] = []
    connections: list[subprocess.Popen[str]] = []
    with tempfile.TemporaryDirectory(prefix="receipt-integrity-") as directory:
        folder = Path(directory)
        subprocess.run([executable("initdb"), "-D", str(folder / "data"), "-A", "trust", "--no-locale"], check=True, stdout=subprocess.DEVNULL)
        with (folder / "postgres.log").open("w") as log:
            server = subprocess.Popen([executable("postgres"), "-D", str(folder / "data"), "-k", directory, "-h", "", "-p", "5432"], stdout=log, stderr=log)
            args = [executable("psql"), "-XAtq", "-h", directory, "-p", "5432", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]

            def sql(statement: str) -> str:
                result = subprocess.run(args, input=statement, text=True, capture_output=True, timeout=10)
                if result.returncode:
                    raise AssertionError(result.stderr)
                return result.stdout.strip()

            def verify(name: str, condition: bool) -> None:
                assert condition, name
                passed.append(name)

            def connection(name: str, statement: str) -> subprocess.Popen[str]:
                process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1, env={**os.environ, "PGAPPNAME": name})
                connections.append(process)
                assert process.stdin and process.stdout
                process.stdin.write(statement + "\n\\echo READY\n")
                process.stdin.flush()
                assert process.stdout.readline().strip() == "READY", name
                return process

            def begin_commit(process: subprocess.Popen[str]) -> None:
                assert process.stdin
                process.stdin.write("commit;\n")
                process.stdin.flush()
                process.stdin.close()

            def finish(process: subprocess.Popen[str], expected_ok: bool) -> None:
                process.wait(timeout=10)
                assert process.stderr
                error = process.stderr.read()
                assert (process.returncode == 0) == expected_ok, error
                if not expected_ok:
                    assert "expense_receipt_details_expense_fk" in error, error

            actor = "11111111-1111-4111-8111-111111111111"
            trip = "22222222-2222-4222-8222-222222222222"
            expense = f"insert into public.trip_expense values('{trip}','expense-a','payer');"
            insert_details = f"insert into public.expense_receipt_details(account_id,trip_id,expense_id,details) values('{actor}','{trip}','expense-a','{{\"reviewed\":true}}');"
            authenticated_insert = f"begin;set local role authenticated;set local request.jwt.claim.sub='{actor}';" + insert_details
            remove_expense = "delete from public.trip_expense where id='expense-a';"
            counts = "select (select count(*) from public.trip_expense)||','||(select count(*) from public.expense_receipt_details);"
            try:
                for _ in range(100):
                    ready = subprocess.run([executable("pg_isready"), "-h", directory, "-p", "5432"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    if ready.returncode == 0:
                        break
                    time.sleep(0.05)
                else:
                    raise RuntimeError("Temporary PostgreSQL did not start.")
                sql(f"""create schema auth;create schema private;create role anon;create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.trip("tripID" uuid primary key);
create table public.trip_expense(trip_id uuid references public.trip("tripID") on delete cascade,id text,payer_id text,primary key(trip_id,id));
create table public.trip_member("tripID" uuid,planner_id text,"userID" uuid,status text);
grant usage on schema public,private,auth to authenticated;
grant select on public.trip_expense,public.trip_member to authenticated;
insert into auth.users values('{actor}');insert into public.trip values('{trip}');
insert into public.trip_member values('{trip}','payer','{actor}','accepted');""")
                migrations = ROOT / "supabase/migrations"
                for name in ["20261116092035_private_receipt_details.sql", "20261116100625_receipt_expense_cleanup.sql"]:
                    sql((migrations / name).read_text())
                # The old schema permits orphan insertion; the new migration repairs it.
                sql(insert_details)
                sql((migrations / "20261116141104_receipt_expense_integrity.sql").read_text())
                verify("Migration removes pre-existing orphan details", sql(counts) == "0,0")
                sql(expense)
                sql(authenticated_insert + "commit;")
                sql("begin;" + remove_expense + expense + "commit;")
                verify("Aggregate expense replacement preserves exact private details", sql("select details->>'reviewed' from public.expense_receipt_details;") == "true")
                sql(remove_expense)
                verify("Deferred cleanup runs before FK validation on real deletion", sql(counts) == "0,0")

                sql(expense)
                first = connection("receipt-insert-after-delete", authenticated_insert)
                sql(remove_expense)
                begin_commit(first)
                finish(first, False)
                verify("Insert committing after deletion cannot create an orphan", sql(counts) == "0,0")

                sql(expense)
                first = connection("receipt-insert-blocked", authenticated_insert)
                second = connection("receipt-delete-pending", "begin;" + remove_expense)
                begin_commit(first)
                for _ in range(100):
                    if sql("select count(*) from pg_stat_activity where application_name='receipt-insert-blocked' and wait_event_type='Lock';") == "1":
                        break
                    time.sleep(0.02)
                else:
                    raise AssertionError("Deferred FK did not wait for concurrent deletion")
                begin_commit(second)
                finish(second, True)
                finish(first, False)
                verify("Insert commit waits for an uncommitted deletion then rejects", sql(counts) == "0,0")

                sql(expense)
                sql(authenticated_insert + "commit;")
                sql(remove_expense)
                verify("Receipt committed before deletion is cleaned normally", sql(counts) == "0,0")
                sql(expense)
                sql(authenticated_insert + "commit;")
                outsider = sql("begin;set local role authenticated;set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';select count(*) from public.expense_receipt_details;commit;")
                verify("Unrelated authenticated account cannot read details", outsider == "0")
                sql(f"delete from public.trip where \"tripID\"='{trip}';")
                verify("Trip deletion cascades safely through expense and receipt constraints", sql(counts) == "0,0")
                print(json.dumps({"method": "Isolated PostgreSQL with exact receipt migrations and two real connections; no hosted service", "passed": passed}, indent=2))
            finally:
                for process in connections:
                    if process.poll() is None:
                        process.kill()
                        process.wait(timeout=10)
                server.terminate()
                server.wait(timeout=10)


if __name__ == "__main__":
    main()
