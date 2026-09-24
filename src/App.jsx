import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { IS_CONFIGURED } from './supabaseClient.js';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import EmployeeApp from './pages/EmployeeApp.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminGallery from './pages/AdminGallery.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import AccountPanel from './pages/AccountPanel.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import logo from './assets/logo.png';

function FullScreenMessage({ title, children, actions }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logo} alt="Manipal Fintech" className="brand-logo" />
        {title && <h1>{title}</h1>}
        {children && <div className="subtitle" style={{ lineHeight: 1.5 }}>{children}</div>}
        {actions}
      </div>
    </div>
  );
}

function Splash() {
  return <FullScreenMessage><span className="spinner" aria-hidden="true" /> Loading…</FullScreenMessage>;
}

function Shell() {
  const { session, authReady, profile, profileStatus, profileError, loadProfile, logout } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  const [managerTab, setManagerTab] = useState('mine'); // 'mine' | 'team'
  const [adminTab, setAdminTab] = useState('dashboard'); // 'dashboard' | 'gallery'

  // Reset per-user UI state when a different person signs in on this device.
  const userId = session?.user?.id;
  useEffect(() => {
    setShowAccount(false);
    setManagerTab('mine');
    setAdminTab('dashboard');
  }, [userId]);

  if (!IS_CONFIGURED) {
    return (
      <FullScreenMessage title="App not configured">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. Add them in Netlify → Site configuration →
        Environment variables, then redeploy.
      </FullScreenMessage>
    );
  }

  if (!authReady) return <Splash />;
  if (!session) return <Login />;
  if (profileStatus === 'idle' || profileStatus === 'loading') return <Splash />;

  if (profileStatus === 'error') {
    return (
      <FullScreenMessage
        title="Couldn’t load your account"
        actions={
          <>
            <button onClick={loadProfile}>Try again</button>
            <button type="button" className="bootstrap-link" onClick={logout}>Sign out</button>
          </>
        }
      >
        {profileError}
      </FullScreenMessage>
    );
  }

  if (profileStatus === 'missing' || !profile) {
    return (
      <FullScreenMessage
        title="No employee profile"
        actions={<button onClick={logout}>Sign out</button>}
      >
        This login isn’t linked to an employee profile. Ask Admin to add your Employee ID again.
      </FullScreenMessage>
    );
  }

  if (!profile.is_active) {
    return (
      <FullScreenMessage title="Account inactive" actions={<button onClick={logout}>Sign out</button>}>
        Your account ({profile.emp_id}) has been deactivated. Contact Admin to reactivate it.
      </FullScreenMessage>
    );
  }

  if (profile.must_reset_password) return <ResetPassword />;

  const isAdmin = profile.role === 'admin';
  const isManager = profile.role === 'manager';

  // Anyone who is not an admin or manager (including a mistyped role) gets the
  // employee screen instead of an empty console.
  if (!isAdmin && !isManager) return <EmployeeApp />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src={logo} alt="Manipal Fintech" className="brand-logo" />
        <h1>Attendance Console</h1>
        <p className="subtitle">{isAdmin ? 'Admin view' : 'Manager view'}</p>
        <div className="who">
          {profile.name}<br />{profile.emp_id}<br />
          <button className="logout" onClick={() => setShowAccount(true)}>Change password</button>
          <button className="logout" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {showAccount && <AccountPanel onClose={() => setShowAccount(false)} />}

        {isAdmin && (
          <>
            <div className="tabs">
              <button className={`tab ${adminTab === 'dashboard' ? 'active' : ''}`} onClick={() => setAdminTab('dashboard')}>
                Dashboard
              </button>
              <button className={`tab ${adminTab === 'gallery' ? 'active' : ''}`} onClick={() => setAdminTab('gallery')}>
                Attendance Gallery
              </button>
            </div>
            {adminTab === 'dashboard' ? <AdminDashboard /> : <AdminGallery />}
          </>
        )}

        {isManager && (
          <>
            <div className="tabs">
              <button className={`tab ${managerTab === 'mine' ? 'active' : ''}`} onClick={() => setManagerTab('mine')}>
                My Attendance
              </button>
              <button className={`tab ${managerTab === 'team' ? 'active' : ''}`} onClick={() => setManagerTab('team')}>
                Team Dashboard
              </button>
            </div>
            {managerTab === 'mine' ? <EmployeeApp key={`mine-${profile.id}`} embedded /> : <ManagerDashboard key={`team-${profile.id}`} />}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UpdateBanner />
      <Shell />
    </AuthProvider>
  );
}
