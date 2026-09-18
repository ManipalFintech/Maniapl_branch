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
async function
