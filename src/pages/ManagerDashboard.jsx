import React, { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import EmployeeSelector from '../components/EmployeeSelector.jsx';

export default function ManagerDashboard() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});

  const [team, setTeam] = useState([]);
  const [calEmpId, setCalEmpId] = useState('');
  const [calMonth, setCalMonth] = useState(new Date());
  const [calRecords, setCalRecords] = useState([]);

  async function load() {
    try {
      const [reqs, teamList] = await Promise.all([
        api.listPendingManagerRequests(),
        api.listEmployees() // RLS already restricts a manager to their own direct reports
      ]);
      setRequests(reqs);
      setTeam(teamList);
      if (!calEmpId && teamList.length) setCalEmpId(teamList[0].id);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!calEmpId) return;
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const to = `${y}-${String(m + 1).padStart(2, '0')}-31`;
    api.listAttendance({ profileId: calEmpId, from, to }).then(setCalRecords).catch((err) => setError(err.message));
  }, [calEmpId, calMonth]);

  async function decide(id, action) {
    try {
      await api.decideRegularization(id, action, notes[id] || '');
      load();
    } catch (err) {
      alert(err.message);
      load();
    }
  }

  function handleExportCsv() {
    api.listAttendance().then((rows) => api.downloadCsv(rows, 'team_attendance_export.csv'));
  }

  function shiftMonth(delta) {
    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));
  }

  return (
    <>
      <h2>Manager Console</h2>
      <p className="lede">
        Approve or reject mistaken-logout requests forwarded by Admin, and review your
        direct reports' attendance and hours spent in office.
      </p>
      {error && <div className="error-text">{error}</div>}

      <section className="block card">
        <h3>Regularization requests</h3>
        <p className="form-note" style={{ marginBottom: 10 }}>
          Each employee is capped at 3 approved regularizations per calendar month — beyond that,
          you'll need to email Admin directly.
        </p>
        {requests.length === 0 ? (
          <div className="empty">No requests pending your review.</div>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Reason</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.profiles.name} <span className="mono">({r.profiles.emp_id})</span></td>
                  <td className="mono">{r.att_date}</td>
                  <td>{r.reason}</td>
                  <td>
                    <input placeholder="Optional note" style={{ fontSize: 12, padding: 4, width: 140 }}
                      value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  </td>
                  <td>
                    <button className="action approve" onClick={() => decide(r.id, 'approve')}>Approve</button>
                    <button className="action reject" onClick={() => decide(r.id, 'reject')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="block card">
        <h3>Team attendance calendar — hours, photos &amp; location</h3>
        {team.length === 0 ? (
          <div className="empty">No employees currently report to you.</div>
        ) : (
          <>
            <div className="form-row" style={{ alignItems: 'center' }}>
              <EmployeeSelector employees={team} value={calEmpId} onChange={setCalEmpId} />
              <button className="action" onClick={() => shiftMonth(-1)}>← Prev</button>
              <strong>{calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
              <button className="action" onClick={() => shiftMonth(1)}>Next →</button>
            </div>
            <AttendanceCalendar records={calRecords} month={calMonth} />
          </>
        )}
      </section>

      <section className="block card">
        <button className="action forward" onClick={handleExportCsv}>
          Export team attendance CSV (includes hours spent)
        </button>
      </section>
    </>
  );
}
