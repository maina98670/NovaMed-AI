import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import StageNav from './StageNav';
import PhaseReport from './PhaseReport';

/**
 * History stage. Three input modes:
 *   - 'form'  : highly detailed structured fields per section
 *   - 'chat'  : AI asks one adaptive question, doctor types patient answer
 *   - 'voice' : same as chat but the patient/doctor can speak the answer
 */
export default function HistoryStage({ encounter, patient, turns, refresh, toast, onComplete, onBack }) {
  const mode = encounter.input_mode || 'form';
  return mode === 'form'
    ? <FormHistory encounter={encounter} patient={patient} toast={toast} onComplete={onComplete} onBack={onBack} />
    : <ChatHistory encounter={encounter} turns={turns} refresh={refresh}
                   toast={toast} useVoice={mode === 'voice'}
                   onComplete={onComplete} onBack={onBack} />;
}

/* Schemas: easy to extend later */
const HX_SCHEMA = {
  HPC: {
    label: 'History of Presenting Complaint (SOCRATES + detail)',
    fields: {
      'Site / Location': '',
      'Onset (sudden vs gradual; date & time)': '',
      'Character / Quality (sharp, dull, burning, crampy…)': '',
      'Radiation': '',
      'Severity (0–10 now / worst / average)': '',
      'Timing & duration / pattern (continuous, intermittent, episodic)': '',
      'Aggravating factors': '',
      'Relieving factors (incl. self-medication, what has been tried)': '',
      'Progression since onset (better, worse, fluctuating)': '',
      'Associated symptoms (fevers, chills, sweats, weight loss, fatigue, etc.)': '',
      'Impact on activities of daily living / sleep / work': '',
      'Previous similar episodes (when, treatment, outcome)': '',
      'Recent travel / sick contacts / outbreaks': '',
      'Trigger event (trauma, food, exercise, stress, exposure)': '',
    },
  },
  PMH: {
    label: 'Past Medical & Surgical History',
    fields: {
      'Chronic illnesses (diabetes, hypertension, asthma, HIV, TB, sickle cell, etc.)': '',
      'Childhood illnesses (rheumatic fever, measles, etc.)': '',
      'Past hospitalisations (when, where, reason)': '',
      'Past surgeries / anaesthesia (with dates)': '',
      'Blood transfusions / reactions': '',
      'Immunisations (status, last tetanus, COVID, hepatitis, etc.)': '',
      'Cancer screening (Pap, mammogram, colonoscopy, PSA)': '',
      'Mental health diagnoses & past treatment': '',
      'Similar episodes in the past': '',
    },
  },
  DH: {
    label: 'Drug & Allergy History',
    fields: {
      'Current prescription medications (name, dose, route, frequency, indication, duration, prescriber)': '',
      'Over-the-counter medicines (paracetamol, NSAIDs, antacids, decongestants, etc.)': '',
      'Herbal / traditional / complementary remedies': '',
      'Recent antibiotic use (last 3 months)': '',
      'Drug allergies (drug, type of reaction, severity)': '',
      'Food / environmental allergies': '',
      'Adherence / compliance (missed doses, side-effects)': '',
      'Vaccinations received this year': '',
      'Recreational substance use (and last use)': '',
    },
  },
  FH: {
    label: 'Family History',
    fields: {
      'Mother — alive/dead, age, conditions': '',
      'Father — alive/dead, age, conditions': '',
      'Siblings — number, ages, health': '',
      'Children — number, ages, health': '',
      'Cardiovascular disease in 1st-degree relative <60 yrs': '',
      'Cancer in family (type, age at diagnosis)': '',
      'Diabetes / endocrine disease': '',
      'Mental illness / suicide': '',
      'Inherited / genetic disorders': '',
      'Tuberculosis or other infectious contacts at home': '',
      'Consanguinity (if applicable)': '',
    },
  },
  SH: {
    label: 'Social & Lifestyle History',
    fields: {
      'Occupation (current & past, exposures)': '',
      'Education level': '',
      'Marital / relationship status & support network': '',
      'Living arrangement (with whom, type of housing, water, sanitation)': '',
      'Smoking (cigarettes/day × years = pack-years; chewing tobacco; vaping)': '',
      'Alcohol (units/week; binge pattern; CAGE if relevant)': '',
      'Recreational drugs (which, route, frequency, last use)': '',
      'Sexual history (partners, protection, STIs) — if relevant': '',
      'Diet (typical day; salt; fluid intake)': '',
      'Physical activity / exercise': '',
      'Sleep (hours, quality, snoring, daytime sleepiness)': '',
      'Travel (last 12 months; rural areas; insect/animal contact)': '',
      'Pets / animal exposure': '',
      'Recent stress / mood / coping': '',
      'Financial / insurance situation affecting care': '',
      'Driving / occupational hazards / firearms at home (if relevant)': '',
    },
  },
  ROS: {
    label: 'Review of Systems (mark anything noticed by patient)',
    fields: {
      'General (fever, chills, sweats, weight change, appetite, fatigue)': '',
      'Skin / hair / nails (rashes, lumps, itching, pigment changes)': '',
      'Head / Eyes (headache, vision change, eye pain, redness)': '',
      'ENT (hearing loss, ear pain, sore throat, nasal symptoms, epistaxis)': '',
      'Cardiovascular (chest pain, palpitations, orthopnoea, PND, oedema, claudication)': '',
      'Respiratory (cough, sputum, haemoptysis, wheeze, dyspnoea, snoring)': '',
      'Gastrointestinal (nausea, vomiting, dysphagia, heartburn, abdominal pain, bowel habit, blood/melaena)': '',
      'Genitourinary (frequency, urgency, dysuria, haematuria, incontinence, flank pain)': '',
      'Reproductive / sexual / menstrual (LMP, cycle, discharge, dyspareunia, contraception)': '',
      'Musculoskeletal (joint pain/swelling, stiffness, weakness, back pain)': '',
      'Neurological (LOC, seizures, weakness, numbness, tremor, gait, memory, headache)': '',
      'Endocrine (heat/cold intolerance, polyuria, polydipsia, hair changes)': '',
      'Haematological (bruising, bleeding, pallor, lymph node swelling)': '',
      'Psychiatric (mood, anxiety, sleep, appetite, suicidal/homicidal ideation)': '',
      'Immune / Infectious (recurrent infections, known immunocompromise)': '',
    },
  },
};

