import { useState } from 'react';
import { api } from '../services/api';
import StageNav from './StageNav';
import PhaseReport from './PhaseReport';

/**
 * Combined Investigations & Results stage.
 *  - AI suggests labs / imaging / bedside / specialist tests based on chosen Dx
 *    (works fully offline via the medical knowledge base fallback).
 */
export default function InvestigationsStage({ encounter, refresh, toast, onComplete, onBack }) {
  const inv = encounter.investigations || {};
  const [groups, setGroups] = useState({
    labs: inv.labs || [], imaging: inv.imaging || [],
    bedside: inv.bedside || [], specialist: inv.specialist || [],
  });
  const [busy, setBusy] = useState(false);
  const results = (encounter.results && encounter.results.entries) || [];

  const runAI = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/investigations/suggest`);
      setGroups({
        labs: r.labs || [], imaging: r.imaging || [],
        bedside: r.bedside || [], specialist: r.specialist || [],
      });
      toast('AI suggested investigations.', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const saveList = async () => {
    setBusy(true);
    try {
      await api.post(`/api/encounters/${encounter.id}/investigations/save`, groups);
      toast('Investigation list saved.', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const addItem = (group) => setGroups(g => ({ ...g, [group]: [...g[group], { test: '', reason: '' }] }));
  const updItem = (group, i, k, v) => setGroups(g => {
    const arr = [...g[group]]; arr[i] = { ...arr[i], [k]: v }; return { ...g, [group]: arr };
  });
  const delItem = (group, i) => setGroups(g => ({ ...g, [group]: g[group].filter((_, j) => j !== i) }));

  return (
    <div>
      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="card-title" style={{ margin: 0 }}>🔬 Investigations</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-ghost"   onClick={runAI}    disabled={busy}>{busy ? <span className="spinner"/> : '🧠 AI suggest'}</button>
            <button className="btn btn-sm btn-primary" onClick={saveList} disabled={busy}>Save list</button>
          </div>
        </div>

        {['labs', 'imaging', 'bedside', 'specialist'].map(group => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ textTransform: 'capitalize', fontSize: 14 }}>
                {group === 'labs' ? '🧪 Laboratory' : group === 'imaging' ? '🩻 Imaging' : group === 'bedside' ? '🩺 Bedside / POC' : '👨‍⚕️ Specialist / Procedure'}
              </strong>
              <button className="btn btn-sm btn-ghost" onClick={() => addItem(group)}>+ Add</button>
            </div>
            {groups[group].length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>No {group} ordered.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groups[group].map((it, i) => (
                  <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <input value={it.test} onChange={e => updItem(group, i, 'test', e.target.value)}
                             placeholder="Test name" style={{ ...inp, minWidth: 200, fontWeight: 600 }} />
                      {it.urgency && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                          background: it.urgency === 'urgent' ? '#fee2e2' : '#f1f5f9',
                          color: it.urgency === 'urgent' ? '#b91c1c' : '#475569'
                        }}>
                          {it.urgency === 'urgent' ? '🚨 Urgent' : 'Routine'}
                        </span>
                      )}
                      <button className="btn btn-sm btn-ghost" onClick={() => delItem(group, i)} style={{ marginLeft: 'auto' }}>✕</button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 700, marginBottom: 3 }}>
                        📋 Reason / Clinical Question:
                      </div>
                      <input value={it.reason} onChange={e => updItem(group, i, 'reason', e.target.value)}
                             placeholder="Why is this test needed? What clinical question does it answer?"
                             style={{ ...inp, width: '100%', background: '#fff', borderColor: '#bfdbfe' }} />
                    </div>
                    {it.expected && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                        <span style={{ fontWeight: 700 }}>Expected: </span>{it.expected}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ResultEntry encounter={encounter} refresh={refresh} toast={toast} />

      {results.length > 0 && <ResultsList results={results} />}

      <PhaseReport encounterId={encounter.id} phase="investigations" label="Investigations" toast={toast} />

      <StageNav
        onBack={onBack}
        onForward={onComplete}
        forwardLabel="Continue → Treatment"
      />
    </div>
  );
}

const inp = { flex: 1, minWidth: 130, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5 };

function ResultEntry({ encounter, refresh, toast }) {
  const [tab, setTab] = useState('text');
  const [kind, setKind] = useState('lab');
  const [label, setLabel] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(null);

  const submitText = async () => {
    if (!valuesText.trim()) { toast('Enter the result values', 'err'); return; }
    setBusy(true); setLatest(null);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/results/text`,
        { kind, label, valuesText });
      setLatest(r);
      setValuesText(''); setLabel('');
      toast('Result interpreted.', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const submitFile = async () => {
    if (!file) { toast('Choose a file first', 'err'); return; }
    setBusy(true); setLatest(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      fd.append('label', label || file.name);
      const r = await api.upload(`/api/encounters/${encounter.id}/results/file`, fd);
      setLatest(r);
      setFile(null); setLabel('');
      toast('File interpreted by AI.', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card stage-card" style={{ marginBottom: 14 }}>
      <h3 className="card-title">📥 Add a result for AI interpretation</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('text')} className={'btn btn-sm ' + (tab === 'text' ? 'btn-primary' : 'btn-ghost')}>📝 Text values</button>
        <button onClick={() => setTab('file')} className={'btn btn-sm ' + (tab === 'file' ? 'btn-primary' : 'btn-ghost')}>📁 Upload file (X-ray, ECG, PDF…)</button>
      </div>

      <div className="row-2">
        <div className="field">
          <label>Result type</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="lab">Lab values</option>
            <option value="xray">X-ray</option>
            <option value="ecg">ECG</option>
            <option value="scan">CT / MRI / Ultrasound</option>
            <option value="photo">Clinical photo</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. CBC, Chest X-ray PA, 12-lead ECG" />
        </div>
      </div>

      {tab === 'text' ? (
        <>
          <div className="field">
            <label>Values (paste or type)</label>
            <textarea rows={5} value={valuesText} onChange={e => setValuesText(e.target.value)}
              placeholder={'e.g.\nWBC 14.2 (4-11)\nHb 9.1 (12-16)\nPlt 88 (150-400)\nNa 130, K 5.6, Cr 1.8'}
              style={ta} />
          </div>
          <button className="btn btn-primary" onClick={submitText} disabled={busy}>
            {busy ? <span className="spinner" /> : '🧠 Interpret with AI'}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label>File (image, DICOM PNG, or PDF — up to 25 MB)</label>
            <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <button className="btn btn-primary" onClick={submitFile} disabled={busy || !file}>
            {busy ? <span className="spinner" /> : '🧠 Upload & interpret'}
          </button>
        </>
      )}

      {latest && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: latest.abnormal ? '#fef2f2' : '#ecfdf5', border: '1px solid ' + (latest.abnormal ? '#fecaca' : '#d1fae5') }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>
            {latest.abnormal ? '⚠️ Abnormal findings detected' : '✅ No significant abnormality'}{latest.urgent ? '  🚨 URGENT' : ''}
            {latest.result_type && <span style={{ fontWeight:400, fontSize:12, color:'#64748b', marginLeft:8 }}>{latest.result_type}</span>}
          </div>

          {/* Systematic findings */}
          {latest.systematic_findings && Object.keys(latest.systematic_findings).length > 0 && (
            <div style={{ marginBottom: 10, background: '#fff', borderRadius: 8, padding: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Systematic Findings
              </div>
              {Object.entries(latest.systematic_findings).map(([zone, finding], i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#374151', minWidth: 120 }}>{zone}:</span>
                  <span style={{ color: '#1e293b' }}>{finding}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.7 }}>{latest.explanation}</div>

          {latest.abnormalFindings?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>⚠️ Abnormal Findings:</div>
              <ul style={{ paddingLeft: 18, fontSize: 13.5, color: '#b91c1c' }}>
                {latest.abnormalFindings.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}

          {latest.normalFindings?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>✅ Key Normal Findings:</div>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: '#374151' }}>
                {latest.normalFindings.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}

          {latest.clinicalSignificance && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e3a8a', borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>Clinical Significance:</div>
              {latest.clinicalSignificance}
            </div>
          )}

          {latest.recommendations?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>📋 Recommendations:</div>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: '#374151' }}>
                {latest.recommendations.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}

          {latest.limitations && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              ⚠️ Limitations: {latest.limitations}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ta = {
  width: '100%', padding: '11px 13px',
  border: '1px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
};

function ResultsList({ results }) {
  return (
    <div className="card stage-card" style={{ marginBottom: 14 }}>
      <h3 className="card-title">📋 Recorded results ({results.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.slice().reverse().map((r, i) => (
          <div key={i} style={{
            border: '1px solid ' + (r.abnormal ? '#fecaca' : '#e2e8f0'),
            background: r.abnormal ? '#fff5f5' : '#fff',
            borderRadius: 12, padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ fontSize: 14 }}>
                <span className="pill pill-gray" style={{ marginRight: 6 }}>{r.kind}</span>
                {r.label || '—'}
              </strong>
              {r.abnormal ? <span className="pill pill-red">Abnormal</span> : <span className="pill pill-mint">Normal</span>}
            </div>
            {r.interpretation && <div style={{ fontSize: 13.5, color: '#334155' }}>{r.interpretation}</div>}
            {r.abnormalFindings?.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: '#7f1d1d' }}>
                {r.abnormalFindings.map((x, j) => <li key={j}>{x}</li>)}
              </ul>
            )}
            {r.clinicalSignificance && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>
                {r.clinicalSignificance}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
