begin;

-- A forwarded message can be attributed only by its account's unguessable code.
-- Email From is display data, never proof of account ownership.
create table private.booking_forwarding_key (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[a-f0-9]{48}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.booking_forwarding_key enable row level security;
revoke all on private.booking_forwarding_key from public, anon, authenticated, service_role;

create function private.get_booking_forwarding_code(p_rotate boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result text;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  insert into private.booking_forwarding_key(user_id, code)
    values(actor, encode(extensions.gen_random_bytes(24), 'hex'))
    on conflict (user_id) do nothing;
  if p_rotate is true then
    update private.booking_forwarding_key
      set code = encode(extensions.gen_random_bytes(24), 'hex'), updated_at = now()
      where user_id = actor;
  end if;
  select code into result from private.booking_forwarding_key where user_id = actor;
  return jsonb_build_object('code', result);
end $$;
revoke all on function private.get_booking_forwarding_code(boolean) from public, anon, authenticated, service_role;
grant execute on function private.get_booking_forwarding_code(boolean) to authenticated;

create function public.get_booking_forwarding_code(p_rotate boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.get_booking_forwarding_code(p_rotate)
$$;
revoke all on function public.get_booking_forwarding_code(boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_booking_forwarding_code(boolean) to authenticated;

create function private.resolve_booking_forwarding_code(p_code text)
returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from private.booking_forwarding_key where code = p_code
$$;
revoke all on function private.resolve_booking_forwarding_code(text) from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.resolve_booking_forwarding_code(text) to service_role;

create function public.resolve_booking_forwarding_code(p_code text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select private.resolve_booking_forwarding_code(p_code)
$$;
revoke all on function public.resolve_booking_forwarding_code(text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_booking_forwarding_code(text) to service_role;

-- Current Mailtrap IDs are opaque strings, not necessarily numeric.
alter table public.forwarded_booking drop constraint forwarded_booking_mailtrap_message_id_check;
alter table public.forwarded_booking add constraint forwarded_booking_mailtrap_message_id_check
  check (mailtrap_message_id ~ '^[A-Za-z0-9_-]{1,200}$');
alter table public.inbound_email_log drop constraint inbound_email_log_mailtrap_message_id_check;
alter table public.inbound_email_log add constraint inbound_email_log_mailtrap_message_id_check
  check (mailtrap_message_id ~ '^[A-Za-z0-9_-]{1,200}$');

commit;
