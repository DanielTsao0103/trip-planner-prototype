begin;

-- A booking may leave the waiting list only after its stable-ID itinerary event
-- exists. The shared trip lock serializes this check with the normal trip writer.
create function private.mark_forwarded_booking_added(p_booking uuid, p_trip uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_booking is null or p_trip is null then raise exception 'Choose a booking and trip' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text, 0));
  perform 1 from public.forwarded_booking where booking_id = p_booking and owner_id = actor for update;
  if not found then raise exception 'Booking access denied' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.trip t where t."tripID" = p_trip and (
      t.owner_id = actor or exists (
        select 1 from public.trip_member m where m."tripID" = t."tripID"
          and m."userID" = actor and m.shared_account and m.status = 'accepted'
      )
    )
  ) then raise exception 'Trip access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.event e where e."eventID" = p_booking and e."tripID" = p_trip) then
    raise exception 'Save the booking event before updating the booking list' using errcode = 'P0001';
  end if;
  update public.forwarded_booking
    set added_at = case when trip_id = p_trip then coalesce(added_at, clock_timestamp()) else clock_timestamp() end,
        trip_id = p_trip
    where booking_id = p_booking and owner_id = actor;
  return true;
end $$;

create function private.undo_forwarded_booking(p_booking uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  -- Updating the row acquires its row lock. This operation never deletes the
  -- itinerary event, so it does not need a trip write or a trip advisory lock.
  update public.forwarded_booking set trip_id = null, added_at = null
    where booking_id = p_booking and owner_id = actor;
  if not found then raise exception 'Booking access denied' using errcode = '42501'; end if;
  return true;
end $$;

create function public.mark_forwarded_booking_added(p_booking uuid, p_trip uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.mark_forwarded_booking_added(p_booking, p_trip)
$$;
create function public.undo_forwarded_booking(p_booking uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.undo_forwarded_booking(p_booking)
$$;

revoke all on function private.mark_forwarded_booking_added(uuid,uuid), private.undo_forwarded_booking(uuid),
  public.mark_forwarded_booking_added(uuid,uuid), public.undo_forwarded_booking(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.mark_forwarded_booking_added(uuid,uuid), private.undo_forwarded_booking(uuid),
  public.mark_forwarded_booking_added(uuid,uuid), public.undo_forwarded_booking(uuid) to authenticated;

-- Preserve own-row SELECT/DELETE, but stop cached clients from bypassing the
-- confirmed-event check through the previous column-level UPDATE grant.
revoke update on table public.forwarded_booking from public, anon, authenticated;
revoke update (trip_id, added_at) on table public.forwarded_booking from public, anon, authenticated;
drop policy "Sort own forwarded bookings" on public.forwarded_booking;

notify pgrst, 'reload schema';
commit;
