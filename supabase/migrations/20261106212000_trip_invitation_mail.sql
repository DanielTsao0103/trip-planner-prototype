begin;

-- GoTrue renders email from the recipient's metadata. Supply display copy from
-- the saved trip and owner's profile, including when an unopened invite is retried.
-- Membership still requires a verified email and a pending signup request.
create function private.set_trip_mail_context() returns trigger
language plpgsql security definer set search_path = '' as $$
declare contexts jsonb;
begin
  if new.raw_user_meta_data is null then return new; end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'trip_mail';
  if new.raw_user_meta_data->>'trip_account_setup' is distinct from 'true'
    or new.last_sign_in_at is not null then return new; end if;

  select jsonb_object_agg(r.id, jsonb_build_object('host',r.host,'title',r.title,'place',r.place))
    into contexts from (
      select t."tripID" as id, coalesce(nullif(btrim(u.name),''),'Your travel partner') as host,
        t.trip_name as title, array_to_string(t.destinations,' · ') as place
      from private.trip_signup_request q
      join public.trip t on t."tripID"=q.trip_id
      join public."user" u on u."userID"=t.owner_id
      where q.email=lower(new.email) and q.requested_at>now()-interval '7 days'
      order by q.requested_at desc, q.trip_id limit 4
    ) r;
  if contexts is not null then
    new.raw_user_meta_data := new.raw_user_meta_data || jsonb_build_object('trip_mail',contexts);
  end if;
  return new;
end $$;

create trigger trip_mail_context before insert or update of raw_user_meta_data on auth.users
for each row execute function private.set_trip_mail_context();

create function private.refresh_trip_mail_context() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The Auth account may already exist from an earlier, unopened email.
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb) || '{"trip_account_setup":true}'::jsonb
    where lower(email)=new.email and deleted_at is null and last_sign_in_at is null
    and nullif(btrim(raw_user_meta_data->>'name'),'') is null;
  return new;
end $$;

create trigger refresh_trip_mail_context after insert or update of requested_at on private.trip_signup_request
for each row execute function private.refresh_trip_mail_context();

revoke all on function private.set_trip_mail_context(),private.refresh_trip_mail_context() from public, anon, authenticated;
commit;
