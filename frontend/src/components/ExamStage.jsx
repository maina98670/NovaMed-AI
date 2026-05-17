import { useState } from 'react';
import { api } from '../services/api';
import StageNav from './StageNav';
import PhaseReport from './PhaseReport';

/**
 * Comprehensive examination stage with system-by-system detail
 * and structured general / vitals / GCS components.
 */
export default function ExamStage({ encounter, refresh, toast, onComplete, onBack }) {
  const init = encounter.examination || {};

  const [v, setV] = useState({
    systolic: '', diastolic: '', heartRate: '', respRate: '',
    temperature: '', spo2: '',
    gcs: '15', gcs_e: '4', gcs_v: '5', gcs_m: '6',
    weight: '', height: '', bmi: '', bmi_class: '',
    bp_class: '',
    bgl: '',           // blood glucose mmol/L
    pain_score: '',    // 0-10
    cap_refill: '',    // seconds
    ...(init.vitals || {}),
  });

  // Auto-compute BMI + classification whenever weight or height changes
  const setVital = (k, val) => {
    setV(s => {
      const next = { ...s, [k]: val };
      // Recompute BMI
      if (k === 'weight' || k === 'height') {
        const w = parseFloat(k === 'weight' ? val : s.weight);
        const hCm = parseFloat(k === 'height' ? val : s.height);
        if (w > 0 && hCm > 0) {
          const h = hCm / 100;
          const bmiVal = (w / (h * h)).toFixed(1);
          let bmiClass = '';
          const b = parseFloat(bmiVal);
          if (b < 16)       bmiClass = 'Severely Underweight';
          else if (b < 18.5) bmiClass = 'Underweight';
          else if (b < 25)   bmiClass = 'Normal';
          else if (b < 30)   bmiClass = 'Overweight';
          else if (b < 35)   bmiClass = 'Obese I';
          else if (b < 40)   bmiClass = 'Obese II';
          else               bmiClass = 'Obese III (Morbidly Obese)';
          next.bmi = bmiVal;
          next.bmi_class = bmiClass;
        }
      }
      // Classify BP
      if (k === 'systolic' || k === 'diastolic') {
        const sys = parseFloat(k === 'systolic' ? val : s.systolic);
        const dia = parseFloat(k === 'diastolic' ? val : s.diastolic);
        if (!isNaN(sys) && !isNaN(dia)) {
          let bpClass = '';
          if      (sys < 90 || dia < 60)                 bpClass = 'Hypotension';
          else if (sys < 120 && dia < 80)                bpClass = 'Normal';
          else if (sys < 130 && dia < 80)                bpClass = 'Elevated';
          else if (sys < 140 || dia < 90)                bpClass = 'Stage 1 Hypertension';
          else if (sys < 160 || dia < 100)               bpClass = 'Stage 2 Hypertension';
          else if (sys >= 180 || dia >= 120)             bpClass = 'Hypertensive Crisis';
          else                                           bpClass = 'Stage 2 Hypertension';
          next.bp_class = bpClass;
        }
      }
      return next;
    });
  };

  const initSys = init.systems_detail || {};

  const [general, setGeneral] = useState(init.general || '');
  const [appearance, setAppearance] = useState(init.appearance || '');
  const [systems, setSystems] = useState({
    cvs:      initSys.cvs      || '',
    rs:       initSys.rs       || '',
    git:      initSys.git      || '',
    gu:       initSys.gu       || '',
    cns:      initSys.cns      || '',
    msk:      initSys.msk      || '',
    skin:     initSys.skin     || '',
    ent:      initSys.ent      || '',
    breast:   initSys.breast   || '',
    lymph:    initSys.lymph    || '',
    pelvic:   initSys.pelvic   || '',
    rectal:   initSys.rectal   || '',
    other:    initSys.other    || '',
  });

  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState(encounter.warnings || []);

  const setSys = (k, val) => setSystems(s => ({ ...s, [k]: val }));

  const save = async () => {
    setBusy(true);
    try {
      // BMI already computed live — just pass vitals as-is
      const sysText = Object.entries(systems)
        .filter(([_, val]) => val && val.trim())
        .map(([k, val]) => `${SYS_LABELS[k] || k}: ${val}`)
        .join('\n');

      const exam = {
        vitals: { ...v },
        general,
        appearance,
        systems: sysText,
        systems_detail: systems,
      };
      const r = await api.post(`/api/encounters/${encounter.id}/examination`, exam);
      setWarnings(r.warnings || []);
      toast('Examination saved.', 'ok');
      await refresh();
      if (!r.warnings?.some(w => w.level === 'critical')) onComplete();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {warnings.length > 0 && (
        <div className="warning-banner">
          <h4>⚠️ Abnormal signs detected</h4>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}><strong>{w.sign}</strong> — {w.detail} <em>({w.level})</em></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">Vital signs & basic measurements</h3>
        <div className="row-4">
          <Vital label="Systolic BP (mmHg)"  value={v.systolic}    onChange={x => setVital('systolic', x)} />
          <Vital label="Diastolic BP (mmHg)" value={v.diastolic}   onChange={x => setVital('diastolic', x)} />
          <Vital label="Heart rate (bpm)"    value={v.heartRate}   onChange={x => setVital('heartRate', x)} />
          <Vital label="Resp rate (/min)"    value={v.respRate}    onChange={x => setVital('respRate', x)} />
          <Vital label="Temperature (°C)"    value={v.temperature} onChange={x => setVital('temperature', x)} step="0.1" />
          <Vital label="SpO₂ (%)"            value={v.spo2}        onChange={x => setVital('spo2', x)} />
          <Vital label="Capillary refill (s)" value={v.cap_refill} onChange={x => setVital('cap_refill', x)} step="0.5" />
          <Vital label="Pain score (0–10)"   value={v.pain_score}  onChange={x => setVital('pain_score', x)} />
        </div>

        <h4 style={{ margin: '14px 0 8px' }}>Glasgow Coma Scale</h4>
        <div className="row-4">
          <Vital label="Eye opening (1–4)"   value={v.gcs_e} onChange={x => setVital('gcs_e', x)} />
          <Vital label="Verbal (1–5)"        value={v.gcs_v} onChange={x => setVital('gcs_v', x)} />
          <Vital label="Motor (1–6)"         value={v.gcs_m} onChange={x => setVital('gcs_m', x)} />
          <Vital label="Total GCS"           value={v.gcs}   onChange={x => setVital('gcs', x)} />
        </div>

        <h4 style={{ margin: '14px 0 8px' }}>Anthropometry & metabolic</h4>
        <div className="row-4">
          <Vital label="Weight (kg)"        value={v.weight} onChange={x => setVital('weight', x)} step="0.1" />
          <Vital label="Height (cm)"        value={v.height} onChange={x => setVital('height', x)} />
          <div className="field">
            <label>BMI (kg/m²) — auto</label>
            <input type="number" step="0.1" value={v.bmi} readOnly
              style={{ background: '#f8fafc', cursor: 'not-allowed' }} />
            {v.bmi_class && (
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700,
                color: v.bmi_class.includes('Obese') ? '#b91c1c' : v.bmi_class === 'Underweight' || v.bmi_class === 'Severely Underweight' ? '#b45309' : '#15803d' }}>
                {v.bmi_class}
              </div>
            )}
          </div>
          <Vital label="Random BGL (mmol/L)" value={v.bgl}   onChange={x => setVital('bgl', x)} step="0.1" />
        </div>

        {/* BP Classification badge */}
        {v.bp_class && (
          <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, display: 'inline-block',
            background: v.bp_class === 'Normal' ? '#d1fae5' : v.bp_class === 'Elevated' ? '#fef9c3' :
              v.bp_class.includes('Crisis') ? '#fee2e2' : '#fde8d8',
            color: v.bp_class === 'Normal' ? '#065f46' : v.bp_class.includes('Crisis') ? '#991b1b' : '#92400e',
            fontSize: 13, fontWeight: 700 }}>
            🩺 BP Classification: {v.bp_class}
          </div>
        )}
      </div>

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">General appearance & overall impression</h3>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Apparent state (alert, distressed, dehydrated, cachectic, well-perfused…)</label>
          <textarea rows={3} className="textarea" value={general} onChange={e => setGeneral(e.target.value)}
            placeholder="e.g. Alert, oriented to time/place/person, in mild distress, well-perfused, no pallor or jaundice, clinically euvolaemic…" />
        </div>
        <div className="field">
          <label>Posture / gait / handshake / smell</label>
          <textarea rows={2} className="textarea" value={appearance} onChange={e => setAppearance(e.target.value)}
            placeholder="e.g. Walks with antalgic gait favouring left leg; firm handshake; ketotic breath…" />
        </div>
      </div>

      <div className="card stage-card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">Systems examination — detail per system</h3>
        <div className="row-2">
          {Object.entries(systems).map(([k, val]) => (
            <div key={k} className="field" style={{ marginBottom: 10 }}>
              <label>{SYS_LABELS[k]}</label>
              <textarea rows={3} value={val} onChange={e => setSys(k, e.target.value)}
                placeholder={SYS_PLACEHOLDERS[k]} />
            </div>
          ))}
        </div>
      </div>

      <PhaseReport encounterId={encounter.id} phase="examination" label="Examination" toast={toast} />

      <StageNav
        onBack={onBack}
        onForward={save}
        forwardLabel={busy ? '…saving' : 'Save & continue → Diagnosis'}
        busy={busy}
      />
    </div>
  );
}

