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

async function callerIsAdmin(authHeader: string | null) {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return false;
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  return profile?.role === 'admin';
}

async function createOneEmployee(row: any) {
  const { emp_id, name, role, reporting_manager_id, branch } = row;
  if (!emp_id || !name) throw new Error('emp_id and name are required');

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailFor(emp_id),
    password: DEFAULT_PASSWORD,
    email_confirm: true
  });
  if (createErr) throw new Error(createErr.message);

  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user!.id,
    emp_id,
    name,
    role: role || 'employee',
    reporting_manager_id: reporting_manager_id || null,
    branch: branch || 'main',
    is_active: true,
    must_reset_password: true
  });
  if (profileErr) throw new Error(profileErr.message);

  return { emp_id, name };
}

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const authHeader = req.headers.get('Authorization');

    const bootstrapOk = await isBootstrapAllowed();
    if (!bootstrapOk) {
      const ok = await callerIsAdmin(authHeader);
      if (!ok) {
        return new Response(JSON.stringify({ error: 'Not authorized' }), {
          status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    if (body.action === 'create') {
      const result = await createOneEmployee(body);
      return new Response(JSON.stringify({ message: `Employee created. Default password: ${DEFAULT_PASSWORD}`, employee: result }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (body.action === 'bulk_create') {
      const created: string[] = [];
      const skipped: any[] = [];
      for (const row of body.rows || []) {
        try {
          const r = await createOneEmployee(row);
          created.push(r.emp_id);
        } catch (err) {
          skipped.push({ row, reason: (err as Error).message });
        }
      }
      return new Response(JSON.stringify({
        message: `${created.length} employee(s) created, ${skipped.length} skipped.`,
        default_password: DEFAULT_PASSWORD, created, skipped
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

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
