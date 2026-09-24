import React, { useEffect, useState } from 'react';

/* global __BUILD_ID__ */
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null;
const CHECK_EVERY_MS = 10 * 60 * 1000;

async function latestBuild() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return null; // dev server / missing file
  const body = await res.json();
  return body?.build || null;
}

// Shows a reload bar when a newer version of the app has been deployed.
export default function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD || import.meta.env.DEV) return undefined;
    let stopped = false;

    async function check() {
      try {
        const latest = await latestBuild();
        if (!stopped && latest && latest !== CURRENT_BUILD) setOutdated(true);
      } catch (_) {
        // offline or blocked - try again later
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of the attendance app is available.</span>
      <button onClick={() => window.location.reload()}>Reload now</button>
    </div>
  );
}
