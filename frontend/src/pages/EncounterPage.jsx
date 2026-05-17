import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../utils/useToast';
import HistoryStage from '../components/HistoryStage';
import ExamStage from '../components/ExamStage';
import DiagnosisStage from '../components/DiagnosisStage';
import InvestigationsStage from '../components/InvestigationsStage';
import TreatmentStage from '../components/TreatmentStage';
import { Markdown } from '../utils/Markdown';
import ClaimsStage from '../components/ClaimsStage';

const STEPS = [
  { key: 'history',       label: 'History' },
  { key: 'examination',   label: 'Examination' },
  { key: 'diagnosis',     label: 'Diagnosis' },
  { key: 'investigation', label: 'Investigations' },
  { key: 'treatment',     label: 'Treatment' },
  { key: 'closed',        label: 'Summary' },
];

export default function EncounterPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show, node } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeStep, setActiveStep] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get(`/api/encounters/${id}`);
      setData(r);
      setLoadError(null);
      if (activeStep === null) setActiveStep(r.encounter.status);
      return r;
    } catch (e) {
      setLoadError(e.message || 'Failed to load encounter');
      throw e;
    }
  }, [id, activeStep]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="empty"><span className="spinner" /> Loading encounter…</div>;

  if (loadError) return (
    <div className="empty" style={{ flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem' }}>⚠️</div>
      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Could not load encounter</div>
      <div style={{ color: '#888', maxWidth: 360 }}>{loadError}</div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button className="btn btn-secondary" onClick={() => { setLoading(true); setLoadError(null); refresh().finally(() => setLoading(false)); }}>
          Retry
        </button>
        <button className="btn btn-primary" onClick={() => nav('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  if (!data) return <div className="empty"><span className="spinner" /> Loading encounter…</div>;
  const { encounter, patient, turns, uploads } = data;
  const step = activeStep || encounter.status;

  const goNext = (nextKey) => {
    setActiveStep(nextKey);
    refresh().catch(e => show(e.message || 'Failed to refresh encounter', 'err'));
  };

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const goBack = () => {
    if (stepIndex > 0) setActiveStep(STEPS[stepIndex - 1].key);
    else nav(`/patients/${patient.id}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Encounter #{encounter.id}</h1>
          <p>
            <Link to={`/patients/${patient.id}`}>{patient.full_name}</Link> · <strong style={{ color: '#1d4ed8' }}>{patient.patient_id}</strong>
            &nbsp;·&nbsp; CC: <em>{encounter.chief_complaint}</em>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => downloadPDF(encounter.id, show)}>📄 PDF</button>
          <Link to={`/patients/${patient.id}`} className="btn btn-ghost">← Back to patient</Link>
        </div>
      </div>

      <div className="steps">
        {STEPS.map((s, i) => {
          const cur = STEPS.findIndex(x => x.key === step);
          const me = i;
          const cls = me < cur ? 'done' : me === cur ? 'active' : '';
          return (
            <button key={s.key} className={`step ${cls}`} onClick={() => setActiveStep(s.key)}>
              <span className="num">{i + 1}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {(encounter.warnings || []).length > 0 && (
        <div className="warning-banner">
          <h4>⚠️ Active warnings</h4>
          <ul>
            {encounter.warnings.map((w, i) => (
              <li key={i}><strong>{w.sign}</strong> — {w.detail} <em>({w.level})</em></li>
            ))}
          </ul>
        </div>
      )}

      {step === 'history' && (
        <HistoryStage encounter={encounter} patient={patient} turns={turns} refresh={refresh} toast={show}
                      onComplete={() => goNext('examination')}
                      onBack={() => nav(`/patients/${patient.id}`)} />
      )}
      {step === 'examination' && (
        <ExamStage encounter={encounter} refresh={refresh} toast={show}
                   onComplete={() => goNext('diagnosis')}
                   onBack={() => goNext('history')} />
      )}
      {step === 'diagnosis' && (
        <DiagnosisStage encounter={encounter} refresh={refresh} toast={show}
                        onComplete={() => goNext('investigation')}
                        onBack={() => goNext('examination')} />
      )}
      {step === 'investigation' && (
        <InvestigationsStage encounter={encounter} refresh={refresh} toast={show}
                             onComplete={() => goNext('treatment')}
                             onBack={() => goNext('diagnosis')} />
      )}
      {step === 'treatment' && (
        <TreatmentStage encounter={encounter} refresh={refresh} toast={show}
                        onComplete={() => goNext('closed')}
                        onBack={() => goNext('investigation')} />
      )}
      {step === 'closed' && (
        <SummaryView encounter={encounter} patient={patient} uploads={uploads} toast={show}
                     onBack={() => goNext('treatment')} />
      )}

      {node}
    </>
  );
}

function SummaryView({ encounter, patient, uploads, toast, onBack }) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const generateSummary = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/summary`, {});
      if (r.report) setSummary(r.report);
      toast?.('Final summary generated.', 'ok');
    } catch (e) { toast?.(e.message || 'Failed to generate summary', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">✓ Encounter summary</h3>
        <div className="row-2">
          <Kv k="Patient"          v={`${patient.full_name} (${patient.patient_id})`} />
          <Kv k="Chief complaint"  v={encounter.chief_complaint} />
          <Kv k="History type"     v={encounter.history_type} />
          <Kv k="Status"           v={encounter.status} />
        </div>
        <hr className="hr" />
        <h4 style={{ margin: '8px 0' }}>History summary</h4>
        <pre style={pre}>{encounter.history_summary || '—'}</pre>

        {encounter.examination?.vitals && (
          <>
            <h4 style={{ margin: '12px 0 4px' }}>Vitals</h4>
            <div className="muted" style={{ fontSize: 13.5 }}>
              BP {encounter.examination.vitals.systolic || '—'}/{encounter.examination.vitals.diastolic || '—'},
              HR {encounter.examination.vitals.heartRate || '—'},
              RR {encounter.examination.vitals.respRate || '—'},
              Temp {encounter.examination.vitals.temperature || '—'} °C,
              SpO₂ {encounter.examination.vitals.spo2 || '—'}%,
              GCS {encounter.examination.vitals.gcs || '—'}
            </div>
          </>
        )}

        <h4 style={{ margin: '12px 0 4px' }}>Working diagnoses</h4>
        <div>
          {(encounter.diagnoses?.chosen || []).length === 0 ? '—' :
            encounter.diagnoses.chosen.map((d, i) => <span key={i} className="pill pill-mint" style={{ marginRight: 6 }}>{d}</span>)}
        </div>

        {(encounter.results?.entries || []).length > 0 && (
          <>
            <h4 style={{ margin: '12px 0 4px' }}>Results</h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
              {encounter.results.entries.map((r, i) => (
                <li key={i}><strong>{r.label || r.kind}</strong>{r.abnormal ? ' — ⚠️ abnormal' : ''}: {r.interpretation}</li>
              ))}
            </ul>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => downloadPDF(encounter.id, toast)}>📄 Download PDF report</button>
        </div>
      </div>

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="card-title" style={{ margin: 0 }}>📑 Final professional summary</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={generateSummary} disabled={busy}>
              {busy ? <span className="spinner" /> : (summary ? 'Re-generate' : '🧠 Generate full summary')}
            </button>
            {summary && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(summary).then(() => toast?.('Copied', 'ok'))}>Copy</button>
            )}
          </div>
        </div>
        {!summary ? (
          <div className="empty">
            Click <strong>Generate full summary</strong> for a professional discharge-style narrative report.
          </div>
        ) : (
          <div className="report-card">
            <div className="report-header">
              <strong>Discharge / encounter summary</strong>
              <span className="pill pill-violet" style={{ marginLeft: 8 }}>auto-generated</span>
            </div>
            <div className="report-body">
              <Markdown text={summary} />
            </div>
          </div>
        )}
      </div>

      {/* ── SHA / NHIF Claim ── */}
      <ClaimsStage encounterId={encounter.id} />

      {onBack && (
        <div className="stage-nav">
          <div className="stage-nav-left">
            <button className="btn btn-ghost" onClick={onBack}>← Back to treatment</button>
          </div>
          <div className="stage-nav-right">
            <a href={`/session-end/${encounter.id}`} className="btn btn-primary">
              Finish session →
            </a>
          </div>
        </div>
      )}
    </>
  );
}

function Kv({ k, v }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>
      <div>{v || '—'}</div>
    </div>
  );
}

const pre = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
  padding: 12, fontSize: 13.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
};

function downloadPDF(id, toast) {
  const token = localStorage.getItem('novamed_token');
  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  fetch(`${apiBase}/api/encounters/${id}/pdf`, { headers: { Authorization: 'Bearer ' + token } })
    .then(r => { if (!r.ok) throw new Error('Download failed'); return r.blob(); })
    .then(b => {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = `NovaMed-encounter-${id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    })
    .catch(() => toast?.('PDF failed', 'err'));
}
