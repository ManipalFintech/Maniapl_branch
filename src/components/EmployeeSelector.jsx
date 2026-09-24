import React, { useMemo, useState } from 'react';

// employees: array of { id, name, emp_id }. value: selected id. onChange(id)
export default function EmployeeSelector({ employees, value, onChange }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => (e.name || '').toLowerCase().includes(q) || (e.emp_id || '').toLowerCase().includes(q)
    );
  }, [employees, query]);

  // If the current selection is hidden by the search, show a placeholder
  // instead of letting the dropdown display a different person's name than
  // the one whose calendar is actually on screen.
  const selectedVisible = filtered.some((e) => e.id === value);

  return (
    <div className="emp-selector">
      <input
        className="emp-selector-search"
        placeholder="Search by name or Emp ID…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        className="emp-selector-select"
        value={selectedVisible ? value : ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      >
        {!selectedVisible && (
          <option value="">{filtered.length === 0 ? 'No matches' : 'Select an employee…'}</option>
        )}
        {filtered.map((e) => (
          <option key={e.id} value={e.id}>{e.name} ({e.emp_id})</option>
        ))}
      </select>
    </div>
  );
}
