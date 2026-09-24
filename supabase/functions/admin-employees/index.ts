// Supabase Edge Function: admin-employees
// Deployed once via the Supabase CLI (see DEPLOYMENT.md). Handles the one
// thing the browser can never safely do itself: creating a real login
// (Supabase Auth user) for a new employee, and resetting a password.
//
// Bootstrap rule: if NO admin exists yet in `profiles`, this function allows
// the very first "create" call through unauthenticated, so you can create
// your first Admin login right after deploying. Once an admin exists, every
// further call must come from a logged-in Admin.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_PASSWORD = Deno.env.get('DEFAULT_PASSWORD') || 'Welcome@123';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function emailFor(empId: string) {
  return `${empId.trim().toLowerCase()}@manipalfintech.internal`;
}

async function isBootstrapAllowed() {
  const { count } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');
  return (count ?? 0) === 0;
}

// Returns the admin's user id, or null if the caller is not an active admin.
async function callerIsAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single();
  if (!profile || !profile.is_active) return null;
  return (profile.role || '').toLowerCase().trim() === 'admin' ? userData.user.id : null;
}

async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

// Emp IDs are matched case-insensitively ("emp1042" and "EMP1042" are the
// same person - their login email is lowercased anyway).
async function findProfileByEmpId(empId: string) {
  const exact = await admin.from('profiles').select('id').eq('emp_id', empId).maybeSingle();
  if (exact.data) return exact.data;
  const escaped = empId.replace(/[\\%_]/g, (c) => '\\' + c);
  const { data } = await admin.from('profiles').select('id, emp_id').ilike('emp_id', escaped).limit(1);
  return data && data.length ? data[0] : null;
}

const VALID_ROLES = ['employee', 'manager', 'admin'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either the manager's internal profile ID or their Emp ID.
// Returns undefined when the column was left blank (= "not provided").
async function resolveManagerId(value: unknown): Promise<string | null | undefined> {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  if (UUID_RE.test(v)) {
    const { data } = await admin.from('profiles').select('id').eq('id', v).maybeSingle();
    if (!data) throw new Error(`Reporting manager ${v} not found`);
    return data.id;
  }
  const byEmpId = await findProfileByEmpId(v);
  if (!byEmpId) throw new Error(`Reporting manager "${v}" not found - create the manager first`);
  return byEmpId.id;
}

// partial = true (CSV bulk upload): blank columns leave the existing value
// unchanged. Previously a blank role demoted managers to employee and a blank
// manager column wiped reporting_manager_id, emptying managers' teams.
async function createOneEmployee(row: any, { partial = false } = {}) {
  const emp_id = String(row.emp_id || '').trim();
  const name = String(row.name || '').trim();
  if (!emp_id || !name) throw new Error('emp_id and name are required');
  if (/\s/.test(emp_id)) throw new Error('emp_id cannot contain spaces');

  const role = String(row.role ?? '').trim().toLowerCase();
  if (role && !VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role "${row.role}" - use employee, manager or admin`);
  }
  const managerId = await resolveManagerId(row.reporting_manager_id ?? row.reporting_manager ?? row.manager_emp_id);
  const branch = String(row.branch ?? '').trim();

  // Case 1: a profile already exists for this Emp ID - update it.
  const existing = await findProfileByEmpId(emp_id);

  if (existing) {
    if (managerId && managerId === existing.id) throw new Error('An employee cannot report to themselves');
    const update: Record<string, unknown> = { name };
    if (role) update.role = role;
    else if (!partial) update.role = 'employee';
    if (managerId !== undefined) update.reporting_manager_id = managerId;
    else if (!partial) update.reporting_manager_id = null;
    if (branch) update.branch = branch;

    const { error: updateErr } = await admin.from('profiles').update(update).eq('id', existing.id);
    if (updateErr) throw new Error(updateErr.message);
    return { emp_id, name, action: 'updated' };
  }

  const profileFields = {
    name,
    role: role || 'employee',
    reporting_manager_id: managerId ?? null,
    branch: branch || 'main'
  };

  // Case 2: no profile yet - try creating a fresh login.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailFor(emp_id),
    password: DEFAULT_PASSWORD,
    email_confirm: true
  });

  let authUserId: string;
  let wasOrphanRepair = false;

  if (createErr) {
    // Case 3: the login already exists (e.g. an earlier attempt created the
    // login but failed before saving the profile) - find it and attach a
    // fresh profile instead of giving up.
    const existingAuthUser = await findAuthUserByEmail(emailFor(emp_id));
    if (!existingAuthUser) throw new Error(createErr.message);
    authUserId = existingAuthUser.id;
    wasOrphanRepair = true;
  } else {
    authUserId = created.user!.id;
  }

  const { error: profileErr } = await admin.from('profiles').insert({
    id: authUserId,
    emp_id,
    ...profileFields,
    is_active: true,
    must_reset_password: true
  });
  if (profileErr) throw new Error(profileErr.message);

  return { emp_id, name, action: wasOrphanRepair ? 'updated' : 'created' };
}

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const authHeader = req.headers.get('Authorization');

    const bootstrapOk = await isBootstrapAllowed();
    let callerId: string | null = null;
    if (!bootstrapOk) {
      callerId = await callerIsAdmin(authHeader);
      if (!callerId) {
        return new Response(JSON.stringify({ error: 'Not authorized' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    if (body.action === 'create') {
      const result = await createOneEmployee(body);
      const msg = result.action === 'updated'
        ? `Employee ${result.emp_id} already existed - details updated.`
        : `Employee created. Default password: ${DEFAULT_PASSWORD}`;
      return new Response(JSON.stringify({ message: msg, employee: result }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'bulk_create') {
      const created: string[] = [];
      const updated: string[] = [];
      const skipped: any[] = [];
      for (const row of body.rows || []) {
        try {
          const r = await createOneEmployee(row, { partial: true });
          if (r.action === 'updated') updated.push(r.emp_id);
          else created.push(r.emp_id);
        } catch (err) {
          skipped.push({ row, reason: (err as Error).message });
        }
      }
      return new Response(JSON.stringify({
        message: `${created.length} new employee(s) created, ${updated.length} existing employee(s) updated, ${skipped.length} skipped.`,
        default_password: DEFAULT_PASSWORD, created, updated, skipped
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'reset_password') {
      const { data: profile } = await admin.from('profiles').select('id, name').eq('id', body.profile_id).single();
      if (!profile) throw new Error('Employee not found');

      const { error } = await admin.auth.admin.updateUserById(profile.id, { password: DEFAULT_PASSWORD });
      if (error) throw new Error(error.message);

      await admin.from('profiles').update({ must_reset_password: true }).eq('id', profile.id);
      return new Response(JSON.stringify({ message: `Password reset to default (${DEFAULT_PASSWORD}) for ${profile.name}.` }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'delete_employee') {
      if (callerId && body.profile_id === callerId) throw new Error('You cannot delete your own admin account');
      const { data: profile } = await admin.from('profiles').select('id, name').eq('id', body.profile_id).single();
      if (!profile) throw new Error('Employee not found');

      // Deletes the login; profiles/attendance/regularization rows cascade
      // via the foreign keys set up in supabase/04_fixes.sql. Anyone who
      // reported to this person has reporting_manager_id cleared, not deleted.
      const { error } = await admin.auth.admin.deleteUser(profile.id);
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ message: `${profile.name} has been permanently removed.` }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
