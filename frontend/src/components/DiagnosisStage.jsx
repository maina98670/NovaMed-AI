import { useState } from 'react';
import { api } from '../services/api';
import StageNav from './StageNav';
import PhaseReport from './PhaseReport';
import { Markdown } from '../utils/Markdown';

export default function DiagnosisStage({ encounter, refresh, toast, onComplete, onBack }) {
  const dx = encounter.diagnoses || {};
  const [provisional, setProvisional] = useState(dx.provisional || null);
  const [differentialsFull, setDifferentialsFull] = useState(dx.differentials_full || []);
  const [differentials, setDifferentials] = useState(dx.differentials || []);
  const [chosen, setChosen] = useState(dx.chosen || []);
  const [manual, setManual] = useState('');
  const [summary, setSummary] = useState(dx.summary || dx.summary_for_doctor || '');
  const [urgent, setUrgent] = useState(!!dx.urgent);
  const [source, setSource] = useState(dx.source || '');
  const [busy, setBusy] = useState(false);

  const runAI = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/diagnosis/suggest`);
      setProvisional(r.provisional || null);
      setDifferentialsFull(r.differentials_full || []);
      setDifferentials(r.differentials || []);
      setSummary(r.summary_for_doctor || '');
      setUrgent(!!r.urgent);
      setSource(r.source || '');
      toast(r.source === 'ai' ? 'AI diagnosis generated.' : 'DB fallback used.', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const toggleChoose = (name) => {
    setChosen(c => c.includes(name) ? c.filter(x => x !== name) : [...c, name]);
  };

  const addManual = () => {
    const t = manual.trim();
    if (!t) return;
    if (!chosen.includes(t)) setChosen(c => [...c, t]);
    setManual('');
  };

  const save = async () => {
    if (chosen.length === 0) { toast('Pick or add at least one working diagnosis', 'err'); return; }
    setBusy(true);
    try {
      await api.post(`/api/encounters/${encounter.id}/diagnosis/choose`, { chosen });
      toast('Diagnoses saved.', 'ok');
      onComplete();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {urgent && (
        <div className="warning-banner">
          <h4>⚠️ AI flagged this case as potentially urgent.</h4>
          <p style={{ margin: 0, fontSize: 13.5 }}>Review the differentials and consider expediting investigations.</p>
        </div>
      )}

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="card-title" style={{ margin: 0 }}>🧠 AI differential diagnosis</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill pill-violet" style={{ fontSize: 12 }}>Generated from full history + physical examination</span>
            <button className="btn btn-primary btn-sm" onClick={runAI} disabled={busy}>
              {busy ? <span className="spinner" /> : differentials.length ? 'Re-run' : 'Generate suggestions'}
            </button>
          </div>
        </div>

        {summary && (
          <div className="ai-summary">
            <div className="ai-summary-head">
              <strong>🩻 Clinical reasoning summary</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {source === 'ai' ? 'AI-generated · integrates history, exam, vitals & warnings'
                                 : 'Local fallback · DB-driven'}
              </span>
            </div>
            <div className="ai-summary-body">
              <Markdown text={summary} />
            </div>
          </div>
        )}

        {/* Provisional diagnosis (top recommendation) */}
        {provisional && (
          <div className="dx-card dx-provisional" style={{ marginBottom: 14, borderLeftWidth: 5, borderLeftColor: '#1d4ed8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                  ⭐ Provisional diagnosis — #1 of 1
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{provisional.name}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                  <span className={`pill ${likelihoodClass(provisional.likelihood)}`}>
                    {provisional.likelihood || 'high'} likelihood
                  </span>
                  {provisional.percentage != null && (
                    <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                      {provisional.percentage}% confidence
                    </span>
                  )}
                </div>
              </div>
              <button
                className={'btn btn-sm ' + (chosen.includes(provisional.name) ? 'btn-success' : 'btn-primary')}
                onClick={() => toggleChoose(provisional.name)}
              >
                {chosen.includes(provisional.name) ? '✓ Chosen' : 'Choose'}
              </button>
            </div>
            {provisional.justification && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label">Justification (based on documented symptoms only)</div>
                <div className="dx-text">{provisional.justification}</div>
              </div>
            )}
            {provisional.symptom_correlation && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label">Symptom correlation</div>
                <div className="dx-text">{provisional.symptom_correlation}</div>
              </div>
            )}
            {provisional.causative_agent && provisional.causative_agent !== '—' && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label" style={{ color: '#7c3aed' }}>🦠 Causative agent / Aetiology</div>
                <div className="dx-text" style={{ fontWeight: 600 }}>{provisional.causative_agent}</div>
              </div>
            )}
            {provisional.pathology && provisional.pathology !== '—' && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label" style={{ color: '#0369a1' }}>🔬 Pathophysiology</div>
                <div className="dx-text">{provisional.pathology}</div>
              </div>
            )}
            {provisional.occupational_risks && provisional.occupational_risks !== 'No specific occupational risk identified' && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label" style={{ color: '#92400e' }}>🏭 Occupational Risk Assessment</div>
                <div className="dx-text" style={{ background: '#fffbeb', padding: '6px 10px', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                  {provisional.occupational_risks}
                </div>
              </div>
            )}
            {provisional.history_contribution && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label" style={{ color: '#0369a1' }}>📋 History Contribution (PMH/DH/FH/SH)</div>
                <div className="dx-text">{provisional.history_contribution}</div>
              </div>
            )}
            {provisional.clinical_reasoning && (
              <div style={{ marginTop: 6 }}>
                <div className="dx-label">Clinical reasoning</div>
                <div className="dx-text">{provisional.clinical_reasoning}</div>
              </div>
            )}
          </div>
        )}

        {/* Structured differentials (3 alternatives) */}
        {differentialsFull && differentialsFull.length > 0 ? (
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 8 }}>
              Differential diagnoses — {differentialsFull.length} (from documented symptoms only)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {differentialsFull.map((d, i) => (
                <div key={i} className={'dx-card ' + (chosen.includes(d.name) ? 'dx-chosen' : '')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>#{i + 2} Differential</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                        <span className={`pill ${likelihoodClass(d.likelihood)}`}>{d.likelihood || 'moderate'}</span>
                        {d.percentage != null && (
                          <span style={{ background: '#f3f4f6', color: '#374151', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                            {d.percentage}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className={'btn btn-sm ' + (chosen.includes(d.name) ? 'btn-success' : 'btn-ghost')}
                      onClick={() => toggleChoose(d.name)}
                    >
                      {chosen.includes(d.name) ? '✓ Chosen' : 'Choose'}
                    </button>
                  </div>
                  {d.explanation && (
                    <div style={{ marginTop: 6 }}>
                      <div className="dx-label">Reason (from patient's documented symptoms)</div>
                      <div className="dx-text">{d.explanation}</div>
                    </div>
                  )}
                  {d.causative_agent && d.causative_agent !== '—' && (
                    <div style={{ marginTop: 6 }}>
                      <div className="dx-label" style={{ color: '#7c3aed' }}>🦠 Causative agent</div>
                      <div className="dx-text" style={{ fontWeight: 600 }}>{d.causative_agent}</div>
                    </div>
                  )}
                  <div className="row-2" style={{ gap: 10, marginTop: 6 }}>
                    <BulletList label="Supporting findings (documented)" items={d.supporting} />
                    <BulletList label="Opposing findings" items={d.opposing} />
                  </div>
                  {d.less_likely_because && (
                    <div style={{ marginTop: 6 }}>
                      <div className="dx-label" style={{ color: '#b45309' }}>Less likely because</div>
                      <div className="dx-text">{d.less_likely_because}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : differentials.length === 0 ? (
          <div className="empty">Click <strong>Generate suggestions</strong> to produce a structured AI assessment.</div>
        ) : (
          /* legacy view for old saved data */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {differentials.map((d, i) => (
              <div key={i} className={'dx-card ' + (chosen.includes(d.name) ? 'dx-chosen' : '')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                    <span className={`pill ${likelihoodClass(d.likelihood)}`} style={{ marginTop: 4 }}>
                      {d.likelihood || 'moderate'}
                    </span>
                  </div>
                  <button className={'btn btn-sm ' + (chosen.includes(d.name) ? 'btn-success' : 'btn-ghost')}
                          onClick={() => toggleChoose(d.name)}>
                    {chosen.includes(d.name) ? '✓ Chosen' : 'Choose'}
                  </button>
                </div>
                {d.reasoning && <p style={{ margin: '8px 0 6px', fontSize: 13.5, color: '#475569' }}>{d.reasoning}</p>}
                <div className="row-3" style={{ gap: 10, marginTop: 6 }}>
                  <BulletList label="Supporting" items={d.supporting} />
                  <BulletList label="Against"    items={d.against} />
                  <BulletList label="Red flags"  items={d.red_flags} red />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">Working diagnoses (your final list)</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {chosen.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Nothing chosen yet.</span>}
          {chosen.map((c, i) => (
            <span key={i} className="pill pill-mint" style={{ fontSize: 13, padding: '6px 12px' }}>
              {c} <button onClick={() => toggleChoose(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={manual} onChange={e => setManual(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManual())}
                 placeholder="Add your own diagnosis…"
                 style={{ flex: 1, padding: '10px 13px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14 }} />
          <button className="btn btn-ghost" onClick={addManual}>+ Add</button>
        </div>
      </div>

      <PhaseReport encounterId={encounter.id} phase="diagnosis" label="Diagnosis" toast={toast} />

      <StageNav
        onBack={onBack}
        onForward={save}
        forwardLabel={busy ? '…saving' : 'Save & continue → Investigations'}
        forwardDisabled={chosen.length === 0}
        busy={busy}
      />
    </div>
  );
}

function likelihoodClass(l) {
  if (l === 'high') return 'pill-red';
  if (l === 'low')  return 'pill-gray';
  return 'pill-amber';
}

function BulletList({ label, items, red }) {
  if (!items?.length) return <div />;
  return (
    <div>
      <div style={{ fontSize: 11, color: red ? '#b91c1c' : '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: '#334155' }}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}
