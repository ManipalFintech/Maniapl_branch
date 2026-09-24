// All dates/times in the app are shown in the company's time zone (India),
// regardless of what time zone the viewer's device is set to. This must
// match app_timezone() in supabase/05_bugfixes.sql.
export const APP_TZ = import.meta.env.VITE_APP_TIMEZONE || 'Asia/Kolkata';

export function pad(n) {
  return String(n).padStart(2, '0');
}

// YYYY-MM-DD for "today" in the company time zone.
export function todayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// A plain local Date set to the 1st of the current company-time-zone month.
// Only year/month are used from it (for calendar navigation).
export function currentMonthDate() {
  const [y, m] = todayIso().split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function monthRange(monthDate) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` };
}

export function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: APP_TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

// "2026-09-23" -> "Wednesday, 23 September 2026" (no time-zone shifting: the
// string is already a calendar date).
export function formatIsoDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

export function monthLabel(monthDate) {
  return monthDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
