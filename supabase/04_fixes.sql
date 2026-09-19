-- Branch Attendance - fixes for: role-casing bug, and enabling permanent
-- employee deletion. Run this once in Supabase SQL Editor.

-- ---------- Fix 1: normalize any mixed-case role values ----------
-- (from CSV uploads before role values were consistently lowercased)
update profiles set role = lower(trim(role));

-- ---------- Fix 2: allow permanently deleting an employee ----------
-- Their own attendance/regularization history is deleted with them.
-- If they were someone's manager, those relationships are cleared instead
-- of blocking the deletion or cascading into deleting their team.

alter table attendance
  drop constraint attendance_profile_id_fkey,
  add constraint attendance_profile_id_fkey
    foreign key (profile_id) references profiles(id) on delete cascade;

alter table regularization_requests
  drop constraint regularization_requests_profile_id_fkey,
  add constraint regularization_requests_profile_id_fkey
    foreign key (profile_id) references profiles(id) on delete cascade;

alter table regularization_requests
  drop constraint regularization_requests_manager_id_fkey,
  add constraint regularization_requests_manager_id_fkey
    foreign key (manager_id) references profiles(id) on delete set null;

alter table profiles
  drop constraint profiles_reporting_manager_id_fkey,
  add constraint profiles_reporting_manager_id_fkey
    foreign key (reporting_manager_id) references profiles(id) on delete set null;
