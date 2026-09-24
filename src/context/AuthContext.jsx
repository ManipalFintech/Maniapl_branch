import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { friendlyError } from '../lib/errors.js';

const AuthContext = createContext(null);

function normalizeProfile(p) {
  return { ...p, role: (p.role || 'employee').toLowerCase().trim() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState(null);
  // idle | loading | ready | error | missing
  const [profileStatus, setProfileStatus] = useState('idle');
  const [profileError, setProfileError] = useState('');

  const userId = session?.user?.id ?? null;
  const currentUserRef = useRef(null);

  // ---- Session tracking ----
  // IMPORTANT: this callback must stay synchronous and must NOT call any other
  // supabase method. Awaiting a Supabase call in here deadlocks supabase-js
  // during token refresh (every hour / when a phone wakes the tab) - every
  // later request then hangs forever, which is what looked like users being
  // "locked out". Profile loading happens in a separate effect below.
  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setAuthReady(true);
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession((prev) => prev ?? data.session);
      })
      .catch(() => { /* treated as signed out; Login screen is shown */ })
      .finally(() => { if (active) setAuthReady(true); });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ---- Profile loading (only when the signed-in USER changes, not on every
  // token refresh), with automatic retries for flaky mobile networks ----
  const loadProfile = useCallback(async () => {
    const uid = currentUserRef.current;
    if (!uid) return null;

    setProfileError('');
    setProfileStatus((s) => (s === 'ready' ? 'ready' : 'loading'));

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(800 * attempt);
      let data = null;
      let error = null;
      try {
        ({ data, error } = await supabase.rpc('my_profile'));
      } catch (err) {
        error = err;
      }
      if (currentUserRef.current !== uid) return null; // user switched meanwhile

      if (!error) {
        if (!data || !data.id) {
          setProfile(null);
          setProfileStatus('missing');
          return null;
        }
        const p = normalizeProfile(data);
        setProfile(p);
        setProfileStatus('ready');
        return p;
      }
      lastError = error;
    }

    setProfileError(friendlyError(lastError));
    setProfileStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    return null;
  }, []);

  useEffect(() => {
    currentUserRef.current = userId;
    if (!userId) {
      setProfile(null);
      setProfileStatus('idle');
      setProfileError('');
      return;
    }
    setProfile(null);
    setProfileStatus('loading');
    loadProfile();
  }, [userId, loadProfile]);

  // Sign out of THIS device only. The previous default (global) revoked the
  // person's session on every other phone/computer too, kicking them out
  // there without warning.
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (_) {
      // even if the network call fails, clear the local session below
    }
    setSession(null);
    setProfile(null);
    setProfileStatus('idle');
  }, []);

  return (
    <AuthContext.Provider value={{ session, authReady, profile, profileStatus, profileError, loadProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
