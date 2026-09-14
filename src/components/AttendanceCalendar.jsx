import React, { useState } from 'react';

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// records: array of { att_date, login_time, logout_time, duration_label, status }
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
              {rec?.duration_label && <div className="cal-hours">{rec.duration_label}</div>}
              {rec && !rec.logout_time && rec.login_time && <div className="cal-hours cal-open">open</div>}
            </div>
          );
        })}
      </div>

      {selected && byDate[selected] && (
        <div className="cal-detail">
          <strong className="mono">{selected}</strong>
          <div>Login: <span className="mono">{byDate[selected].login_time ? new Date(byDate[selected].login_time).toLocaleTimeString() : '—'}</span></div>
          <div>Logout: <span className="mono">{byDate[selected].logout_time ? new Date(byDate[selected].logout_time).toLocaleTimeString() : '—'}</span></div>
          <div>Hours spent: <span className="mono">{byDate[selected].duration_label || '—'}</span></div>
          <div>Status: <span className="mono">{byDate[selected].status}</span></div>
        </div>
      )}
    </div>
  );
}
