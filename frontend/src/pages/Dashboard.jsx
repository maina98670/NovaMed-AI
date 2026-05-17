import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/patients/stats/summary').catch(() => ({})),
      api.get('/api/patients').catch(() => ({ patients: [] })),
    ]).then(([s, p]) => {
      setStats(s);
      setPatients((p.patients || []).slice(0, 8));
      setLoading(false);
    });
  }, []);

  const go = (path) => () => nav(path);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your patients, encounters and clinical alerts.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/patients" className="btn btn-ghost">All patients</Link>
          <Link to="/patients/new" className="btn btn-primary">+ New patient</Link>
        </div>
      </div>

      {/* Top KPIs — every card is clickable */}
      <div className="stat-grid">
        <StatCard
          icon="👥" label="Total patients"
          value={stats?.totalPatients ?? '—'}
          onClick={go('/patients')}
        />
        <StatCard
          icon="🆕" label="Registered today"
          value={stats?.todayPatients ?? '—'} kind="mint"
          onClick={go('/patients?filter=today')}
        />
        <StatCard
          icon="🩺" label="Open encounters"
          value={stats?.openEncounters ?? '—'}
          onClick={go('/patients?filter=open')}
        />
        <StatCard
          icon="⚠️" label="Critical alerts"
          value={stats?.criticalWarnings ?? '—'}
          kind={stats?.criticalWarnings ? 'warn' : ''}
          onClick={go('/patients?category=emergency')}
        />
      </div>

      {/* Case categories — clickable status pills */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 className="card-title" style={{ marginTop: 0 }}>Case management</h3>
        <div className="case-grid">
          <CaseCard
            kind="pending" icon="🟡" label="Pending"
            value={stats?.cases?.pending ?? 0}
            onClick={go('/patients?category=pending')}
          />
          <CaseCard
            kind="completed" icon="🟢" label="Completed"
            value={stats?.cases?.completed ?? 0}
            onClick={go('/patients?category=completed')}
          />
          <CaseCard
            kind="emergency" icon="🔴" label="Emergency"
            value={stats?.cases?.emergency ?? 0}
            onClick={go('/patients?category=emergency')}
          />
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Recent patients</h3>
          <Link to="/patients" style={{ fontSize: 13, fontWeight: 600 }}>View all →</Link>
        </div>

        {loading ? (
          <div className="empty"><span className="spinner" /> Loading…</div>
        ) : patients.length === 0 ? (
          <div className="empty">No patients yet. Register your first one to get started.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Sex / Age</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Last activity</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/patients/${p.id}`)}>
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
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
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

function StatCard({ icon, label, value, kind = '', onClick }) {
  return (
    <button className={`stat-card ${kind}`} onClick={onClick} type="button">
      <div className="ic">{icon}</div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </button>
  );
}

function CaseCard({ kind, icon, label, value, onClick }) {
  return (
    <button className={`case-card case-${kind}`} onClick={onClick} type="button">
      <div className="case-icon">{icon}</div>
      <div className="case-meta">
        <div className="case-label">{label}</div>
        <div className="case-value">{value}</div>
      </div>
    </button>
  );
}

export function CategoryPill({ cat }) {
  const map = {
    pending:   { cls: 'pill pill-pending',   label: 'Pending'   },
    completed: { cls: 'pill pill-completed', label: 'Completed' },
    emergency: { cls: 'pill pill-emergency', label: 'Emergency' },
  };
  const m = map[cat] || { cls: 'pill', label: cat };
  return <span className={m.cls}>{m.label}</span>;
}

function ageFrom(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + ' yrs';
}

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)         return 'just now';
  if (s < 3600)       return Math.floor(s / 60) + ' min ago';
  if (s < 86400)      return Math.floor(s / 3600) + ' h ago';
  if (s < 604800)     return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString();
}
