import { supabase } from '../supabaseClient.js';
import { toError, friendlyError } from './errors.js';
import { APP_TZ, formatTime } from './time.js';

async function rpc(name, args) {
  let result;
  try {
    result = await supabase.rpc(name, args);
  } catch (err) {
    throw toError(err);
  }
  if (result.error) throw toError(result.error);
  return result.data;
}

// ---------- MY OWN attendance (never includes anyone else's rows) ----------
// These call SECURITY DEFINER functions that filter on auth.uid() on the
// server. Previously the app read the attendance table directly; for a
// manager, Row Level Security also returns their reports' rows, so an SBO's
// record was being shown as the manager's own (wrong status, disabled Login
// button, overlapping calendar).

// Returns { today: 'YYYY-MM-DD' (India date, from the server), record: row|null }
export async function getMyToday() {
  const data = await rpc('my_today');
  const record = data?.record ? withDuration(data.record) : null;
  return { today: data?.today, serverTime: data?.server_time, record };
}

export async function myAttendance({ from, to }) {
  const rows = await rpc('my_attendance', { p_from: from, p_to: to });
  return (rows || []).map(withDuration);
}

// ---------- Attendance actions ----------
export function markLogin(lat, lng, photoUrl) {
  return rpc('mark_login', { p_lat: lat, p_lng: lng, p_photo_url: photoUrl });
}

export function markLogout(lat, lng, photoUrl) {
  return rpc('mark_logout', { p_lat: lat, p_lng: lng, p_photo_url: photoUrl });
}

export function raiseRegularization(attDate, reason) {
  return rpc('raise_regularization', { p_att_date: attDate, p_reason: reason });
}

export async function completePasswordReset() {
  await rpc('complete_password_reset');
}

export function forwardRegularization(id) {
  return rpc('forward_regularization', { p_id: id });
}

export function decideRegularization(id, action, note) {
  return rpc('decide_regularization', { p_id: id, p_action: action, p_note: note || '' });
}

export function setEmployeeStatus(profileId, isActive) {
  return rpc('set_employee_status', { p_profile_id: profileId, p_is_active: isActive });
}

// ---------- Reads ----------
async function run(query) {
  let result;
  try {
    result = await query;
  } catch (err) {
    throw toError(err);
  }
  if (result.error) throw toError(result.error);
  return result;
}

export async function listEmployees() {
  const { data } = await run(supabase.from('profiles').select('*').order('name'));
  return data;
}

// A manager's direct reports only (explicit filter - never includes the
// manager themself, which RLS alone would).
export async function listMyTeam(managerId) {
  const { data } = await run(
    supabase.from('profiles').select('*').eq('reporting_manager_id', managerId).order('name')
  );
  return data;
}

export async function listPendingAdminRequests() {
  const { data } = await run(
    supabase
      .from('regularization_requests')
      .select('*, profiles!regularization_requests_profile_id_fkey(name, emp_id, reporting_manager_id)')
      .eq('status', 'pending_admin')
      .order('created_at', { ascending: true })
  );
  return data;
}

// Only requests assigned to THIS manager for a decision (RLS would also
// return the manager's own requests that are waiting on *their* manager).
export async function listPendingManagerRequests(managerId) {
  const { data } = await run(
    supabase
      .from('regularization_requests')
      .select('*, profiles!regularization_requests_profile_id_fkey(name, emp_id)')
      .eq('status', 'pending_manager')
      .eq('manager_id', managerId)
      .order('created_at', { ascending: true })
  );
  return data;
}

