import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import * as api from '../lib/api.js';
import { currentMonthDate, formatIsoDateLong, formatTime, monthLabel, monthRange, todayIso } from '../lib/time.js';

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function EmployeeApp({ embedded = false }) {
  const { profile, logout } = useAuth();
  const [view, setView] = useState('home'); // home | camera | confirm | success | calendar | regularize

  // Today's status always comes from the server (my_today), filtered to the
  // signed-in person only, using the India date.
  const [today, setToday] = useState({ status: 'loading', date: null, record: null, error: '' });

  const [mode, setMode] = useState('login'); // login | logout
  const [captured, setCaptured] = useState(null); // { blob, previewUrl, lat, lng }
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); // { mode, time, already }

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Every status request gets a sequence number; a response is applied only
  // if no newer request has been started. This stops a slow background
  // refresh (started before a login was saved) from overwriting the freshly
  // confirmed status and flipping the screen back to "Not logged in".
  const seqRef = useRef(0);

  const fetchToday = useCallback(async () => {
    const seq = ++seqRef.current;
    const res = await api.getMyToday();
    const isLatest = seq === seqRef.current;
    if (isLatest && mountedRef.current) {
      setToday({ status: 'ready', date: res.today, record: res.record, error: '' });
    }
    return res;
  }, []);

  const refreshToday = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setToday((t) => ({ ...t, status: 'loading', error: '' }));
    const seq = seqRef.current + 1;
    try {
      return await fetchToday();
    } catch (err) {
      if (mountedRef.current && !silent && seq === seqRef.current) {
        setToday((t) => ({ ...t, status: 'error', error: err.message }));
      }
      return null;
    }
  }, [fetchToday]);

  useEffect(() => { refreshToday(); }, [refreshToday]);

  // Re-check when the app comes back to the foreground and every few minutes,
  // so a tab left open overnight never shows yesterday's status as today's.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshToday({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(() => refreshToday({ silent: true }), RESYNC_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, [refreshToday]);

  // Success screen returns home on its own.
  useEffect(() => {
    if (view !== 'success') return undefined;
    const t = setTimeout(() => setView('home'), 2500);
    return () => clearTimeout(t);
  }, [view]);

  // Free the photo preview memory when it's no longer shown.
  useEffect(() => () => { if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl); }, [captured]);

  const record = today.record;
  const ready = today.status === 'ready';
  const hasLogin = !!record?.login_time;
  const hasLogout = !!record?.logout_time;

  function openCamera(m) {
    setMode(m);
    setSubmitError('');
    setView('camera');
  }

  function handleCaptured(blob, lat, lng) {
    setCaptured({ blob, previewUrl: URL.createObjectURL(blob), lat, lng });
    setView('confirm');
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const photoUrl = await api.uploadSelfie(profile.id, captured.blob, mode);

      let actionError = null;
      try {
        if (mode === 'login') await api.markLogin(captured.lat, captured.lng, photoUrl);
        else await api.markLogout(captured.lat, captured.lng, photoUrl);
      } catch (err) {
        actionError = err;
      }

      // Read the record back from the server. Success is ONLY shown once the
      // saved record is confirmed - never just because the button was tapped.
      let check;
      try {
        check = await fetchToday();
      } catch (err) {
        throw new Error(
          actionError
            ? actionError.message
            : 'Could not confirm your attendance with the server. Check your connection, then tap Submit again - it will not create a duplicate.'
        );
      }
      const saved = mode === 'login' ? check.record?.login_time : check.record?.logout_time;
      if (!saved) {
        throw actionError || new Error('Your attendance was not saved. Please try again.');
      }

      setSuccess({ mode, time: saved, already: !!actionError });
      setCaptured(null);
      setView('success');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (view === 'camera') {
    return <CameraCapture mode={mode} onCapture={handleCaptured} onCancel={() => setView('home')} />;
  }

  if (view === 'confirm' && captured) {
    return (
      <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`}>
        <img src={captured.previewUrl} className="confirm-photo" alt="Captured selfie" />
        <div className="confirm-detail">
          <div className="confirm-row"><span className="label">Employee</span><span>{profile.name} ({profile.emp_id})</span></div>
          <div className="confirm-row"><span className="label">Action</span><span>{mode === 'login' ? 'Login' : 'Logout'}</span></div>
          <div className="confirm-row"><span className="label">Time</span><span>{formatTime(new Date())}</span></div>
          <div className="confirm-row"><span className="label">Location</span><span>{captured.lat.toFixed(5)}, {captured.lng.toFixed(5)}</span></div>
        </div>
        {submitError && <div className="error-text error-block">{submitError}</div>}
        <button className="emp-action-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : `Submit ${mode === 'login' ? 'Login' : 'Logout'}`}
        </button>
        <button className="emp-link-btn" onClick={() => setView('camera')} disabled={submitting}>Retake photo</button>
        <button className="emp-link-btn" onClick={() => { setCaptured(null); setView('home'); }} disabled={submitting}>Cancel</button>
      </div>
    );
  }

  if (view === 'success' && success) {
    const label = success.mode === 'login' ? 'Login' : 'Logout';
    return (
      <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`} style={{ textAlign: 'center', paddingTop: embedded ? 40 : 120 }}>
        <div className="success-tick">✓</div>
        <div style={{ fontWeight: 600 }}>
          {success.already ? `${label} was already recorded` : `${label} saved`} at {formatTime(success.time)}
        </div>
        <p className="form-note">Confirmed on the server for {formatIsoDateLong(today.date)}.</p>
        <button className="emp-link-btn" onClick={() => setView('home')}>Done</button>
      </div>
    );
  }

  if (view === 'calendar') return <MyCalendar embedded={embedded} profileId={profile.id} onBack={() => setView('home')} />;
  if (view === 'regularize') {
    return (
      <RegularizeForm
        embedded={embedded}
        attDate={record?.att_date}
        onDone={() => { setView('home'); refreshToday({ silent: true }); }}
      />
    );
  }

  let statusText;
  if (today.status === 'loading' && !record) statusText = 'Checking today’s attendance…';
  else if (today.status === 'error') statusText = null;
  else if (!hasLogin) statusText = 'Not logged in yet today';
  else if (!hasLogout) statusText = `Logged in at ${formatTime(record.login_time)}`;
  else statusText = `Logged in ${formatTime(record.login_time)} · Logged out ${formatTime(record.logout_time)} · ${record.duration_label || ''}`;

  return (
    <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`}>
      <div className="emp-header">
        <div>
          <p className="emp-greeting">Hi, {profile.name}</p>
          <p className="emp-date">{formatIsoDateLong(today.date || todayIso())}</p>
        </div>
        {!embedded && <button className="emp-signout" onClick={logout}>Sign out</button>}
      </div>

      <div className={`status-box ${hasLogin ? 'status-box-done' : ''}`}>
        {today.status === 'error' ? (
          <>
            <div className="error-text" style={{ margin: 0 }}>Couldn’t load today’s attendance: {today.error}</div>
            <button className="action" style={{ marginTop: 10 }} onClick={() => refreshToday()}>Try again</button>
          </>
        ) : statusText}
      </div>

      <button className="emp-action-btn" disabled={!ready || hasLogin} onClick={() => openCamera('login')}>
        {hasLogin ? `Login marked · ${formatTime(record.login_time)}` : 'Mark Login'}
      </button>
      <button className="emp-action-btn" disabled={!ready || !hasLogin || hasLogout} onClick={() => openCamera('logout')}>
        {hasLogout ? `Logout marked · ${formatTime(record.logout_time)}` : 'Mark Logout'}
      </button>

      {ready && hasLogout && record.status !== 'regularized' && (
        <button className="emp-link-btn" onClick={() => setView('regularize')}>
          Raise request (logged out by mistake)
        </button>
      )}
      <button className="emp-link-btn" onClick={() => setView('calendar')}>My attendance (calendar &amp; hours)</button>
    </div>
  );
}

function MyCalendar({ onBack, profileId, embedded }) {
  const [month, setMonth] = useState(currentMonthDate());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const { from, to } = monthRange(month);
    setLoading(true);
    setError('');
    api.myAttendance({ from, to })
      .then((rows) => { if (active) setRecords(rows); })
      .catch((err) => { if (active) { setRecords([]); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  return (
    <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`}>
      <div className="form-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="action" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ Prev</button>
        <strong>{monthLabel(month)}</strong>
        <button className="action" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next ›</button>
      </div>
      {error && <div className="error-text">{error}</div>}
      {loading ? <div className="empty">Loading…</div> : <AttendanceCalendar records={records} month={month} profileId={profileId} />}
      <button className="emp-link-btn" onClick={onBack}>Back to home</button>
    </div>
  );
}

