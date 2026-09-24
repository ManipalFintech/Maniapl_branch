import React, { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import EmployeeSelector from '../components/EmployeeSelector.jsx';
import { currentMonthDate, formatDateTime, formatTime, monthLabel, monthRange, todayIso } from '../lib/time.js';

function Pill({ status }) {
  return <span className={`pill ${status}`}>{String(status).replace('_', ' ')}</span>;
}

const emptyForm = { emp_id: '', name: '', role: 'employee', reporting_manager_id: '', branch: '' };

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [attLoading, setAttLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [error, setError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [formMsg, setFormMsg] = useState('');

  const [bulkFile, setBulkFile] = useState(null);
  const [bulkMsg, setBulkMsg] = useState('');

  const [calEmpId, setCalEmpId] = useState('');
  const [calMonth, setCalMonth] = useState(currentMonthDate());
  const [calRecords, setCalRecords] = useState([]);

  // Attendance log defaults to this month and is always fetched from the
  // server for the chosen range (all pages) - never a stale in-memory copy.
  const [logFrom, setLogFrom] = useState(() => monthRange(currentMonthDate()).from);
  const [logTo, setLogTo] = useState(() => todayIso());
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [emps, pending] = await Promise.all([
        api.listEmployees(),
        api.listPendingAdminRequests()
      ]);
      setEmployees(emps);
      setPendingRequests(pending);
      setCalEmpId((cur) => (cur && emps.some((e) => e.id === cur) ? cur : emps[0]?.id || ''));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadAttendance = useCallback(async () => {
    if (logFrom && logTo && logFrom > logTo) {
      setAttendance([]);
      setAttLoading(false);
      return;
    }
    setAttLoading(true);
    try {
      const rows = await api.listAttendance({ from: logFrom || undefined, to: logTo || undefined });
      setAttendance(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setAttLoading(false);
    }
  }, [logFrom, logTo]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  useEffect(() => {
    if (!calEmpId) { setCalRecords([]); return undefined; }
    let active = true;
    const { from, to } = monthRange(calMonth);
    api.listAttendance({ profileId: calEmpId, from, to })
      .then((rows) => { if (active) setCalRecords(rows); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [calEmpId, calMonth]);

  async function handleForward(id) {
    try {
      await api.forwardRegularization(id);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  const filteredAttendance = attendance;

  async function handleExportCsv() {
    if (logFrom && logTo && logFrom > logTo) return setExportMsg('“From” date must be before “To” date.');
    setExporting(true);
    setExportMsg('');
    try {
      // Re-fetch at click time so records marked after this page was opened are included.
      const rows = await api.listAttendance({ from: logFrom || undefined, to: logTo || undefined });
      setAttendance(rows);
      if (rows.length === 0) {
        setExportMsg('No attendance records in this date range.');
        return;
      }
      api.downloadCsv(rows, `attendance_${logFrom || 'start'}_to_${logTo || 'today'}.csv`);
      setExportMsg(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setExportMsg(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleCreateEmployee(e) {
    e.preventDefault();
    setFormMsg('');
    try {
      const res = await api.createEmployee({ ...form, reporting_manager_id: form.reporting_manager_id || null });
      setFormMsg(res.message);
      setForm(emptyForm);
      loadAll();
    } catch (err) {
      setFormMsg(err.message);
    }
  }

  async function handleBulkUpload() {
    if (!bulkFile) return setBulkMsg('Choose a CSV file first');
    setBulkMsg('Uploading…');
    try {
      const text = await bulkFile.text();
      const rows = api.parseEmployeeCsv(text);
      const res = await api.bulkCreateEmployees(rows);
      const details = (res.skipped || [])
        .map((s) => `• ${s.row?.emp_id || '(unknown)'}: ${s.reason}`)
        .join('\n');
      setBulkMsg(details ? `${res.message}\n${details}` : res.message);
      loadAll();
    } catch (err) {
      setBulkMsg(err.message);
    }
  }

  async function handleResetPassword(profileId, name) {
    if (!confirm(`Reset password for ${name} to the default password?`)) return;
    try {
      const res = await api.resetEmployeePassword(profileId);
      alert(res.message);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleStatus(profileId, nextActive) {
    if (profileId === profile.id && !nextActive) {
      alert('You cannot deactivate your own admin account.');
      return;
    }
    try {
      await api.setEmployeeStatus(profileId, nextActive);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteEmployee(profileId, name) {
    if (profileId === profile.id) {
      alert('You cannot delete your own admin account.');
      return;
    }
    const sure = confirm(
      `Permanently delete ${name}? This removes their login and ALL their attendance history. This cannot be undone.`
    );
    if (!sure) return;
    try {
      const res = await api.deleteEmployee(profileId);
      alert(res.message);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  function shiftMonth(delta) {
    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));
  }

  async function copyId(id) {
    try {
      await navigator.clipboard.writeText(id);
    } catch (_) {
      window.prompt('Copy this profile ID:', id);
    }
  }

  return (
    <>
      <h2>Admin Overview</h2>
      <p className="lede">
        Add employees, review mistaken-logout requests, and track daily login/logout activity
        including hours spent in office.
      </p>
      {error && <div className="error-text error-block">{error}</div>}

      <section className="block card">
        <h3>Add employee</h3>
        <form onSubmit={handleCreateEmployee}>
          <div className="form-grid">
            <label>Emp ID
              <input placeholder="e.g. EMP1042" value={form.emp_id}
                onChange={(e) => setForm({ ...form, emp_id: e.target.value })} required />
            </label>
            <label>Full name
              <input placeholder="e.g. Priya Nair" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>Reporting manager
              <select value={form.reporting_manager_id}
                onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value })}>
                <option value="">No reporting manager</option>
                {employees.filter((e) => e.role === 'manager').map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.emp_id})</option>
                ))}
              </select>
            </label>
            <label>Branch
              <input placeholder="e.g. MG Road Branch" value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })} required />
            </label>
          </div>
          <button className="action forward" type="submit" style={{ marginTop: 12 }}>Create employee</button>
        </form>
        {formMsg && <div className="form-note">{formMsg}</div>}
      </section>

      <section className="block card">
        <h3>Bulk upload employees (CSV)</h3>
        <p className="form-note" style={{ marginBottom: 8 }}>
          Columns: <span className="mono">emp_id,name,role,reporting_manager_id,branch</span>.
          For <span className="mono">reporting_manager_id</span> you can enter the manager's Emp ID (e.g. MGR001)
          or their profile ID. Create managers first. Re-uploading an existing Emp ID updates that person;
          blank cells leave their current values unchanged.
        </p>
        <div className="form-row">
          <input type="file" accept=".csv" onChange={(e) => setBulkFile(e.target.files[0])} />
          <button className="action forward" onClick={handleBulkUpload}>Upload</button>
        </div>
        {bulkMsg && <div className="form-note">{bulkMsg}</div>}
      </section>

      <section className="block card">
        <h3>Requests awaiting forward to manager ({pendingRequests.length})</h3>
        {pendingRequests.length === 0 ? (
          <div className="empty">No pending requests.</div>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Reason</th><th>Raised</th><th></th></tr></thead>
            <tbody>
              {pendingRequests.map((r) => (
                <tr key={r.id}>
                  <td>{r.profiles?.name} <span className="mono">({r.profiles?.emp_id})</span></td>
                  <td className="mono">{r.att_date}</td>
                  <td>{r.reason}</td>
                  <td className="mono">{formatDateTime(r.created_at)}</td>
                  <td><button className="action forward" onClick={() => handleForward(r.id)}>Forward to manager</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="block card">
        <h3>Employees ({employees.length})</h3>
        <table>
          <thead><tr><th>Name</th><th>Emp ID</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td className="mono">{e.emp_id}</td>
                <td>{e.role}</td>
                <td>{e.branch}</td>
                <td><span className={`pill ${e.is_active ? 'complete' : 'rejected'}`}>{e.is_active ? 'active' : 'inactive'}</span></td>
                <td>
                  <button className="action" onClick={() => copyId(e.id)}>Copy ID</button>
                  <button className="action" onClick={() => handleResetPassword(e.id, e.name)}>Reset password</button>
                  <button className={`action ${e.is_active ? 'reject' : 'approve'}`} onClick={() => handleToggleStatus(e.id, !e.is_active)}>
                    {e.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="action reject" onClick={() => handleDeleteEmployee(e.id, e.name)}>Delete permanently</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="block card">
        <h3>Attendance calendar — hours per day, photos &amp; location</h3>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <EmployeeSelector employees={employees} value={calEmpId} onChange={setCalEmpId} />
          <button className="action" onClick={() => shiftMonth(-1)}>← Prev</button>
          <strong>{monthLabel(calMonth)}</strong>
          <button className="action" onClick={() => shiftMonth(1)}>Next →</button>
        </div>
        <AttendanceCalendar records={calRecords} month={calMonth} profileId={calEmpId} />
      </section>

      <section className="block card">
        <h3>Attendance log</h3>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <label className="date-label">
            From
            <input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} />
          </label>
          <label className="date-label">
            To
            <input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)} />
          </label>
          <button className="action" onClick={loadAttendance} style={{ marginTop: 18 }} disabled={attLoading}>
            {attLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <button className="action forward" style={{ marginBottom: 6 }} onClick={handleExportCsv} disabled={exporting}>
          {exporting ? 'Preparing export…' : 'Export CSV (includes hours spent & location)'}
        </button>
        {exportMsg && <div className="form-note" style={{ marginBottom: 10 }}>{exportMsg}</div>}
        <p className="form-note">{attLoading ? 'Loading records…' : `${attendance.length} record${attendance.length === 1 ? '' : 's'} in this range.`}</p>
        <div className="table-scroll">
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            {filteredAttendance.map((a) => (
              <tr key={a.id}>
                <td>{a.profiles?.name} <span className="mono">({a.profiles?.emp_id})</span></td>
                <td className="mono">{a.att_date}</td>
                <td className="mono">{formatTime(a.login_time)}</td>
                <td className="mono">{formatTime(a.logout_time)}</td>
                <td className="mono">{a.duration_label || '—'}</td>
                <td><Pill status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {!attLoading && filteredAttendance.length === 0 && <div className="empty">No attendance records in this date range.</div>}
      </section>
    </>
  );
}
