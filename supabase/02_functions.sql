-- Branch Attendance - business logic as Postgres functions.
-- Run this AFTER 01_schema.sql, same place (SQL Editor -> New query -> Run).
-- Each function checks auth.uid() / role itself, so these are safe to call
-- directly from the browser using the public anon key + a logged-in session.

-- ---------- Employee: my own profile ----------
create or replace function my_profile()
returns profiles
language sql security definer stable as $$
  select * from profiles where id = auth.uid();
$$;

-- ---------- Employee: mark login ----------
create or replace function mark_login(p_lat double precision, p_lng double precision, p_photo_url text)
returns attendance
language plpgsql security definer as $$
declare
  v_profile profiles;
  v_row attendance;
  v_today date := current_date;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile is null or not v_profile.is_active then
    raise exception 'Account not found or inactive';
  end if;

  select * into v_row from attendance where profile_id = auth.uid() and att_date = v_today;
  if found and v_row.login_time is not null then
    raise exception 'Login already marked for today';
  end if;

  insert into attendance (profile_id, att_date, login_time, login_photo_url, login_lat, login_lng, status)
  values (auth.uid(), v_today, now(), p_photo_url, p_lat, p_lng, 'in_progress')
  on conflict (profile_id, att_date)
  do update set login_time = now(), login_photo_url = p_photo_url, login_lat = p_lat, login_lng = p_lng
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------- Employee: mark logout ----------
create or replace function mark_logout(p_lat double precision, p_lng double precision, p_photo_url text)
returns attendance
language plpgsql security definer as $$
declare
  v_row attendance;
  v_today date := current_date;
begin
  select * into v_row from attendance where profile_id = auth.uid() and att_date = v_today;

  if not found or v_row.login_time is null then
    raise exception 'You must mark Login before Logout';
  end if;
  if v_row.logout_time is not null then
    raise exception 'Logout already marked for today. If this was a mistake, raise a regularization request.';
  end if;

  update attendance
  set logout_time = now(), logout_photo_url = p_photo_url, logout_lat = p_lat, logout_lng = p_lng, status = 'complete'
  where profile_id = auth.uid() and att_date = v_today
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------- Employee: raise a regularization request ----------
create or replace function raise_regularization(p_att_date date, p_reason text)
returns regularization_requests
language plpgsql security definer as $$
declare
  v_existing int;
  v_row regularization_requests;
begin
  select count(*) into v_existing from regularization_requests
  where profile_id = auth.uid() and att_date = p_att_date
    and status in ('pending_admin', 'pending_manager');
  if v_existing > 0 then
    raise exception 'A request for this date is already pending';
  end if;

  insert into regularization_requests (profile_id, att_date, reason, status)
  values (auth.uid(), p_att_date, p_reason, 'pending_admin')
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------- Employee: mark my forced password reset as done ----------
create or replace function complete_password_reset()
returns void
language sql security definer as $$
  update profiles set must_reset_password = false where id = auth.uid();
$$;

-- ---------- Admin: forward a request to the employee's reporting manager ----------
create or replace function forward_regularization(p_id int)
returns regularization_requests
language plpgsql security definer as $$
declare
  v_row regularization_requests;
  v_manager uuid;
begin
  if my_role() <> 'admin' then
    raise exception 'Not authorized';
  end if;

  select * into v_row from regularization_requests where id = p_id;
  if not found or v_row.status <> 'pending_admin' then
    raise exception 'Request not found or already processed';
  end if;

  select reporting_manager_id into v_manager from profiles where id = v_row.profile_id;
  if v_manager is null then
    raise exception 'Employee has no reporting manager assigned';
  end if;

  update regularization_requests
  set status = 'pending_manager', manager_id = v_manager, admin_forwarded_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------- Manager: approve/reject, with the 3-per-month cap ----------
create or replace function decide_regularization(p_id int, p_action text, p_note text)
returns regularization_requests
language plpgsql security definer as $$
declare
  v_row regularization_requests;
  v_count int;
begin
  if my_role() <> 'manager' then
    raise exception 'Not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'action must be approve or reject';
  end if;

  select * into v_row from regularization_requests where id = p_id;
  if not found or v_row.manager_id <> auth.uid() or v_row.status <> 'pending_manager' then
    raise exception 'Request not found, not yours, or already decided';
  end if;

  if p_action = 'reject' then
    update regularization_requests
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
    where id = p_id returning * into v_row;
    return v_row;
  end if;

  -- approve: enforce 3 approvals per employee per calendar month
  select count(*) into v_count from regularization_requests
  where profile_id = v_row.profile_id and status = 'approved'
    and date_trunc('month', decided_at) = date_trunc('month', now());

  if v_count >= 3 then
    update regularization_requests
    set status = 'limit_exceeded', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
    where id = p_id returning * into v_row;
    return v_row; -- frontend shows "email Admin directly" message based on this status
  end if;

  update regularization_requests
  set status = 'approved', decided_at = now(), decided_by = auth.uid(), decision_note = p_note
  where id = p_id returning * into v_row;

  update attendance set status = 'regularized'
  where profile_id = v_row.profile_id and att_date = v_row.att_date;

  return v_row;
end;
$$;

-- ---------- Admin: activate / deactivate an employee ----------
create or replace function set_employee_status(p_profile_id uuid, p_is_active boolean)
returns profiles
language plpgsql security definer as $$
declare
  v_row profiles;
begin
  if my_role() <> 'admin' then
    raise exception 'Not authorized';
  end if;

  update profiles set is_active = p_is_active where id = p_profile_id returning * into v_row;
  if not found then
    raise exception 'Employee not found';
  end if;
  return v_row;
end;
$$;