// Fetches ALL matching rows, page by page. Supabase silently caps every
// request at 1000 rows, so the old single request dropped records from
// exports once the table grew - people who were present showed up as absent.
export async function listAttendance({ profileId, excludeProfileId, from, to } = {}) {
  const PAGE = 1000;
  const all = [];
  let total = null;

  // Paged by ascending id: rows added while an export is running only ever
  // appear at the end, so nothing is skipped or duplicated. The offset
  // advances by the rows actually received, so a project whose max-rows is
  // set below 1000 is still read completely.
  for (let start = 0; ; ) {
    let query = supabase
      .from('attendance')
      .select('*, profiles!inner(name, emp_id, branch)', { count: start === 0 ? 'exact' : undefined })
      .order('id', { ascending: true })
      .range(start, start + PAGE - 1);
    if (profileId) query = query.eq('profile_id', profileId);
    if (excludeProfileId) query = query.neq('profile_id', excludeProfileId);
    if (from) query = query.gte('att_date', from);
    if (to) query = query.lte('att_date', to);

    const { data, count } = await run(query);
    if (start === 0) total = count;
    all.push(...data);
    start += data.length;

    if (data.length === 0) break;
    if (total != null && all.length >= total) break;
    if (total == null && data.length < PAGE) break;
  }

  // Newest day first, then by name.
  all.sort((a, b) =>
    String(b.att_date).localeCompare(String(a.att_date)) ||
    (a.profiles?.name || '').localeCompare(b.profiles?.name || '')
  );
  return all.map(withDuration);
}

function withDuration(r) {
  return { ...r, ...computeDuration(r.login_time, r.logout_time) };
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
export async function uploadSelfie(userId, blob, mode) {
  if (!userId) throw new Error('Your session has expired. Please sign in again.');
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${userId}/${mode}_${Date.now()}_${rand}.jpg`;

  let result;
  try {
    result = await supabase.storage.from('attendance-photos').upload(filename, blob, {
      contentType: 'image/jpeg',
      upsert: false
    });
  } catch (err) {
    throw new Error(`Photo upload failed: ${friendlyError(err)}`);
  }
  if (result.error) throw new Error(`Photo upload failed: ${friendlyError(result.error)}`);

  const { data } = supabase.storage.from('attendance-photos').getPublicUrl(filename);
  return data.publicUrl;
}

// ---------- Edge Function calls (the only pieces needing elevated privilege) ----------
async function callAdminFunction(body) {
  let data, error;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    ({ data, error } = await supabase.functions.invoke('admin-employees', {
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }));
  } catch (err) {
    throw toError(err);
  }

  if (error) {
    // supabase-js only gives a generic "non-2xx status code" message here -
    // the real error JSON is on error.context (a Response object).
    let detail = friendlyError(error);
    try {
      if (error.context && typeof error.context.json === 'function') {
        const payload = await error.context.json();
        if (payload?.error) detail = payload.error;
      }
    } catch (_) {
      // not JSON - keep the generic message
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

export function deleteEmployee(profileId) {
  return callAdminFunction({ action: 'delete_employee', profile_id: profileId });
}

// ---------- File download helper ----------
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Revoking immediately cancels the download in some browsers - wait.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
}

// ---------- CSV export ----------
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(rows, filename) {
  const sorted = [...rows].sort((a, b) =>
    (a.profiles?.name || '').localeCompare(b.profiles?.name || '') ||
    String(a.att_date).localeCompare(String(b.att_date))
  );

  const header = [
    'Name', 'Emp ID', 'Branch', 'Date', `Login Time (${APP_TZ})`, `Logout Time (${APP_TZ})`,
    'Hours Spent', 'Status', 'Login Lat', 'Login Lng', 'Logout Lat', 'Logout Lng',
    'Login Photo', 'Logout Photo'
  ];

  const lines = sorted.map((r) => [
    r.profiles?.name, r.profiles?.emp_id, r.profiles?.branch, r.att_date,
    r.login_time ? formatTime(r.login_time) : '',
    r.logout_time ? formatTime(r.logout_time) : '',
    r.duration_label || '', r.status,
    r.login_lat ?? '', r.login_lng ?? '', r.logout_lat ?? '', r.logout_lng ?? '',
    r.login_photo_url || '', r.logout_photo_url || ''
  ].map(csvCell).join(','));

  // BOM so Excel opens names with non-English characters correctly.
  const csv = '\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

// ---------- CSV parsing for bulk employee upload (handles quoted cells) ----------
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseEmployeeCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    return row;
  });
}
