import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { completePasswordReset } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ResetPassword() {
  const { loadProfile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleUpdate(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) return setError('Password must be at least 6 characters');
    if (newPassword !== confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw new Error(updateErr.message);
      await completePasswordReset();
      await loadProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleUpdate}>
        <h1>Set a new password</h1>
        <p className="subtitle">This is your first login. Please choose a new password.</p>

        <input type="password" placeholder="New password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} />
        <input type="password" placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />

        {error && <div className="error-text">{error}</div>}
        <button disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  );
}
