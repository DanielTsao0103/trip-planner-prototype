-- Forwarded booking emails. Mailtrap receives the email, the inbound-email Edge Function reads it
-- and saves only the extracted fields here. The full email is never stored.
-- Browsers can read and remove their own rows; only the function (service role) can add them.
begin;

create table public.forwarded_booking (
  booking_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mailtrap_message_id text not null unique check (mailtrap_message_id ~ '^[0-9]{1,30}$'),
  sender text not null check (char_length(sender) <= 320),
  subject text not null check (char_length(subject) <= 300),
  kind text not null default 'other'
    check (kind in ('flight', 'lodging', 'rental_car', 'train', 'restaurant', 'event', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  start_date date check (start_date is null or (start_date >= date '2000-01-01' and start_date < date '2100-01-01')),
  end_date date check (end_date is null or (end_date >= date '2000-01-01' and end_date < date '2100-01-01')),
  location text check (location is null or char_length(location) <= 300),
  confirmation_code text check (confirmation_code is null or char_length(confirmation_code) <= 64),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 4096),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index forwarded_booking_owner_idx on public.forwarded_booking (owner_id, received_at desc);

alter table public.forwarded_booking enable row level security;
revoke all on public.forwarded_booking from anon, authenticated;
grant select, delete on public.forwarded_booking to authenticated;
grant select, insert, update, delete on public.forwarded_booking to service_role;
create policy "Read own forwarded bookings" on public.forwarded_booking for select to authenticated
using (owner_id = (select auth.uid()));
create policy "Delete own forwarded bookings" on public.forwarded_booking for delete to authenticated
using (owner_id = (select auth.uid()));

-- Remembers which Mailtrap messages were already handled (ids and a status only, no email content),
-- including ones from senders without an account, so they are not fetched again.
create table public.inbound_email_log (
  mailtrap_message_id text primary key check (mailtrap_message_id ~ '^[0-9]{1,30}$'),
  status text not null check (status in ('saved', 'unmatched', 'ambiguous')),
  processed_at timestamptz not null default now()
);
alter table public.inbound_email_log enable row level security;
revoke all on public.inbound_email_log from anon, authenticated;
grant select, insert on public.inbound_email_log to service_role;

commit;
