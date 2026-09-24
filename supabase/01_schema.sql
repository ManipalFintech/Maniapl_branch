-- Branch Attendance - Supabase schema
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> paste & Run.

-- ---------- PROFILES (one row per employee/manager/admin) ----------
-- id = auth.users.id (Supabase Auth handles the actual login/password).
-- emp_id is what humans type in to log in; it maps to a hidden internal
-- email (emp_id@manipalfintech.internal) behind the scenes in the app.

create table if not exists profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  emp_id                text unique not null,
  name                  text not null,
  role                  text not null default 'employee', -- employee | manager | admin
  reporting_manager_id  uuid references profiles(id),
  branch                text default 'main',
  is_active             boolean not null default true,
  must_reset_password   boolean not null default true,
  created_at            timestamptz not null default now()
);

-- ---------- ATTENDANCE ----------
create table if not exists attendance (
  id                serial primary key,
  profile_id        uuid not null references profiles(id),
  att_date          date not null,
  login_time        timestamptz,
  login_photo_url   text,
  login_lat         double precision,
  login_lng         double precision,
  logout_time       timestamptz,
  logout_photo_url  text,
  logout_lat        double precision,
  logout_lng        double precision,
  status            text not null default 'in_progress',
  -- in_progress | complete | regularized
  created_at        timestamptz not null default now(),
  unique (profile_id, att_date)
);

-- ---------- REGULARIZATION REQUESTS ----------
create table if not exists regularization_requests (
  id                  serial primary key,
  profile_id          uuid not null references profiles(id),
  att_date            date not null,
  reason              text not null,
  status              text not null default 'pending_admin',
  -- pending_admin | pending_manager | approved | rejected | limit_exceeded
  manager_id          uuid references profiles(id),
  admin_forwarded_at  timestamptz,
  decided_at          timestamptz,
  decided_by          uuid,
  decision_note       text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_attendance_profile_date on attendance(profile_id, att_date);
create index if not exists idx_reg_profile on regularization_requests(profile_id);
create index if not exists idx_reg_manager_status on regularization_requests(manager_id, status);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table attendance enable row level security;
alter table regularization_requests enable row level security;

-- Helper functions (SECURITY DEFINER so they can read profiles regardless of RLS)
create or replace function my_role() returns text
language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_my_report(p_profile_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = p_profile_id and reporting_manager_id = auth.uid()
  );
$$;

-- profiles: self, or admin sees all, or manager sees direct reports
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or my_role() = 'admin'
  or (my_role() = 'manager' and reporting_manager_id = auth.uid())
);
-- No insert/update/delete policies for normal users -> only the service-role
-- Edge Function (which bypasses RLS) can create/modify profiles directly.
-- A few narrow self-service updates are exposed via functions below.

-- attendance: self, or admin, or manager for their direct reports
create policy attendance_select on attendance for select using (
  profile_id = auth.uid()
  or my_role() = 'admin'
  or (my_role() = 'manager' and is_my_report(profile_id))
);
-- No direct insert/update policies - only via the functions below (SECURITY DEFINER).

-- regularization_requests: employee sees own, admin sees all, manager sees assigned
create policy reg_select on regularization_requests for select using (
  profile_id = auth.uid()
  or my_role() = 'admin'
  or (my_role() = 'manager' and manager_id = auth.uid())
);
-- No direct insert/update policies - only via the functions below.
