-- =====================================================================
-- Branch Attendance - 05_bugfixes.sql
-- Run ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run (every statement is idempotent).
--
-- Fixes:
--   * "Today" was calculated in UTC (current_date). Between 00:00 and 05:30
--     IST, attendance landed on YESTERDAY's date and vanished from exports
--     of the correct day. Everything now uses India time (Asia/Kolkata).
--   * New my_today() / my_attendance() functions that ONLY ever return the
--     signed-in person's own rows. Previously the app read the attendance
--     table directly, and for a manager Row Level Security also returns
--     their reports' rows - so an SBO's record was shown as the manager's.
--   * mark_login / mark_logout are now race-safe (a double tap or a retry
--     after a network drop can no longer overwrite or duplicate a record).
--   * Role checks are case-insensitive, and roles are normalised on save.
--   * An admin can no longer deactivate their own account by accident.
--   * Approving a mistaken-logout request now reopens the day so the
--     employee can mark their real logout (it previously changed nothing).
-- =====================================================================


-- ---------- Time zone helpers ----------
create or replace function app_timezone() returns text
language sql immutable as $$
  select 'Asia/Kolkata'::text;
$$;

create or replace function app_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone app_timezone())::date;
$$;


-- ---------- Case-insensitive role helpers ----------
create or replace function my_role() returns text
language sql security definer stable set search_path = public as $$
  select lower(trim(role)) from profiles where id = auth.uid();
$$;

create or replace function is_my_report(p_profile_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles where id = p_profile_id and reporting_manager_id = auth.uid()
  );
$$;

create or replace function normalize_profile_role() returns trigger
language plpgsql as $$
begin
  new.role := lower(trim(coalesce(new.role, 'employee')));
  if new.role = '' then new.role := 'employee'; end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_profile_role on profiles;
create trigger trg_normalize_profile_role
  before insert or update of role on profiles
  for each row execute function normalize_profile_role();

update profiles set role = lower(trim(role)) where role is distinct from lower(trim(role));


-- ---------- My profile ----------
create or replace function my_profile()
returns profiles
language sql security definer stable set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;


-- ---------- My status for today (always MY row only, India date) ----------
create or replace function my_today()
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_today date := app_today();
  v_row   attendance;
  v_found boolean;
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;

  select * into v_row from attendance
  where profile_id = auth.uid() and att_date = v_today;
  v_found := found;

  return json_build_object(
    'today',       v_today,
    'server_time', now(),
    'record',      case when v_found then row_to_json(v_row) else null end
  );
end;
$$;


-- ---------- My attendance for a date range (always MY rows only) ----------
create or replace function my_attendance(p_from date, p_to date)
returns setof attendance
language sql security definer stable set search_path = public as $$
  select * from attendance
  where profile_id = auth.uid()
    and att_date between p_from and p_to
  order by att_date;
$$;


-- ---------- Mark login (race-safe, India date) ----------
create or replace function mark_login(p_lat double precision, p_lng double precision, p_photo_url text)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_row     attendance;
  v_today   date := app_today();
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;

  select * into v_profile from profiles where id = auth.uid();
  if not found or not v_profile.is_active then
    raise exception 'Account not found or inactive';
  end if;

  -- Single atomic statement: inserts today's row, or fills in the login on
  -- an existing row ONLY if no login is recorded yet. Never overwrites.
  insert into attendance (profile_id, att_date, login_time, login_photo_url, login_lat, login_lng, status)
  values (auth.uid(), v_today, now(), p_photo_url, p_lat, p_lng, 'in_progress')
  on conflict (profile_id, att_date) do update
    set login_time      = excluded.login_time,
        login_photo_url = excluded.login_photo_url,
        login_lat       = excluded.login_lat,
        login_lng       = excluded.login_lng,
        status          = 'in_progress'
    where attendance.login_time is null
  returning * into v_row;

  if not found then
    select * into v_row from attendance where profile_id = auth.uid() and att_date = v_today;
    raise exception 'Login already marked for today at %',
      to_char(v_row.login_time at time zone app_timezone(), 'HH12:MI AM');
  end if;

  return v_row;
end;
$$;


-- ---------- Mark logout (race-safe, India date) ----------
create or replace function mark_logout(p_lat double precision, p_lng double precision, p_photo_url text)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_row     attendance;
  v_today   date := app_today();
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;

  select * into v_profile from profiles where id = auth.uid();
  if not found or not v_profile.is_active then
    raise exception 'Account not found or inactive';
  end if;

  update attendance
  set logout_time      = now(),
      logout_photo_url = p_photo_url,
      logout_lat       = p_lat,
      logout_lng       = p_lng,
      status           = case when status = 'regularized' then 'regularized' else 'complete' end
  where profile_id = auth.uid()
    and att_date = v_today
    and login_time is not null
    and logout_time is null
  returning * into v_row;

  if found then
    return v_row;
  end if;

  select * into v_row from attendance where profile_id = auth.uid() and att_date = v_today;
  if not found or v_row.login_time is null then
    raise exception 'You must mark Login before Logout';
  end if;
  raise exception 'Logout already marked for today at %. If this was a mistake, raise a regularization request.',
    to_char(v_row.logout_time at time zone app_timezone(), 'HH12:MI AM');