const SYS_LABELS = {
  cvs: 'Cardiovascular (pulse, JVP, apex, heart sounds, murmurs, oedema)',
  rs:  'Respiratory (chest expansion, percussion, breath sounds, added sounds)',
  git: 'Gastrointestinal / abdomen (inspection, bowel sounds, palpation, masses, tenderness, organomegaly)',
  gu:  'Genitourinary (suprapubic, renal angles, external genitalia)',
  cns: 'Neurological (cranial nerves, tone, power, reflexes, sensation, coordination)',
  msk: 'Musculoskeletal (joints, range of motion, gait, spine)',
  skin:'Skin / hair / nails (rashes, lesions, turgor, capillary refill)',
  ent: 'ENT / mouth (oropharynx, tonsils, ears, nose)',
  breast: 'Breast (if examined)',
  lymph:  'Lymph nodes (cervical, supraclavicular, axillary, inguinal)',
  pelvic: 'Pelvic (if examined; chaperone documented)',
  rectal: 'Rectal (if examined; chaperone documented)',
  other:  'Other findings',
};

const SYS_PLACEHOLDERS = {
  cvs: 'Pulse 88 reg, JVP not raised, apex non-displaced, S1+S2, no murmurs, no peripheral oedema, peripheries warm, all peripheral pulses present and symmetrical.',
  rs:  'Trachea central, expansion equal, percussion resonant, vesicular breath sounds, no crackles or wheeze.',
  git: 'Soft, non-tender, no masses or organomegaly, bowel sounds normal, no shifting dullness, hernial orifices intact.',
  gu:  'No suprapubic tenderness, no renal angle tenderness, external genitalia normal.',
  cns: 'GCS 15. Cranial nerves intact. Tone, power 5/5 throughout, reflexes 2+, sensation intact, coordination normal, gait steady.',
  msk: 'No deformity, full range of motion, no joint swelling or tenderness, normal spine alignment.',
  skin:'Warm, well-perfused, no rashes or lesions; turgor normal; capillary refill <2 s.',
  ent: 'Oropharynx clear, tonsils not enlarged, no exudate; ears: TM intact, no discharge; nasal mucosa pink.',
  breast: 'Symmetrical, no masses, no nipple discharge or skin changes; axillae clear.',
  lymph:  'No palpable lymphadenopathy.',
  pelvic: 'Speculum / bimanual findings as appropriate.',
  rectal: 'No external lesions; tone normal; no masses; brown stool on glove, no blood.',
  other:  'Anything else worth recording…',
};

function Vital({ label, value, onChange, step }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" step={step || '1'} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
