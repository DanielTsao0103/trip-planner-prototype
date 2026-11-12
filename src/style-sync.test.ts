import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToStyle, styleToRow, loadAccountStyle, saveAccountStyle, createStyleSync, type StyleSaveStatus } from "./style-sync.ts";
import { DEFAULT_STYLE } from "./theme.ts";

const choice = { theme: "purple", matchDevice: false, mode: "dark", heading: "playfair", corners: "round" };

test("a style choice round-trips through its database row", () => {
  assert.deepEqual(rowToStyle(styleToRow("user-1", choice)), choice);
});

test("unknown or missing stored values fall back to the default style", () => {
  assert.equal(rowToStyle(null), null);
  assert.deepEqual(
    rowToStyle({ theme: "neon", match_device: "yes" as unknown as boolean, mode: "blinding", heading: "comic", corners: "spiky" }),
    DEFAULT_STYLE,
  );
});

test("saving upserts one row keyed by the account, and loading reads it back", async () => {
  const calls: unknown[] = [];
  const saveClient = {
    from: (table: string) => ({
      upsert: async (row: unknown, options: unknown) => {
        calls.push({ table, row, options });
        return { error: null };
      },
    }),
  };
  await saveAccountStyle("user-1", choice, saveClient as never);
  assert.deepEqual(calls, [{ table: "user_style", row: styleToRow("user-1", choice), options: { onConflict: "user_id" } }]);

  const loadClient = {
    from: () => ({
      select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: styleToRow(id, choice), error: null }) }) }),
    }),
  };
  assert.deepEqual(await loadAccountStyle("user-1", loadClient as never), choice);
});

test("database errors are surfaced instead of hidden", async () => {
  const failing = { from: () => ({ upsert: async () => ({ error: new Error("denied") }) }) };
  await assert.rejects(saveAccountStyle("user-1", choice, failing as never), /denied/);
});

/** Allow a controller's asynchronous completion to report its next visible state. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("failed style saves retain the exact choice for an explicit retry", async () => {
  const statuses: StyleSaveStatus[] = [];
  const writes: unknown[] = [];
  let fail = true;
  const sync = createStyleSync({
    load: async () => null,
    save: async (value) => { writes.push(value); if (fail) throw Error("offline"); },
    apply: () => assert.fail("Nothing was loaded"),
    report: (value) => statuses.push(value),
  });
  await settle();
  sync.save(choice);
  await settle();
  assert.equal(statuses.at(-1), "save-error");
  assert.equal(statuses.includes("saved"), false);
  fail = false;
  sync.retry();
  assert.equal(statuses.at(-1), "saving");
  await settle();
  assert.deepEqual(writes, [choice, choice]);
  assert.equal(statuses.at(-1), "saved");
  sync.dispose();
});

test("rapid Applies are serialized and confirmed only after the latest choice", async () => {
  const writes: unknown[] = [];
  const complete: Array<() => void> = [];
  const statuses: StyleSaveStatus[] = [];
  const sync = createStyleSync({
    load: async () => null,
    save: (value) => { writes.push(value); return new Promise<void>((resolve) => complete.push(resolve)); },
    apply: () => {},
    report: (value) => statuses.push(value),
  });
  await settle();
  sync.save(choice);
  const newer = { ...choice, theme: "green" };
  sync.save(newer);
  assert.deepEqual(writes, [choice]);
  complete[0]();
  await settle();
  assert.deepEqual(writes, [choice, newer]);
  assert.equal(statuses.at(-1), "saving");
  complete[1]();
  await settle();
  assert.equal(statuses.at(-1), "saved");
  sync.dispose();
});

test("late account loading cannot replace an applied style or its save result", async () => {
  let finishLoad!: (choice: typeof DEFAULT_STYLE) => void;
  const statuses: StyleSaveStatus[] = [];
  const sync = createStyleSync({
    load: () => new Promise((resolve) => { finishLoad = resolve; }),
    save: async () => {},
    apply: () => assert.fail("Late load must not overwrite the user's Apply"),
    report: (value) => statuses.push(value),
  });
  sync.save(choice);
  await settle();
  finishLoad(DEFAULT_STYLE);
  await settle();
  assert.equal(statuses.at(-1), "saved");
  sync.dispose();
});

test("load failure can retry and disposed account requests never publish another status", async () => {
  const statuses: StyleSaveStatus[] = [];
  let loads = 0;
  let finishSave!: () => void;
  const applied: unknown[] = [];
  const sync = createStyleSync({
    load: async () => { if (++loads === 1) throw Error("offline"); return choice; },
    save: () => new Promise((resolve) => { finishSave = resolve; }),
    apply: (value) => applied.push(value),
    report: (value) => statuses.push(value),
  });
  await settle();
  assert.equal(statuses.at(-1), "load-error");
  sync.retry();
  await settle();
  assert.deepEqual(applied, [choice]);
  assert.equal(statuses.at(-1), "ready");
  sync.save(choice);
  sync.dispose();
  const count = statuses.length;
  finishSave();
  await settle();
  assert.equal(statuses.length, count);
});
