import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import EmployeeApp from './pages/EmployeeApp.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import AccountPanel from './pages/AccountPanel.jsx';
import logo from './assets/logo.png';

function Shell() {
  const { session, profile, loading, logout } = useAuth();
  const [showAccount, setShowAccount] = useState(false);

  if (loading) return null;
  if (!session) return <Login />;
  if (!profile) return null; // profile still loading right after sign-in
  if (profile.must_reset_password) return <ResetPassword />;
  if (!profile.is_active) {
    logout();
    return <Login />;
  }

  if (profile.role === 'employee') return <EmployeeApp />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src={logo} alt="Manipal Fintech" className="brand-logo" />
        <h1>Attendance Console</h1>
        <p className="subtitle">{profile.role === 'admin' ? 'Admin view' : 'Manager view'}</p>
        <div className="who">
          {profile.name}<br />{profile.emp_id}<br />
          <button className="logout" onClick={() => setShowAccount(true)}>Change password</button>
          <button className="logout" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {showAccount && <AccountPanel onClose={() => setShowAccount(false)} />}
        {profile.role === 'admin' && <AdminDashboard />}
        {profile.role === 'manager' && <ManagerDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
