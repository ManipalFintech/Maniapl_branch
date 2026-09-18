import { supabase } from '../supabaseClient.js';

// ---------- Attendance actions (Postgres functions - see supabase/02_functions.sql) ----------
export async function markLogin(lat, lng, photoUrl) {
  const { data, error } = await supabase.rpc('mark_login', { p_lat: lat, p_lng: lng, p_photo_url: photoUrl });
  if (error) throw new Error(error.message);
  return data;
}

export async function markLogout(lat, lng, photoUrl) {
  const { data, error } = await supabase.rpc('mark_logout', { p_lat: lat, p_lng: lng, p_photo_url: photoUrl });
  if (error) throw new Error(error.message);
  return data;
}

export async function raiseRegularization(attDate, reason) {
  const { data, error } = await supabase.rpc('raise_regularization', { p_att_date: attDate, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}

export async function completePasswordReset() {
  const { error } = await supabase.rpc('complete_password_reset');
  if (error) throw new Error(error.message);
}

export async function forwardRegularization(id) {
  const { data, error } = await supabase.rpc('forward_regularization', { p_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function decideRegularization(id, action, note) {
  const { data, error } = await supabase.rpc('decide_regularization', { p_id: id, p_action: action, p_note: note || '' });
  if (error) throw new Error(error.message);
  return data;
}

export async function setEmployeeStatus(profileId, isActive) {
  const { data, error } = await supabase.rpc('set_employee_status', { p_profile_id: profileId, p_is_active: isActive });
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Reads (plain selects - Row Level Security enforces who sees what) ----------
export async function listEmployees() {
  const { data, error } = await supabase.from('profiles').select('*').order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingAdminRequests() {
  const { data, error } = await supabase
    .from('regularization_requests')
    .select('*, profiles!regularization_requests_profile_id_fkey(name, emp_id, reporting_manager_id)')
    .eq('status', 'pending_admin')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingManagerRequests() {
  const { data, error } = await supabase
    .from('regularization_requests')
    .select('*, profiles!regularization_requests_profile_id_fkey(name, emp_id)')
    .eq('status', 'pending_manager')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function listAttendance({ profileId, from, to } = {}) {
  let query = supabase
    .from('attendance')
    .select('*, profiles!inner(name, emp_id)')
    .order('att_date', { ascending: false });
  if (profileId) query = query.eq('profile_id', profileId);
  if (from) query = query.gte('att_date', from);
  if (to) query = query.lte('att_date', to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map((r) => ({ ...r, ...computeDuration(r.login_time, r.logout_time) }));
}

export async function myAttendance({ from, to } = {}) {
  let query = supabase.from('attendance').select('*').order('att_date', { ascending: true });
  if (from) query = query.gte('att_date', from);
  if (to) query = query.lte('att_date', to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map((r) => ({ ...r, ...computeDuration(r.login_time, r.logout_time) }));
}

export function computeDuration(loginTime, logoutTime) {
  if (!loginTime || !logoutTime) return { duration_minutes: null, duration_label: null };
  const ms = new Date(logoutTime) - new Date(loginTime);
  if (ms < 0) return { duration_minutes: null, duration_label: null };
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { duration_minutes: minutes, duration_label: `${h}h ${m}m` };
}

// ---------- Photo upload (straight to Supabase Storage from the browser) ----------
export async function uploadSelfie(blob, mode) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user.id;
  const filename = `${uid}/${mode}_${Date.now()}.jpg`;

  const { error } = await supabase.storage.from('attendance-photos').upload(filename, blob, {
    contentType: 'image/jpeg',
    upsert: false
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('attendance-photos').getPublicUrl(filename);
  return data.publicUrl;
}

// ---------- Edge Function calls (the only pieces needing elevated privilege) ----------
async function callAdminFunction(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke('admin-employees', {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

  if (error) {
    // supabase-js only gives a generic "non-2xx status code" message here -
    // the actual error JSON the function sent back is on error.context (a
    // Response object). Read it directly so real errors are visible.
    let detail = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) detail = body.error;
      }
    } catch (_) {
      // context wasn't valid JSON - fall back to the generic message
    }
    throw new Error(detail);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

export function createEmployee(employee) {
  return callAdminFunction({ action: 'create', ...employee });
}

export function bulkCreateEmployees(rows) {
  return callAdminFunction({ action: 'bulk_create', rows });
}

export function resetEmployeePassword(profileId) {
  return callAdminFunction({ action: 'reset_password', profile_id: profileId });
}

// ---------- CSV export (built client-side, downloaded as a file) ----------
export function downloadCsv(rows, filename) {
  const header = 'Name,Emp ID,Date,Login Time,Logout Time,Hours Spent,Status\n';
  const body = rows.map((r) => [
    r.profiles?.name || '', r.profiles?.emp_id || '', r.att_date,
    r.login_time || '', r.logout_time || '', r.duration_label || '', r.status
  ].join(',')).join('\n');

  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Minimal CSV parsing for bulk employee upload (no dependency) ----------
export function parseEmployeeCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    return row;
  });
}