const SPECIAL_SCHEMA = {
  pediatric: {
    label: 'Pediatric specifics',
    fields: {
      'Birth (term/preterm, weight, mode of delivery, complications)': '',
      'Neonatal period (NICU, jaundice, feeding difficulties)': '',
      'Feeding history (breast/formula, weaning, current diet)': '',
      'Growth (last known weight/height, growth chart concerns)': '',
      'Developmental milestones (motor, language, social, school)': '',
      'Immunisation status (per local schedule, any missed)': '',
      'School / behaviour / social': '',
      'Toilet training / sleep / appetite': '',
    },
  },
  obstetric: {
    label: 'Obstetric specifics',
    fields: {
      'LMP / EDD / gestational age': '',
      'Gravidity / Parity / abortions / living children': '',
      'Antenatal care (visits, anomaly scan, blood group/Rh, screening)': '',
      'Previous pregnancies (mode of delivery, complications, birth weights)': '',
      'Current pregnancy complaints (bleeding, pain, leakage, foetal movements)': '',
      'Medical conditions in pregnancy (HTN, DM, anaemia, infections)': '',
      'Medication / herb / alcohol / smoking exposure': '',
      'Vaccinations (Tdap, influenza, hepatitis)': '',
    },
  },
  gynecological: {
    label: 'Gynecological specifics',
    fields: {
      'Menstrual (menarche, cycle length & regularity, flow, dysmenorrhoea, IMB/PCB)': '',
      'LMP / pregnancy possibility': '',
      'Sexual history (partners, dyspareunia, libido, STI risk)': '',
      'Contraceptive method & duration': '',
      'Cervical screening (last Pap / HPV)': '',
      'Discharge / pruritus / pelvic pain': '',
      'Menopause (status, HRT, vasomotor symptoms)': '',
      'Previous gynae surgeries / fertility treatment': '',
    },
  },
  psychiatric: {
    label: 'Psychiatric specifics',
    fields: {
      'Mood (current, recent change, lowest period)': '',
      'Anhedonia / energy / interest': '',
      'Sleep pattern (initial, middle, terminal insomnia)': '',
      'Appetite / weight change': '',
      'Concentration / decision making': '',
      'Suicidal ideation, plan, intent, prior attempts': '',
      'Homicidal ideation / harm to others': '',
      'Psychotic symptoms (delusions, hallucinations)': '',
      'Anxiety symptoms / panic attacks': '',
      'Substance use (current & past)': '',
      'Psychosocial stressors (work, relationships, finance, loss)': '',
      'Functional impact (work, relationships, ADLs)': '',
      'Previous psychiatric treatment / hospitalisation': '',
      'Insight / judgment as perceived by clinician': '',
    },
  },
  trauma: {
    label: 'Trauma specifics',
    fields: {
      'Mechanism of injury (detailed: speed, direction, height, weapon)': '',
      'Time & place of injury': '',
      'Loss of consciousness (duration, witnessed)': '',
      'Amnesia (retrograde / antegrade) / seizure': '',
      'Helmet / seatbelt / airbag use': '',
      'First-aid received pre-hospital': '',
      'Other injured persons / fatalities at scene': '',
      'Tetanus immunisation status': '',
      'Other associated symptoms (pain, weakness, numbness, breathing)': '',
      'Substances on board (alcohol, drugs, prescription)': '',
    },
  },
  surgical: {
    label: 'Surgical specifics',
    fields: {
      'Previous operations (with dates, hospital, surgeon)': '',
      'Anaesthetic complications (PONV, MH, awareness, difficult airway)': '',
      'Family history of anaesthetic problems': '',
      'Current surgical complaint timeline': '',
      'Prior abdominal surgery / scars': '',
      'Implants / devices (pacemaker, prosthesis, mesh, stents)': '',
      'Bleeding disorders / bruising': '',
      'Anticoagulant / antiplatelet use': '',
      'Smoking / alcohol within 24 hrs': '',
      'Last meal & fluid intake (NPO status)': '',
    },
  },
};

