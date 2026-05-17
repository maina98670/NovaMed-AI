import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../utils/useToast';

const HISTORY_TYPES = [
  { v: 'general',       label: 'General adult', desc: 'Standard adult history',                        icon: '🩺' },
  { v: 'pediatric',     label: 'Pediatric',      desc: 'Birth, immunisation, milestones, growth',       icon: '👶' },
  { v: 'obstetric',     label: 'Obstetric',      desc: 'LMP, gravidity/parity, antenatal care',         icon: '🤰' },
  { v: 'gynecological', label: 'Gynecological',  desc: 'Menstrual, sexual, contraceptive history',      icon: '🌸' },
  { v: 'psychiatric',   label: 'Psychiatric',    desc: 'Mood, sleep, ideation, substance use',          icon: '🧠' },
  { v: 'trauma',        label: 'Trauma',         desc: 'Mechanism, force, LOC, injuries',               icon: '🚑' },
  { v: 'surgical',      label: 'Surgical',       desc: 'Previous ops, anaesthesia, current concern',    icon: '🔪' },
];

const INPUT_MODES = [
  { v: 'form',  label: 'Form',           desc: 'Structured fields per section',         icon: '📝' },
  { v: 'chat',  label: 'Adaptive AI',    desc: 'AI asks one smart question at a time',  icon: '💬' },
  { v: 'voice', label: 'Voice + AI',     desc: 'Speak answers, AI follows up',          icon: '🎤' },
];

