import { useState } from 'react';
import { api } from '../services/api';
import StageNav from './StageNav';
import PhaseReport from './PhaseReport';

function buildSafePlan(src) {
  const s = (src && typeof src === 'object') ? src : {};
  return {
    immediate:      Array.isArray(s.immediate)      ? s.immediate      : [],
    medications:    Array.isArray(s.medications)    ? s.medications    : [],
    non_pharm:      Array.isArray(s.non_pharm)      ? s.non_pharm      : [],
    monitoring:     Array.isArray(s.monitoring)     ? s.monitoring     : [],
    follow_up:      (typeof s.follow_up      === 'string') ? s.follow_up      : '',
    patient_advice: (typeof s.patient_advice === 'string') ? s.patient_advice : '',
    referrals:      Array.isArray(s.referrals)      ? s.referrals      : [],
    red_flags:      Array.isArray(s.red_flags)      ? s.red_flags      : [],
  };
}

export default function TreatmentStage({ encounter, refresh, toast, onComplete, onBack }) {
  const tp = (encounter && encounter.treatment_plan) ? encounter.treatment_plan : {};

  const [plan,       setPlan]       = useState(() => buildSafePlan(tp));
  const [structured, setStructured] = useState(tp.structured || null);
  const [source,     setSource]     = useState(tp.source     || '');
  const [busy,       setBusy]       = useState(false);

  const [allergyWarnings, setAllergyWarnings] = useState(tp.allergy_warnings || []);

  const runAI = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/treatment/suggest`);
      setPlan(buildSafePlan(r && r.plan ? r.plan : {}));
      setStructured((r && r.structured) || null);
      setSource((r && r.source) || '');
      setAllergyWarnings((r?.plan?.allergy_warnings) || (r?.structured?.allergy_warnings) || []);
      const allergyMsg = (r?.plan?.allergy_warnings?.length || r?.structured?.allergy_warnings?.length)
        ? ` ⚠️ ${r.plan?.allergy_warnings?.length || r.structured?.allergy_warnings?.length} allergy conflict(s) detected!`
        : '';
      toast((r && r.source === 'ai' ? 'AI treatment plan generated.' : 'DB fallback used.') + allergyMsg, allergyMsg ? 'err' : 'ok');
      await refresh();
    } catch (e) {
      toast(e.message || 'AI request failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const save = async (close = false) => {
    setBusy(true);
    try {
      await api.post(`/api/encounters/${encounter.id}/treatment/save`, { ...plan, structured, source });
      if (close) {
        await api.post(`/api/encounters/${encounter.id}/close`);
        toast('Encounter closed.', 'ok');
      } else {
        toast('Treatment plan saved.', 'ok');
      }
      await refresh();
      if (close && onComplete) onComplete();
    } catch (e) {
      toast(e.message || 'Save failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const downloadPDF = () => {
    const url   = `/api/encounters/${encounter.id}/pdf`;
    const token = localStorage.getItem('novamed_token');
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => { if (!r.ok) throw new Error('PDF failed'); return r.blob(); })
      .then(b => {
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = `NovaMed-encounter-${encounter.id}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      })
      .catch(() => toast('PDF download failed', 'err'));
  };

  const addStr = (k)       => setPlan(p => ({ ...p, [k]: [...(p[k] || []), ''] }));
  const updStr = (k, i, v) => setPlan(p => { const a = [...(p[k] || [])]; a[i] = v; return { ...p, [k]: a }; });
  const delStr = (k, i)    => setPlan(p => ({ ...p, [k]: (p[k] || []).filter((_, j) => j !== i) }));

  const addMed = () => setPlan(p => ({
    ...p,
    medications: [...(p.medications || []), { name: '', dose: '', route: '', frequency: '', duration: '', notes: '' }],
  }));
  const updMed = (i, field, v) => setPlan(p => {
    const a = [...(p.medications || [])]; a[i] = { ...a[i], [field]: v }; return { ...p, medications: a };
  });
  const delMed = (i) => setPlan(p => ({
    ...p, medications: (p.medications || []).filter((_, j) => j !== i),
  }));

  return (
    <div>
      {/* Allergy Warning Banner */}
      {allergyWarnings.length > 0 && (
        <div className="warning-banner" style={{ borderLeftColor: '#dc2626', background: '#fef2f2' }}>
          <h4>🚨 Allergy Conflict Alert — {allergyWarnings.length} medication(s) flagged</h4>
          {allergyWarnings.map((w, i) => (
            <div key={i} style={{ marginBottom: 8, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #fca5a5' }}>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>⛔ {w.drug} — conflicts with allergy: {w.allergy}</div>
              <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 3 }}>Risk: {w.risk}</div>
              {w.alternative && <div style={{ fontSize: 13, color: '#065f46', marginTop: 3 }}>✅ Suggested alternative: <strong>{w.alternative}</strong></div>}
            </div>
          ))}
        </div>
      )}

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, flexWrap:'wrap', gap:8 }}>
          <h3 className="card-title" style={{ margin:0 }}>Treatment plan</h3>
          <button className="btn btn-sm btn-primary" onClick={runAI} disabled={busy}>
            {busy ? <span className="spinner" /> : 'AI suggest plan'}
          </button>
        </div>
        <div className="card-sub">AI suggestions are decision support — you finalise everything below.</div>
      </div>

      {structured && (
        <>
          <div className="card stage-card" style={{ marginBottom:14 }}>
            <h3 className="card-title">
              First-line treatment
              {source === 'ai' && <span className="pill pill-violet" style={{ marginLeft:8, fontSize:11 }}>AI</span>}
            </h3>
            <DrugTable rows={structured.first_line || []} />
          </div>

          {Array.isArray(structured.alternatives) && structured.alternatives.length > 0 && (
            <div className="card stage-card" style={{ marginBottom:14 }}>
              <h3 className="card-title">🔄 Alternative Drugs (if first-line contraindicated or fails)</h3>
              <DrugTable rows={structured.alternatives} showAlternativeCol={true} />
            </div>
          )}

          {structured.clinical_reasoning && (
            <div className="card stage-card" style={{ marginBottom:14 }}>
              <h3 className="card-title">Clinical reasoning</h3>
              <p style={{ margin:0, fontSize:14, color:'#334155', lineHeight:1.6 }}>{structured.clinical_reasoning}</p>
            </div>
          )}
        </>
      )}

      <ListEditor title="Immediate actions" items={plan.immediate} placeholder="e.g. Oxygen 2 L/min"
        onAdd={() => addStr('immediate')} onChange={(i,v) => updStr('immediate',i,v)} onDelete={i => delStr('immediate',i)} />

      <div className="card stage-card" style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 className="card-title" style={{ margin:0 }}>Medications</h3>
          <button className="btn btn-sm btn-ghost" onClick={addMed}>+ Add</button>
        </div>
        {(plan.medications || []).length === 0 && (
          <div className="muted" style={{ fontSize:13 }}>No medications yet — use AI suggest or add manually.</div>
        )}
        {(plan.medications || []).map((m, i) => (
          <div key={i} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:12, marginBottom:10 }}>
            <div className="row-2">
              <Inp lbl="Drug"      v={m.name      || ''} onC={v => updMed(i,'name',v)} />
              <Inp lbl="Dose"      v={m.dose      || ''} onC={v => updMed(i,'dose',v)} />
            </div>
            <div className="row-3">
              <Inp lbl="Route"     v={m.route     || ''} onC={v => updMed(i,'route',v)} />
              <Inp lbl="Frequency" v={m.frequency || ''} onC={v => updMed(i,'frequency',v)} />
              <Inp lbl="Duration"  v={m.duration  || ''} onC={v => updMed(i,'duration',v)} />
            </div>
            <Inp lbl="Notes" v={m.notes || ''} onC={v => updMed(i,'notes',v)} />
            <button className="btn btn-sm btn-ghost" onClick={() => delMed(i)} style={{ marginTop:6 }}>Remove</button>
          </div>
        ))}
      </div>

      <ListEditor title="Non-pharmacological / supportive" items={plan.non_pharm}
        onAdd={() => addStr('non_pharm')} onChange={(i,v) => updStr('non_pharm',i,v)} onDelete={i => delStr('non_pharm',i)} />

      <ListEditor title="Monitoring" items={plan.monitoring} placeholder="e.g. Vitals every 4 hours"
        onAdd={() => addStr('monitoring')} onChange={(i,v) => updStr('monitoring',i,v)} onDelete={i => delStr('monitoring',i)} />

      <div className="card stage-card" style={{ marginBottom:14 }}>
        <h3 className="card-title">Follow-up</h3>
        <input value={plan.follow_up || ''} onChange={e => setPlan(p => ({ ...p, follow_up: e.target.value }))}
          placeholder="e.g. Review in 1 week"
          style={{ width:'100%', padding:'11px 13px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:14, boxSizing:'border-box' }} />
      </div>

      <div className="card stage-card" style={{ marginBottom:14 }}>
        <h3 className="card-title">Advice for the patient</h3>
        <textarea rows={4} value={plan.patient_advice || ''} onChange={e => setPlan(p => ({ ...p, patient_advice: e.target.value }))}
          placeholder="Plain-language advice the patient can take home..."
          style={{ width:'100%', padding:'11px 13px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:14, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
      </div>

      <ListEditor title="Referrals" items={plan.referrals}
        onAdd={() => addStr('referrals')} onChange={(i,v) => updStr('referrals',i,v)} onDelete={i => delStr('referrals',i)} />

      <ListEditor title="Red flags — return immediately if:" items={plan.red_flags} red
        onAdd={() => addStr('red_flags')} onChange={(i,v) => updStr('red_flags',i,v)} onDelete={i => delStr('red_flags',i)} />

      <PhaseReport encounterId={encounter.id} phase="treatment" label="Treatment" toast={toast} />

      <StageNav
        onBack={onBack}
        backLabel="Back"
        onForward={() => save(true)}
        forwardLabel={busy ? '...saving' : 'Save and close encounter'}
        busy={busy}
        extra={
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-ghost" onClick={downloadPDF}>PDF</button>
            <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy}>Save draft</button>
          </div>
        }
      />
    </div>
  );
}

function Inp({ lbl, v, onC }) {
  return (
    <div className="field" style={{ marginBottom:8 }}>
      <label>{lbl}</label>
      <input value={v == null ? '' : v} onChange={e => onC(e.target.value)} />
    </div>
  );
}

function ListEditor({ title, items, placeholder, onAdd, onChange, onDelete, red }) {
  const safe = Array.isArray(items) ? items : [];
  return (
    <div className="card stage-card" style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <h3 className="card-title" style={{ margin:0, color: red ? '#b91c1c' : undefined }}>{title}</h3>
        <button className="btn btn-sm btn-ghost" onClick={onAdd}>+ Add</button>
      </div>
      {safe.length === 0 ? (
        <div className="muted" style={{ fontSize:13 }}>None.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {safe.map((it, i) => (
            <div key={i} style={{ display:'flex', gap:6 }}>
              <input value={it == null ? '' : it} onChange={e => onChange(i, e.target.value)}
                placeholder={placeholder || ''}
                style={{ flex:1, padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13.5 }} />
              <button className="btn btn-sm btn-ghost" onClick={() => onDelete(i)}>X</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DrugTable({ rows, showAlternativeCol = false }) {
  const safe = Array.isArray(rows) ? rows : [];
  if (safe.length === 0) return <div className="muted" style={{ fontSize:13 }}>No drugs in this category.</div>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table className="treatment-table" style={{ fontSize: 12, minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ minWidth:130 }}>Drug</th>
            <th style={{ minWidth:90 }}>Dose</th>
            <th style={{ minWidth:80 }}>Route</th>
            <th style={{ minWidth:80 }}>Freq / Duration</th>
            <th style={{ minWidth:160 }}>Mechanism of Action</th>
            <th style={{ minWidth:140 }}>Indication</th>
            <th style={{ minWidth:130 }}>Contraindications</th>
            <th style={{ minWidth:130 }}>Side Effects</th>
            {showAlternativeCol && <th style={{ minWidth:120 }}>When to Use</th>}
          </tr>
        </thead>
        <tbody>
          {safe.map((d, i) => {
            const allergyConflict = d.allergy_safe === false;
            const rowStyle = allergyConflict
              ? { background: '#fef2f2', borderLeft: '4px solid #dc2626' }
              : i % 2 === 0 ? { background: '#f8fafc' } : {};
            return (
              <tr key={i} style={rowStyle}>
                <td className="drug-name" style={{ fontWeight: 700 }}>
                  {allergyConflict && <span style={{ color:'#dc2626', marginRight: 4 }}>⛔</span>}
                  {d.drug || d.name || '—'}
                  {allergyConflict && d.allergy_note && (
                    <div style={{ fontSize:10, color:'#b91c1c', marginTop:3, fontWeight:400 }}>
                      ⚠️ {d.allergy_note}
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 600, color: '#0f172a' }}>{d.dose || '—'}</td>
                <td>
                  <span style={{ background:'#dbeafe', color:'#1e40af', borderRadius:12, padding:'2px 8px', fontSize:11, fontWeight:600 }}>
                    {d.route || '—'}
                  </span>
                </td>
                <td style={{ fontSize:11, color:'#374151' }}>
                  {d.frequency || '—'}
                  {d.duration && <div style={{ color:'#64748b', marginTop:2 }}>{d.duration}</div>}
                </td>
                <td style={{ fontSize:11, lineHeight:1.5 }}>{d.mechanism_of_action || d.mechanism || '—'}</td>
                <td style={{ fontSize:11, lineHeight:1.5 }}>{d.indication || '—'}</td>
                <td style={{ fontSize:11, color:'#7c3aed', lineHeight:1.5 }}>{d.contraindications || '—'}</td>
                <td style={{ fontSize:11, color:'#b45309', lineHeight:1.5 }}>{d.side_effects || d.side_effect || '—'}</td>
                {showAlternativeCol && <td style={{ fontSize:11, color:'#0369a1' }}>{d.when_to_use || d.indication || '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
