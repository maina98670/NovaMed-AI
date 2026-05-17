import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { CategoryPill } from './Dashboard';

const CATEGORIES = [
  { key: '',          label: 'All' },
  { key: 'pending',   label: '🟡 Pending' },
  { key: 'completed', label: '🟢 Completed' },
  { key: 'emergency', label: '🔴 Emergency' },
];

export default function PatientList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(params.get('category') || '');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (category) qs.set('category', category);
    api.get('/api/patients' + (qs.toString() ? '?' + qs.toString() : ''))
       .then(r => setPatients(r.patients || []))
       .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category]);

  // Sync category to URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (category) next.set('category', category); else next.delete('category');
    setParams(next, { replace: true });
    /* eslint-disable-next-line */
  }, [category]);

  const onSearch = (e) => { e.preventDefault(); load(); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>Search, filter by case category, and start a new encounter.</p>
        </div>
        <Link to="/patients/new" className="btn btn-primary">+ Register patient</Link>
      </div>

      {/* Category filter pills */}
      <div className="card" style={{ marginBottom: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginRight: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Filter:
          </span>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`btn btn-sm ${category === c.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={onSearch} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Search by name, ID or phone</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="e.g. NM-2026-000003 or Jane"
          />
        </div>
        <button className="btn btn-primary">Search</button>
        {search && <button type="button" className="btn btn-ghost" onClick={() => { setSearch(''); load(); }}>Clear</button>}
      </form>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty"><span className="spinner" /> Loading…</div>
        ) : patients.length === 0 ? (
          <div className="empty">No patients found{category ? ` with status "${category}"` : ''}.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Sex / Age</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Last activity</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id} onClick={() => nav(`/patients/${p.id}`)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: '#1d4ed8' }}>{p.patient_id}</strong></td>
                    <td>{p.full_name}</td>
                    <td>{p.sex || '—'} / {ageFrom(p.date_of_birth)}</td>
                    <td>{p.phone || '—'}</td>
                    <td>
                      {p.active_category
                        ? <CategoryPill cat={p.active_category} />
                        : <span className="pill">No active case</span>}
                    </td>
                    <td>{relativeTime(p.last_activity_at)}</td>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                    <td>
                      <Link to={`/patients/${p.id}`} className="btn btn-sm btn-ghost" onClick={e => e.stopPropagation()}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ageFrom(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + ' yrs';
}

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return Math.floor(s / 60)   + ' min ago';
  if (s < 86400)  return Math.floor(s / 3600) + ' h ago';
  if (s < 604800) return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString();
}