end;
$$;


-- ---------- Admin: activate / deactivate (cannot lock yourself out) ----------
create or replace function set_employee_status(p_profile_id uuid, p_is_active boolean)
returns profiles
language plpgsql security definer set search_path = public as $$
declare
  v_row profiles;
begin
  if my_role() <> 'admin' then
    raise exception 'Not authorized';
  end if;
  if p_profile_id = auth.uid() and not p_is_active then
    raise exception 'You cannot deactivate your own admin account';
  end if;

  update profiles set is_active = p_is_active where id = p_profile_id returning * into v_row;
  if not found then
    raise exception 'Employee not found';
  end if;
  return v_row;
end;
$$;


-- ---------- Employee: raise a regularization request (validated) ----------
create or replace function raise_regularization(p_att_date date, p_reason text)
returns regularization_requests
language plpgsql security definer set search_path = public as $$
declare
  v_att attendance;
  v_row regularization_requests;
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;
  if p_att_date is null or p_att_date > app_today() then
    raise exception 'Choose a valid date';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Enter a reason for the request';
  end if;

  select * into v_att from attendance where profile_id = auth.uid() and att_date = p_att_date;
  if not found or v_att.logout_time is null then
    raise exception 'There is no logout recorded on % to regularize', to_char(p_att_date, 'DD Mon YYYY');
  end if;

  if exists (
    select 1 from regularization_requests
    where profile_id = auth.uid() and att_date = p_att_date
      and status in ('pending_admin', 'pending_manager')
  ) then
    raise exception 'A request for this date is already pending';
  end if;

  insert into regularization_requests (profile_id, att_date, reason, status)
  values (auth.uid(), p_att_date, trim(p_reason), 'pending_admin')
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------- Manager: approve / reject (null-safe, India month, reopens day) ----------
-- On approval the mistaken logout is cleared so the employee can mark their
-- real logout. If the day is already over, the day is marked 'regularized'
-- and the original logout is kept for the record.
create or replace function decide_regularization(p_id int, p_action text, p_note text)
returns regularization_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row   regularization_requests;
  v_count int;
begin
  if my_role() <> 'manager' then
    raise exception 'Not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'action must be approve or reject';
  end if;

  select * into v_row from regularization_requests where id = p_id for update;
  if not found
     or v_row.manager_id is distinct from auth.uid()
     or v_row.status <> 'pending_manager' then
    raise exception 'Request not found, not yours, or already decided';
  end if;

  if p_action = 'reject' then
    update regularization_requests
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
    where id = p_id returning * into v_row;
    return v_row;
  end if;

  -- 3 approvals per employee per calendar month (India time)
  select count(*) into v_count from regularization_requests
  where profile_id = v_row.profile_id and status = 'approved'
    and date_trunc('month', decided_at at time zone app_timezone())
      = date_trunc('month', now() at time zone app_timezone());

  if v_count >= 3 then
    update regularization_requests
    set status = 'limit_exceeded', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
    where id = p_id returning * into v_row;
    return v_row;
  end if;

  update regularization_requests
  set status = 'approved', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
  where id = p_id returning * into v_row;

  if v_row.att_date = app_today() then
    update attendance
    set status = 'regularized',
        logout_time = null, logout_photo_url = null, logout_lat = null, logout_lng = null
    where profile_id = v_row.profile_id and att_date = v_row.att_date;
  else
    update attendance set status = 'regularized'
    where profile_id = v_row.profile_id and att_date = v_row.att_date;
  end if;

  return v_row;
end;
$$;


-- ---------- Helpful index for date-range exports ----------
create index if not exists idx_attendance_date on attendance(att_date);


-- ---------- Function permissions ----------
revoke execute on function my_today() from anon;
revoke execute on function my_attendance(date, date) from anon;
grant execute on function my_today() to authenticated;
grant execute on function my_attendance(date, date) to authenticated;


-- =====================================================================
-- OPTIONAL DIAGNOSTIC (read-only): records whose date was stored in UTC
-- and therefore sits on the wrong India date. Run it on its own to review.
--
-- select a.id, p.emp_id, p.name, a.att_date,
--        (a.login_time at time zone 'Asia/Kolkata')::date as india_date,
--        a.login_time at time zone 'Asia/Kolkata' as login_ist
-- from attendance a join profiles p on p.id = a.profile_id
-- where a.login_time is not null
--   and (a.login_time at time zone 'Asia/Kolkata')::date <> a.att_date
-- order by a.att_date desc;
-- =====================================================================
