import React, { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import EmployeeSelector from '../components/EmployeeSelector.jsx';
import { currentMonthDate, monthLabel, monthRange, todayIso } from '../lib/time.js';

export default function ManagerDashboard() {
  const { profile } = useAuth();
  const myId = profile.id;

  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});
  const [deciding, setDeciding] = useState(null);

  const [team, setTeam] = useState([]);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [calEmpId, setCalEmpId] = useState('');
  const [calMonth, setCalMonth] = useState(currentMonthDate());
  const [calRecords, setCalRecords] = useState([]);
  const [calLoading, setCalLoading] = useState(false);

  const [logFrom, setLogFrom] = useState(() => monthRange(currentMonthDate()).from);
  const [logTo, setLogTo] = useState(() => todayIso());
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [reqs, teamList] = await Promise.all([
        api.listPendingManagerRequests(myId),
        api.listMyTeam(myId) // direct reports only - never the manager themself
      ]);
      setRequests(reqs);
      setTeam(teamList);
      setCalEmpId((cur) => (cur && teamList.some((t) => t.id === cur) ? cur : teamList[0]?.id || ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setTeamLoaded(true);
    }
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!calEmpId) { setCalRecords([]); return undefined; }
    let active = true;
    const { from, to } = monthRange(calMonth);
    setCalLoading(true);
    api.listAttendance({ profileId: calEmpId, from, to })
      .then((rows) => { if (active) setCalRecords(rows); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setCalLoading(false); });
    return () => { active = false; };
  }, [calEmpId, calMonth]);

  async function decide(id, action) {
    setDeciding(id);
    try {
      const res = await api.decideRegularization(id, action, notes[id] || '');
      if (res?.status === 'limit_exceeded') {
        alert('This employee already has 3 approved regularizations this month. Please email Admin directly.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeciding(null);
      load();
    }
  }

  async function handleExportCsv() {
    if (logFrom && logTo && logFrom > logTo) return setExportMsg('“From” date must be before “To” date.');
    setExporting(true);
    setExportMsg('');
    try {
      // Fresh from the server at click time, all pages, team only (not self).
      const rows = await api.listAttendance({ excludeProfileId: myId, from: logFrom || undefined, to: logTo || undefined });
      if (rows.length === 0) {
        setExportMsg('No team attendance records in this date range.');
        return;
      }
      api.downloadCsv(rows, `team_attendance_${logFrom || 'start'}_to_${logTo || 'today'}.csv`);
      setExportMsg(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setExportMsg(err.message);
    } finally {
      setExporting(false);
    }
  }

  function shiftMonth(delta) {
    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));
  }

  return (
    <>
      <h2>Manager Console</h2>
      <p className="lede">
        Approve or reject mistaken-logout requests forwarded by Admin, and review your
        direct reports' attendance and hours spent in office. Your own attendance is under the
        “My Attendance” tab.
      </p>
      {error && <div className="error-text error-block">{error} <button className="action" onClick={load}>Retry</button></div>}

      <section className="block card">
        <h3>Regularization requests</h3>
        <p className="form-note" style={{ marginBottom: 10 }}>
          Each employee is capped at 3 approved regularizations per calendar month — beyond that,
          you'll need to email Admin directly.
        </p>
        {requests.length === 0 ? (
          <div className="empty">No requests pending your review.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Employee</th><th>Date</th><th>Reason</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.profiles?.name} <span className="mono">({r.profiles?.emp_id})</span></td>
                    <td className="mono">{r.att_date}</td>
                    <td>{r.reason}</td>
                    <td>
                      <input placeholder="Optional note" style={{ fontSize: 12, padding: 4, width: 140 }}
                        value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                    </td>
                    <td>
                      <button className="action approve" disabled={deciding === r.id} onClick={() => decide(r.id, 'approve')}>Approve</button>
                      <button className="action reject" disabled={deciding === r.id} onClick={() => decide(r.id, 'reject')}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="block card">
        <h3>Team attendance calendar — hours, photos &amp; location</h3>
        {!teamLoaded ? (
          <div className="empty">Loading…</div>
        ) : team.length === 0 ? (
          <div className="empty">No employees currently report to you.</div>
        ) : (
          <>
            <div className="form-row" style={{ alignItems: 'center' }}>
              <EmployeeSelector employees={team} value={calEmpId} onChange={setCalEmpId} />
              <button className="action" onClick={() => shiftMonth(-1)}>← Prev</button>
              <strong>{monthLabel(calMonth)}</strong>
              <button className="action" onClick={() => shiftMonth(1)}>Next →</button>
            </div>
            {calLoading ? <div className="empty">Loading…</div> : (
              <AttendanceCalendar records={calRecords} month={calMonth} profileId={calEmpId} />
            )}
          </>
        )}
      </section>

      <section className="block card">
        <h3>Export team attendance</h3>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <label className="date-label">
            From
            <input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} />
          </label>
          <label className="date-label">
            To
            <input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)} />
          </label>
        </div>
        <button className="action forward" onClick={handleExportCsv} disabled={exporting}>
          {exporting ? 'Preparing export…' : 'Export team attendance CSV (includes hours spent & location)'}
        </button>
        {exportMsg && <div className="form-note">{exportMsg}</div>}
      </section>
    </>
  );
}
