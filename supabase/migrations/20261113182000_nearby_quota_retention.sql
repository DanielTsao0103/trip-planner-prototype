begin;
-- Account deletion must not reset the project's monthly provider allowance.
-- Anonymize past reservations while retaining their counters and server timestamps.
alter table private.nearby_research_usage alter column actor drop not null;
alter table private.nearby_research_usage drop constraint nearby_research_usage_actor_fkey;
alter table private.nearby_research_usage add constraint nearby_research_usage_actor_fkey
  foreign key(actor) references auth.users(id) on delete set null;
commit;
