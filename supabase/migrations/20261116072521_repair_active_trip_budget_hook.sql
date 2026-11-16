begin;

-- Analytics must use the same personal-budget column as the atomic trip writer.
-- Preserve the existing hook, grants and transaction so current trips can save.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.record_budget_cadence_change(uuid,jsonb)'::regprocedure);
  if position('b.budget_cents' in definition) > 0 then
    execute replace(definition, 'b.budget_cents', 'b.amount_cents');
  elsif position('b.amount_cents' in definition) = 0 then
    raise exception 'Unexpected budget cadence definition; inspect before updating';
  end if;
end $$;

commit;
