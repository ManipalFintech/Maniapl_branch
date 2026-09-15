import React, { useState } from 'react';

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function timeOf(ts) {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function mapLink(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// records: array of attendance rows (from lib/api.js: includes duration_label,
// login/logout time+photo_url+lat+lng, status)
export default function AttendanceCalendar({ records, month }) {
  const [selected, setSelected] = useState(null);

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const total = daysInMonth(year, monthIdx);
  const firstWeekday = new Date(year, monthIdx, 1).getDay();

  const byDate = {};
  records.forEach((r) => { byDate[r.att_date] = r; });

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const iso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso, record: byDate[iso] });
  }

  const sel = selected ? byDate[selected] : null;

  return (
    <div>
      <div className="cal-grid cal-header">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c) return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
          const rec = c.record;
          const hasData = rec && rec.login_time;
          return (
            <div
              key={c.iso}
              className={`cal-cell ${hasData ? 'cal-cell-active' : ''} ${selected === c.iso ? 'cal-cell-selected' : ''}`}
              onClick={() => hasData && setSelected(c.iso === selected ? null : c.iso)}
            >
              <div className="cal-day">{c.day}</div>
              {hasData && (
                <div className="cal-cell-times">
                  <div>{timeOf(rec.login_time)}</div>
                  <div>{rec.logout_time ? timeOf(rec.logout_time) : '—'}</div>
                </div>
              )}
              {rec?.duration_label && <div className="cal-hours">{rec.duration_label}</div>}
              {rec && !rec.logout_time && rec.login_time && <div className="cal-hours cal-open">open</div>}
            </div>
          );
        })}
      </div>

      {sel && (
        <div className="cal-detail">
          <div className="cal-detail-header">
            <strong className="mono">{selected}</strong>
            <span className={`pill ${sel.status}`}>{sel.status.replace('_', ' ')}</span>
          </div>

          <div className="cal-detail-grid">
            <div className="cal-detail-col">
              <h4>Login</h4>
              <div className="cal-detail-row"><span className="label">Time</span><span className="mono">{timeOf(sel.login_time)}</span></div>
              <div className="cal-detail-row">
                <span className="label">Location</span>
                {sel.login_lat != null ? (
                  <a href={mapLink(sel.login_lat, sel.login_lng)} target="_blank" rel="noreferrer" className="mono map-link">
                    {sel.login_lat.toFixed(5)}, {sel.login_lng.toFixed(5)} ↗
                  </a>
                ) : <span className="mono">—</span>}
              </div>
              {sel.login_photo_url && (
                <a href={sel.login_photo_url} target="_blank" rel="noreferrer">
                  <img src={sel.login_photo_url} alt="Login selfie" className="cal-photo" />
                </a>
              )}
            </div>

            <div className="cal-detail-col">
              <h4>Logout</h4>
              <div className="cal-detail-row"><span className="label">Time</span><span className="mono">{timeOf(sel.logout_time)}</span></div>
              <div className="cal-detail-row">
                <span className="label">Location</span>
                {sel.logout_lat != null ? (
                  <a href={mapLink(sel.logout_lat, sel.logout_lng)} target="_blank" rel="noreferrer" className="mono map-link">
                    {sel.logout_lat.toFixed(5)}, {sel.logout_lng.toFixed(5)} ↗
                  </a>
                ) : <span className="mono">—</span>}
              </div>
              {sel.logout_photo_url ? (
                <a href={sel.logout_photo_url} target="_blank" rel="noreferrer">
                  <img src={sel.logout_photo_url} alt="Logout selfie" className="cal-photo" />
                </a>
              ) : (
                <div className="cal-photo cal-photo-empty">Not yet logged out</div>
              )}
            </div>
          </div>

          <div className="cal-detail-total">
            Total time in office: <strong>{sel.duration_label || '—'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