export default function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show, node } = useToast();

  const [patient, setPatient] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [activity, setActivity] = useState([]);
  const [showStart, setShowStart] = useState(false);

  // start-encounter form state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [historyType, setHistoryType] = useState('general');
  const [inputMode, setInputMode] = useState('form');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/patients/${id}`).then(r => {
      setPatient(r.patient);
      setEncounters(r.encounters || []);
      setActivity(r.activity || []);
    });
  }, [id]);

  const startEncounter = async (e) => {
    e.preventDefault();
    if (!chiefComplaint.trim()) { show('Please enter a chief complaint', 'err'); return; }
    setBusy(true);
    try {
      const r = await api.post('/api/encounters', {
        patient_id: Number(id),
        chief_complaint: chiefComplaint.trim(),
        history_type: historyType,
        input_mode: inputMode,
      });
      nav(`/encounters/${r.encounter.id}`);
    } catch (e) {
      show(e.message || 'Failed to start encounter', 'err');
    } finally { setBusy(false); }
  };

  if (!patient) return <div className="empty"><span className="spinner" /> Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{patient.full_name}</h1>
          <p>
            <strong style={{ color: '#1d4ed8' }}>{patient.patient_id}</strong>
            &nbsp;·&nbsp; {patient.sex || '—'} · {ageFrom(patient.date_of_birth)} · {patient.phone || 'no phone'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/patients" className="btn btn-ghost">← All patients</Link>
          {!showStart && <button className="btn btn-primary" onClick={() => setShowStart(true)}>+ New encounter</button>}
        </div>
      </div>

      {showStart && (
        <form className="card" onSubmit={startEncounter} style={{ marginBottom: 16 }}>
          <h3 className="card-title">Start a new clinical encounter</h3>
          <div className="card-sub">Pick the type of history and how you'd like to capture it.</div>

          <div className="field">
            <label>Chief complaint *</label>
            <input
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              placeholder="e.g. Chest pain for 2 hours"
              autoFocus
              required
            />
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
            Type of history
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
            {HISTORY_TYPES.map(h => (
              <button type="button" key={h.v} onClick={() => setHistoryType(h.v)} style={pickStyle(historyType === h.v)}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{h.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{h.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{h.desc}</div>
              </button>
            ))}
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
            Input mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {INPUT_MODES.map(m => (
              <button type="button" key={m.v} onClick={() => setInputMode(m.v)} style={pickStyle(inputMode === m.v)}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowStart(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Begin encounter →'}
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Patient summary</h3>
        <div className="row-3">
          <div><div className="muted" style={kvLbl}>Blood group</div><div>{patient.blood_group || '—'}</div></div>
          <div><div className="muted" style={kvLbl}>National ID</div><div>{patient.national_id || '—'}</div></div>
          <div><div className="muted" style={kvLbl}>Email</div><div>{patient.email || '—'}</div></div>
        </div>
        <div className="row-2" style={{ marginTop: 14 }}>
          <div><div className="muted" style={kvLbl}>Allergies</div><div>{patient.allergies || 'None recorded'}</div></div>
          <div><div className="muted" style={kvLbl}>Chronic conditions</div><div>{patient.chronic_conditions || 'None recorded'}</div></div>
        </div>
        <div className="row-2" style={{ marginTop: 14 }}>
          <div><div className="muted" style={kvLbl}>Next of kin</div><div>{patient.next_of_kin || '—'}</div></div>
          <div><div className="muted" style={kvLbl}>NoK phone</div><div>{patient.next_of_kin_phone || '—'}</div></div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Encounters</h3>
        {encounters.length === 0 ? (
          <div className="empty">No encounters yet. Start one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Encounter</th>
                  <th>Time</th>
                  <th>Chief complaint</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {encounters.map(e => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/encounters/${e.id}`)}>
                    <td><strong>#{e.id}</strong></td>
                    <td>
                      <div>{new Date(e.created_at).toLocaleDateString()}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(e.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                    </td>
                    <td>{e.chief_complaint || '—'}</td>
                    <td><span className="pill pill-gray">{e.history_type || 'general'}</span></td>
                    <td><CategoryPillLocal cat={e.case_category || 'pending'} /></td>
                    <td><StatusPill s={e.status} /></td>
                    <td><button className="btn btn-sm btn-ghost">Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity timeline */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="card-title">Activity timeline</h3>
        {activity.length === 0 ? (
          <div className="empty">No activity recorded yet.</div>
        ) : (
          <ul className="timeline">
            {activity.map(a => (
              <li key={a.id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.action.replace(/[._]/g, ' ')}</div>
                  {a.detail && <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{a.detail}</div>}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {new Date(a.created_at).toLocaleString()}
                    {a.user_name && ` · ${a.user_name}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {node}
    </>
  );
}

function CategoryPillLocal({ cat }) {
  const map = {
    pending:   { cls: 'pill pill-pending',   label: 'Pending'   },
    completed: { cls: 'pill pill-completed', label: 'Completed' },
    emergency: { cls: 'pill pill-emergency', label: 'Emergency' },
  };
  const m = map[cat] || { cls: 'pill', label: cat };
  return <span className={m.cls}>{m.label}</span>;
}

const kvLbl = { fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 };

function pickStyle(active) {
  return {
    textAlign: 'left',
    padding: '14px 16px',
    border: '1px solid ' + (active ? '#3b82f6' : '#e2e8f0'),
    background: active ? '#eff6ff' : '#fff',
    borderRadius: 12,
    cursor: 'pointer',
    boxShadow: active ? '0 0 0 3px rgba(59, 130, 246, .15)' : 'none',
    transition: 'all .15s',
  };
}

function StatusPill({ s }) {
  const map = {
    history:        ['pill-gray',  'History'],
    examination:    ['pill',       'Examination'],
    diagnosis:      ['pill-amber', 'Diagnosis'],
    investigation:  ['pill-amber', 'Investigations'],
    treatment:      ['pill-mint',  'Treatment'],
    closed:         ['pill-mint',  'Closed'],
  };
  const [cls, label] = map[s] || ['pill-gray', s || '—'];
  return <span className={`pill ${cls}`}>{label}</span>;
}

function ageFrom(dob) {
  if (!dob) return '—';
  const y = Math.floor((Date.now() - new Date(dob)) / 31557600000);
  return y + ' yrs';
}