function RegularizeForm({ attDate, onDone, embedded }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!reason.trim()) return setError('Enter a reason for the request');
    setBusy(true);
    setError('');
    try {
      await api.raiseRegularization(attDate, reason.trim());
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`}>
        <div className="status-box status-box-done">Request submitted for {formatIsoDateLong(attDate)}. It is now waiting for Admin review.</div>
        <button className="emp-action-btn" onClick={onDone}>Back to home</button>
      </div>
    );
  }

  return (
    <div className={`emp-shell ${embedded ? 'emp-shell-embedded' : ''}`}>
      <h2 style={{ fontSize: 19 }}>Raise regularization request</h2>
      <p style={{ color: '#5B6B7D', fontSize: 13 }}>
        For {formatIsoDateLong(attDate)}. Use this if you logged out by mistake in the middle of the day.
      </p>
      <textarea
        placeholder="Reason (e.g. accidentally tapped logout)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ width: '100%', height: 90, padding: 12, borderRadius: 8, border: '1px solid #DCE2EA', fontSize: 14, marginBottom: 12 }}
      />
      {error && <div className="error-text">{error}</div>}
      <button className="emp-action-btn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
      <button className="emp-link-btn" onClick={onDone} disabled={busy}>Cancel</button>
    </div>
  );
}
