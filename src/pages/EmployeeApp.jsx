import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import * as api from '../lib/api.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function pad(n) { return String(n).padStart(2, '0'); }

export default function EmployeeApp() {
  const { profile, logout } = useAuth();
  const [view, setView] = useState('home'); // home | camera | confirm | success | calendar | regularize
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login'); // login | logout
  const [captured, setCaptured] = useState(null); // { blob, previewUrl, lat, lng }
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.myAttendance({ from: todayIso(), to: todayIso() });
      setToday(rows[0] || null);
    } catch (err) {
      // ignore - treat as no record yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  const hasLogin = !!today?.login_time;
  const hasLogout = !!today?.logout_time;

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
      const photoUrl = await api.uploadSelfie(captured.blob, mode);
      if (mode === 'login') await api.markLogin(captured.lat, captured.lng, photoUrl);
      else await api.markLogout(captured.lat, captured.lng, photoUrl);
      setView('success');
      loadToday();
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
      <div className="emp-shell">
        <img src={captured.previewUrl} className="confirm-photo" alt="captured selfie" />
        <div className="confirm-detail">
          <div className="confirm-row"><span className="label">Employee</span><span>{profile.name} ({profile.emp_id})</span></div>
          <div className="confirm-row"><span className="label">Action</span><span>{mode === 'login' ? 'Login' : 'Logout'}</span></div>
          <div className="confirm-row"><span className="label">Time</span><span>{new Date().toLocaleString()}</span></div>
          <div className="confirm-row"><span className="label">Location</span><span>{captured.lat.toFixed(5)}, {captured.lng.toFixed(5)}</span></div>
        </div>
        {submitError && <div className="error-text">{submitError}</div>}
        <button className="emp-action-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        <button className="emp-link-btn" onClick={() => setView('camera')} disabled={submitting}>Retake</button>
      </div>
    );
  }

  if (view === 'success') {
    setTimeout(() => setView('home'), 1600);
    return (
      <div className="emp-shell" style={{ textAlign: 'center', paddingTop: 120 }}>
        <div style={{
          width: 84, height: 84, borderRadius: 42, background: '#3F7A5C', color: 'white',
          fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
        }}>✓</div>
        <div style={{ fontWeight: 600 }}>{mode === 'login' ? 'Login' : 'Logout'} marked successfully</div>
      </div>
    );
  }

  if (view === 'calendar') return <MyCalendar onBack={() => setView('home')} />;
  if (view === 'regularize') return <RegularizeForm attDate={today?.att_date} onDone={() => { setView('home'); loadToday(); }} />;

  return (
    <div className="emp-shell">
      <div className="emp-header">
        <div>
          <p className="emp-greeting">Hi, {profile.name}</p>
          <p className="emp-date">{new Date().toDateString()}</p>
        </div>
        <button className="emp-signout" onClick={logout}>Sign out</button>
      </div>

      <div className="status-box">
        {loading ? 'Loading…' :
          !hasLogin ? 'Not logged in yet' :
          !hasLogout ? `Logged in at ${new Date(today.login_time).toLocaleTimeString()}` :
          `Logged in ${new Date(today.login_time).toLocaleTimeString()} · Logged out ${new Date(today.logout_time).toLocaleTimeString()}`}
      </div>

      <button className="emp-action-btn" disabled={hasLogin} onClick={() => openCamera('login')}>Mark Login</button>
      <button className="emp-action-btn" disabled={!hasLogin || hasLogout} onClick={() => openCamera('logout')}>Mark Logout</button>

      {hasLogout && (
        <button className="emp-link-btn" onClick={() => setView('regularize')}>
          Raise Request (mistaken logout)
        </button>
      )}
      <button className="emp-link-btn" onClick={() => setView('calendar')}>My Attendance (calendar &amp; hours)</button>
    </div>
  );
}

function MyCalendar({ onBack }) {
  const [month, setMonth] = useState(new Date());
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const from = `${y}-${pad(m + 1)}-01`;
    const to = `${y}-${pad(m + 1)}-31`;
    api.myAttendance({ from, to }).then(setRecords).catch(() => setRecords([]));
  }, [month]);

  return (
    <div className="emp-shell">
      <div className="form-row" style={{ justifyContent: 'space-between' }}>
        <button className="action" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ Prev</button>
        <strong>{month.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
        <button className="action" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next ›</button>
      </div>
      <AttendanceCalendar records={records} month={month} />
      <button className="emp-link-btn" onClick={onBack}>Back to Home</button>
    </div>
  );
}

function RegularizeForm({ attDate, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return setError('Please enter a reason');
    setBusy(true);
    setError('');
    try {
      await api.raiseRegularization(attDate, reason.trim());
      alert('Request submitted, pending admin review.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="emp-shell">
      <h2 style={{ fontSize: 19 }}>Raise Regularization Request</h2>
      <p style={{ color: '#5B6B7D', fontSize: 13 }}>
        For {attDate}. Use this if you logged out by mistake in the middle of the day.
      </p>
      <textarea
        placeholder="Reason (e.g. accidentally tapped logout)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ width: '100%', height: 90, padding: 12, borderRadius: 8, border: '1px solid #DCE2EA', fontSize: 14, marginBottom: 12 }}
      />
      {error && <div className="error-text">{error}</div>}
      <button className="emp-action-btn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
      <button className="emp-link-btn" onClick={onDone}>Cancel</button>
    </div>
  );
}
