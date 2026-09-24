import React, { useState } from 'react';
import { supabase, emailForEmpId } from '../supabaseClient.js';
import { createEmployee } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import logo from '../assets/logo.png';

// Previously EVERY sign-in failure was shown as "Invalid Employee ID or
// password" - including Supabase's per-network rate limit, which trips when
// a whole branch signs in from the same office Wi-Fi at 9:30. Staff with the
// right password were told it was wrong and believed they were locked out.
function signInMessage(err) {
  const msg = err?.message || '';
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) {
    return 'Too many sign-in attempts from this network right now. Wait 2–3 minutes and try again - your password is not the problem.';
  }
  if (err?.code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Invalid Employee ID or password';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'This login is not activated yet. Ask Admin to re-save your employee record.';
  }
  return friendlyError(err);
}

export default function Login() {
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bForm, setBForm] = useState({ emp_id: '', name: '' });
  const [bMsg, setBMsg] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!empId.trim() || !password) {
      setError('Enter your Employee ID and password');
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailForEmpId(empId),
        password
      });
      if (signInError) throw new Error(signInMessage(signInError));
      // AuthContext picks up the session change automatically.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBootstrap(e) {
    e.preventDefault();
    setBMsg('');
    try {
      const res = await createEmployee({ ...bForm, role: 'admin' });
      setBMsg(`${res.message} — you can now log in with Emp ID "${bForm.emp_id}".`);
    } catch (err) {
      setBMsg(err.message);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleLogin}>
        <img src={logo} alt="Manipal Fintech" className="brand-logo" />
        <h1>Branch Attendance</h1>
        <p className="subtitle">Sign in with your Employee ID</p>

        <input placeholder="Employee ID" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={empId}
          onChange={(e) => setEmpId(e.target.value)} />
        <input type="password" placeholder="Password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="error-text">{error}</div>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>

        <button type="button" className="bootstrap-link" onClick={() => setShowBootstrap(!showBootstrap)}>
          First time setting this up? Create the first Admin
        </button>

        {showBootstrap && (
          <div className="bootstrap-note">
            <p style={{ marginTop: 0 }}>
              This only works once — before any Admin account exists. After that,
              new employees are added from inside the Admin dashboard.
            </p>
            <input placeholder="Admin Emp ID (e.g. ADMIN001)" value={bForm.emp_id}
              onChange={(e) => setBForm({ ...bForm, emp_id: e.target.value })} />
            <input placeholder="Admin full name" value={bForm.name}
              onChange={(e) => setBForm({ ...bForm, name: e.target.value })} />
            <button type="button" onClick={handleBootstrap}>Create first Admin</button>
            {bMsg && <p style={{ fontSize: 12, marginTop: 10 }}>{bMsg}</p>}
          </div>
        )}
      </form>
    </div>
  );
}