function FormHistory({ encounter, patient, toast, onComplete, onBack }) {
  const [busy, setBusy] = useState(false);

  const buildInitial = () => {
    const out = {};
    for (const [sec, def] of Object.entries(HX_SCHEMA)) {
      out[sec] = {};
      for (const [k, v] of Object.entries(def.fields)) out[sec][k] = v || '';
    }
    const allergyKey = Object.keys(out.DH).find(k => k.toLowerCase().includes('drug allergies'));
    if (allergyKey) out.DH[allergyKey] = encounter.allergies || patient.allergies || '';
    const sk = encounter.history_type && encounter.history_type !== 'general' ? encounter.history_type : null;
    if (sk && SPECIAL_SCHEMA[sk]) {
      const upper = sk.toUpperCase();
      out[upper] = {};
      for (const [k, v] of Object.entries(SPECIAL_SCHEMA[sk].fields)) out[upper][k] = v;
    }
    return out;
  };

  const [data, setData] = useState(buildInitial);
  const setField = (sec, key, v) => setData(s => ({ ...s, [sec]: { ...s[sec], [key]: v } }));

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/encounters/${encounter.id}/history/form`, { sections: data });
      toast('History saved. Moving to examination.', 'ok');
      onComplete();
    } catch (e) { toast(e.message || 'Failed to save', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="card legend-card" style={{ marginBottom: 14 }}>
        <strong>Detailed history form.</strong> Fill what is relevant — empty fields are simply omitted from the
        summary. The more information you capture here, the better the diagnosis, investigations and treatment AI can be.
      </div>

      {Object.entries(data).map(([sec, fields]) => (
        <div key={sec} className="card stage-card" style={{ marginBottom: 14 }}>
          <h3 className="card-title">{sectionLabel(sec)}</h3>
          <div className="row-2">
            {Object.entries(fields).map(([k, v]) => (
              <div key={k} className="field" style={{ marginBottom: 10 }}>
                <label>{k}</label>
                <textarea rows={2} value={v} onChange={e => setField(sec, k, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <PhaseReport encounterId={encounter.id} phase="history" label="History" toast={toast} />

      <StageNav
        onBack={onBack}
        backLabel="← Back"
        onForward={submit}
        forwardLabel={busy ? '…saving' : 'Save & continue → Examination'}
        busy={busy}
      />
    </div>
  );
}

function sectionLabel(s) {
  if (HX_SCHEMA[s]) return HX_SCHEMA[s].label;
  const lower = s.toLowerCase();
  if (SPECIAL_SCHEMA[lower]) return SPECIAL_SCHEMA[lower].label;
  return s;
}

function ChatHistory({ encounter, turns, refresh, toast, useVoice, onComplete, onBack }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [speakAi, setSpeakAi] = useState(useVoice);
  const recogRef = useRef(null);
  const scrollRef = useRef(null);

  const lastAi = [...turns].reverse().find(t => t.role === 'ai');
  const hasStarted = !!lastAi;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length]);

  useEffect(() => {
    if (!useVoice) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map(x => x[0].transcript).join('');
      setAnswer(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
  }, [useVoice]);

  const startListening = () => {
    if (!recogRef.current) { toast('Voice not supported in this browser', 'err'); return; }
    setAnswer(''); setListening(true);
    try { recogRef.current.start(); } catch { setListening(false); }
  };
  const stopListening = () => {
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
  };

  const speak = (text) => {
    if (!speakAi || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 1; u.volume = 1;
    window.speechSynthesis.speak(u);
  };

  useEffect(() => {
    if (!hasStarted && !busy) askNext('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askNext(lastAnswer) {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounter.id}/history/next`, { lastAnswer });
      if (r.done) { toast('History complete. Moving to examination.', 'ok'); onComplete(); return; }
      if (r.question) speak(r.question);
      await refresh();
    } catch (e) { toast(e.message || 'AI failed', 'err'); }
    finally { setBusy(false); }
  }

  const submit = (e) => {
    e?.preventDefault?.();
    const a = answer.trim();
    if (!a) return;
    setAnswer('');
    askNext(a);
  };

  const endManually = async () => {
    setBusy(true);
    try {
      const lines = turns.filter(t => t.answer).map(t => `- ${t.section || '-'}: ${t.answer}`).join('\n');
      await api.patch(`/api/encounters/${encounter.id}`, { history_summary: lines, status: 'examination' });
      toast('History closed manually.', 'ok');
      onComplete();
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="card stage-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            🩺 Adaptive history-taking
            {useVoice && <span className="pill pill-mint" style={{ marginLeft: 8 }}>🎤 Voice mode</span>}
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {useVoice && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                <input type="checkbox" checked={speakAi} onChange={e => setSpeakAi(e.target.checked)} />
                AI speaks
              </label>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => askNext('skip')} disabled={busy}>Skip question</button>
            <button className="btn btn-sm btn-success" onClick={endManually} disabled={busy}>End & summarize</button>
          </div>
        </div>

        <div className="scroll-area" ref={scrollRef} style={{ minHeight: 320, maxHeight: 520, padding: '6px 4px', background: '#f8fafc', borderRadius: 12 }}>
          <div className="chat">
            {turns.length === 0 && (
              <div className="bubble ai" style={{ alignSelf: 'flex-start' }}>
                <div className="meta">NovaMed AI</div>
                Preparing your first question…
              </div>
            )}
            {turns.map(t => (
              <div key={t.id} className={'bubble ' + (t.role === 'ai' ? 'ai' : 'me')}>
                <div className="meta">{t.role === 'ai' ? `AI · ${t.section || ''}` : (t.role === 'patient' ? 'Patient' : 'Doctor')}</div>
                {t.role === 'ai' ? t.question : t.answer}
                {t.meta?.rationale && t.role === 'ai' && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                    Why: {t.meta.rationale}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="bubble ai">
                <div className="meta">NovaMed AI</div>
                <span className="spinner" /> thinking…
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submit} style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={listening ? 'Listening… speak now' : "Type the patient's answer…"}
            disabled={busy || listening}
            style={{ flex: 1, minWidth: 200, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14 }}
            autoFocus
          />
          {useVoice && (
            listening
              ? <button type="button" className="btn btn-danger" onClick={stopListening}>■ Stop</button>
              : <button type="button" className="btn btn-ghost" onClick={startListening} disabled={busy}>🎤 Speak</button>
          )}
          <button className="btn btn-primary" disabled={busy || !answer.trim()}>Send →</button>
        </form>
      </div>

      <PhaseReport encounterId={encounter.id} phase="history" label="History" toast={toast} />

      <StageNav
        onBack={onBack}
        backLabel="← Back"
        onForward={endManually}
        forwardLabel="Finish history → Examination"
        busy={busy}
      />
    </div>
  );
}
