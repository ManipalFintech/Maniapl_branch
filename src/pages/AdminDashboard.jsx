import React, { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import AttendanceCalendar from '../components/AttendanceCalendar.jsx';
import EmployeeSelector from '../components/EmployeeSelector.jsx';

function Pill({ status }) {
  return <span className={`pill ${status}`}>{status.replace('_', ' ')}</span>;
}

const emptyForm = { emp_id: '', name: '', role: 'employee', reporting_manager_id: '', branch: '' };

export default function AdminDashboard() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [error, setError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [formMsg, setFormMsg] = useState('');

  const [bulkFile, setBulkFile] = useState(null);
  const [bulkMsg, setBulkMsg] = useState('');

  const [calEmpId, setCalEmpId] = useState('');
  const [calMonth, setCalMonth] = useState(new Date());
  const [calRecords, setCalRecords] = useState([]);

  async function loadAll() {
    try {
      const [emps, att, pending] = await Promise.all([
        api.listEmployees(),
        api.listAttendance(),
        api.listPendingAdminRequests()
      ]);
      setEmployees(emps);
      setAttendance(att);
      setPendingRequests(pending);
      if (!calEmpId && emps.length) setCalEmpId(emps[0].id);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!calEmpId) return;
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const to = `${y}-${String(m + 1).padStart(2, '0')}-31`;
    api.listAttendance({ profileId: calEmpId, from, to }).then(setCalRecords).catch((err) => setError(err.message));
  }, [calEmpId, calMonth]);

  async function handleForward(id) {
    try {
      await api.forwardRegularization(id);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleExportCsv() {
    api.downloadCsv(attendance, 'attendance_export.csv');
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
      setBulkMsg(res.message);
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
    try {
      await api.setEmployeeStatus(profileId, nextActive);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  function shiftMonth(delta) {
    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));
  }

  return (
    <>
      <h2>Admin Overview</h2>
      <p className="lede">
        Add employees, review mistaken-logout requests, and track daily login/logout activity
        including hours spent in office.
      </p>
      {error && <div className="error-text">{error}</div>}

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
          <span className="mono">reporting_manager_id</span> here must be the manager's internal profile ID
          (visible in the Employees table below) — create managers first, then reference them.
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
                  <td>{r.profiles.name} <span className="mono">({r.profiles.emp_id})</span></td>
                  <td className="mono">{r.att_date}</td>
                  <td>{r.reason}</td>
                  <td className="mono">{new Date(r.created_at).toLocaleString()}</td>
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
                  <button className="action" onClick={() => navigator.clipboard.writeText(e.id)}>Copy ID</button>
                  <button className="action" onClick={() => handleResetPassword(e.id, e.name)}>Reset password</button>
                  <button className={`action ${e.is_active ? 'reject' : 'approve'}`} onClick={() => handleToggleStatus(e.id, !e.is_active)}>
                    {e.is_active ? 'Deactivate' : 'Activate'}
                  </button>
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
          <strong>{calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
          <button className="action" onClick={() => shiftMonth(1)}>Next →</button>
        </div>
        <AttendanceCalendar records={calRecords} month={calMonth} />
      </section>

      <section className="block card">
        <h3>Attendance log</h3>
        <button className="action forward" style={{ marginBottom: 12 }} onClick={handleExportCsv}>
          Export CSV (includes hours spent)
        </button>
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.id}>
                <td>{a.profiles.name} <span className="mono">({a.profiles.emp_id})</span></td>
                <td className="mono">{a.att_date}</td>
                <td className="mono">{a.login_time ? new Date(a.login_time).toLocaleTimeString() : '—'}</td>
                <td className="mono">{a.logout_time ? new Date(a.logout_time).toLocaleTimeString() : '—'}</td>
                <td className="mono">{a.duration_label || '—'}</td>
                <td><Pill status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
