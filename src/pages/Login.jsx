import React, { useState } from 'react';
import { supabase, emailForEmpId } from '../supabaseClient.js';
import { createEmployee } from '../lib/api.js';
import logo from '../assets/logo.png';

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
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailForEmpId(empId),
        password
      });
      if (signInError) throw new Error('Invalid Employee ID or password');
      // AuthContext picks up the session change automatically.
    } catch (err) {
      setError(err.message);
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

        <input placeholder="Employee ID" autoCapitalize="none" value={empId}
          onChange={(e) => setEmpId(e.target.value)} />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="error-text">{error}</div>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" onClick={() => setShowBootstrap(!showBootstrap)}
            style={{ background: 'none', border: 'none', color: '#5B6B7D', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            First time setting this up? Create the first Admin
          </button>
        </div>

        {showBootstrap && (
          <div className="bootstrap-note">
            <p style={{ marginTop: 0 }}>
              This only works once — before any Admin account exists. After that,
              new employees are added from inside the Admin dashboard.
            </p>
            <input placeholder="Admin Emp ID (e.g. ADMIN001)" value={bForm.emp_id}
              onChange={(e) => setBForm({ ...bForm, emp_id: e.target.value })}
              style={{ marginBottom: 8, width: '100%', padding: 8, borderRadius: 4, border: '1px solid #DCE2EA' }} />
            <input placeholder="Admin full name" value={bForm.name}
              onChange={(e) => setBForm({ ...bForm, name: e.target.value })}
              style={{ marginBottom: 8, width: '100%', padding: 8, borderRadius: 4, border: '1px solid #DCE2EA' }} />
            <button type="button" onClick={handleBootstrap}
              style={{ width: '100%', padding: 10, background: '#0C4A85', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Create first Admin
            </button>
            {bMsg && <p style={{ fontSize: 12, marginTop: 8 }}>{bMsg}</p>}
          </div>
        )}
      </form>
    </div>
  );
}
