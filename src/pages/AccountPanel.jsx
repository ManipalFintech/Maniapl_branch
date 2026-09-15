import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';

export default function AccountPanel({ onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg('');
    if (newPassword.length < 6) return setMsg('Password must be at least 6 characters');
    if (newPassword !== confirm) return setMsg('Passwords do not match');

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setMsg('Password updated.');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="block card">
      <h3>Change my password</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="action forward" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
          <button className="action" type="button" onClick={onClose}>Close</button>
        </div>
        {msg && <div className="form-note">{msg}</div>}
      </form>
    </section>
  );
}
