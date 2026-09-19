import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import * as api from '../lib/api.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function pad(n) { return String(n).padStart(2, '0'); }

function mapLink(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function AdminGallery() {
  const [mode, setMode] = useState('day'); // 'day' | 'month'
  const [day, setDay] = useState(todayIso());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
  const [search, setSearch] = useState('');

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  const { from, to } = useMemo(() => {
    if (mode === 'day') return { from: day, to: day };
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` };
  }, [mode, day, month]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.listAttendance({ from, to })
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) => r.profiles.name.toLowerCase().includes(q) || r.profiles.emp_id.toLowerCase().includes(q)
    );
  }, [records, search]);

  const photoCount = filtered.reduce((n, r) => n + (r.login_photo_url ? 1 : 0) + (r.logout_photo_url ? 1 : 0), 0);

  async function handleDownloadZip() {
    if (photoCount === 0) return;
    setZipping(true);
    const zip = new JSZip();
    let done = 0;

    for (const r of filtered) {
      const folder = zip.folder(`${r.profiles.name} (${r.profiles.emp_id})`);
      const jobs = [];
      if (r.login_photo_url) jobs.push({ url: r.login_photo_url, filename: `${r.att_date}_login.jpg` });
      if (r.logout_photo_url) jobs.push({ url: r.logout_photo_url, filename: `${r.att_date}_logout.jpg` });

      for (const job of jobs) {
        try {
          setZipProgress(`Downloading photo ${done + 1} of ${photoCount}…`);
          const res = await fetch(job.url);
          const blob = await res.blob();
          folder.file(job.filename, blob);
        } catch (err) {
          // skip a photo that fails to fetch rather than aborting the whole zip
        }
        done += 1;
      }
    }

    setZipProgress('Packaging ZIP file…');
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'day' ? `attendance_photos_${day}.zip` : `attendance_photos_${month}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setZipping(false);
    setZipProgress('');
  }

  return (
    <>
      <h2>Attendance Gallery</h2>
      <p className="lede">
        Browse every login/logout selfie across the branch. Filter by day or month, search by
        employee, and download everything you're viewing as one ZIP file.
      </p>
      {error && <div className="error-text">{error}</div>}

      <section className="block card">
        <div className="form-row" style={{ alignItems: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button className={`tab ${mode === 'day' ? 'active' : ''}`} onClick={() => setMode('day')}>Day</button>
            <button className={`tab ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>Month</button>
          </div>

          {mode === 'day' ? (
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          ) : (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          )}

          <input
            className="emp-selector-search"
            placeholder="Search by name or Emp ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button className="action forward" onClick={handleDownloadZip} disabled={zipping || photoCount === 0}>
            {zipping ? (zipProgress || 'Preparing…') : `Download all as ZIP (${photoCount} photo${photoCount === 1 ? '' : 's'})`}
          </button>
        </div>
      </section>

      <section className="block card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No attendance records match this filter.</div>
        ) : (
          <div className="gallery-grid">
            {filtered.map((r) => (
              <div key={r.id} className="gallery-card">
                <div className="gallery-card-header">
                  <strong>{r.profiles.name}</strong>
                  <span className="mono">{r.profiles.emp_id}</span>
                </div>
                <div className="gallery-card-date mono">{r.att_date}</div>

                <div className="gallery-photo-pair">
                  <div className="gallery-photo-slot">
                    <div className="gallery-photo-label">Login</div>
                    {r.login_photo_url ? (
                      <a href={r.login_photo_url} target="_blank" rel="noreferrer">
                        <img src={r.login_photo_url} alt="Login selfie" className="gallery-photo" />
                      </a>
                    ) : <div className="gallery-photo-empty">—</div>}
                    <div className="gallery-photo-meta mono">
                      {r.login_time ? new Date(r.login_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                    {r.login_lat != null && (
                      <a href={mapLink(r.login_lat, r.login_lng)} target="_blank" rel="noreferrer" className="map-link" style={{ fontSize: 11 }}>
                        location ↗
                      </a>
                    )}
                  </div>

                  <div className="gallery-photo-slot">
                    <div className="gallery-photo-label">Logout</div>
                    {r.logout_photo_url ? (
                      <a href={r.logout_photo_url} target="_blank" rel="noreferrer">
                        <img src={r.logout_photo_url} alt="Logout selfie" className="gallery-photo" />
                      </a>
                    ) : <div className="gallery-photo-empty">—</div>}
                    <div className="gallery-photo-meta mono">
                      {r.logout_time ? new Date(r.logout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                    {r.logout_lat != null && (
                      <a href={mapLink(r.logout_lat, r.logout_lng)} target="_blank" rel="noreferrer" className="map-link" style={{ fontSize: 11 }}>
                        location ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
