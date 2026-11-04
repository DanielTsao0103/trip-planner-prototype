begin;
-- Each account remembers its Style page choices (color theme, light/dark, heading font, corners)
-- so they follow the person to any device. Every saved change is also appended to a log table.

create table public.user_style (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'blue'
    check (theme in ('pink','blue','purple','green','orange','yellow','creme')),
  match_device boolean not null default true,
  mode text not null default 'light' check (mode in ('light','dark')),
  heading text not null default 'serif'
    check (heading in ('serif','sans','playfair','lora','poppins','grotesk','caveat')),
  corners text not null default 'soft' check (corners in ('square','soft','round')),
  updated_at timestamptz not null default now()
);
alter table public.user_style enable row level security;
create policy user_style_select_own on public.user_style
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_style_insert_own on public.user_style
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_style_update_own on public.user_style
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.user_style from public, anon, authenticated;
grant select, insert, update on public.user_style to authenticated;

-- Append-only history of every style choice. Written only by the trigger below.
create table public.user_style_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chosen_at timestamptz not null default now(),
  theme text not null,
  match_device boolean not null,
  mode text not null,
  heading text not null,
  corners text not null
);
create index user_style_log_user_chosen_idx on public.user_style_log (user_id, chosen_at desc);
alter table public.user_style_log enable row level security;
create policy user_style_log_select_own on public.user_style_log
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_style_log from public, anon, authenticated;
grant select on public.user_style_log to authenticated;

create or replace function private.touch_user_style()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.log_user_style()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'INSERT' or (new.theme, new.match_device, new.mode, new.heading, new.corners)
     is distinct from (old.theme, old.match_device, old.mode, old.heading, old.corners) then
    insert into public.user_style_log (user_id, theme, match_device, mode, heading, corners)
    values (new.user_id, new.theme, new.match_device, new.mode, new.heading, new.corners);
  end if;
  return new;
end $$;
revoke all on function private.touch_user_style() from public, anon, authenticated;
revoke all on function private.log_user_style() from public, anon, authenticated;

create trigger user_style_touch before insert or update on public.user_style
  for each row execute function private.touch_user_style();
create trigger user_style_log_change after insert or update on public.user_style
  for each row execute function private.log_user_style();
commit;
