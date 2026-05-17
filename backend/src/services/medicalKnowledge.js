/**
 * NovaMed AI — Offline Medical Knowledge Base
 * ============================================================
 * Comprehensive rule-based clinical reasoning engine that
 * powers diagnosis, investigations and treatment when the
 * the external clinical AI is unavailable or returns nothing useful.
 *
 * IMPORTANT — this file is intentionally written so it can be
 * extended easily.  Every condition lives in CONDITIONS as a
 * single object with:
 *    keywords      — words/phrases in the case that fire it
 *    age, sex      — demographic biases
 *    vitalsHints   — vital-sign patterns that boost the score
 *    examHints     — examination words that boost the score
 *    differential  — name, ICD-ish hint, reasoning template
 *    investigations — labs / imaging / bedside / specialist
 *    treatment     — immediate, meds, monitoring, advice etc.
 *
 * To add a new condition just push one object onto CONDITIONS.
 *
 * NOTE: These are *suggestions* for clinical decision support
 * during AI downtime.  The doctor remains responsible for the
 * final decision.
 * ============================================================
 */

/* ================================================================
 *   1.  CONDITION LIBRARY
 * ================================================================
 * Each condition has a "score" function combining keyword hits,
 * vitals & exam hits, age / sex biases.
 */

const CONDITIONS = [
  // ---------------- CARDIOVASCULAR ----------------
  {
    name: 'Acute Coronary Syndrome (ACS / suspected MI)',
    system: 'Cardiovascular',
    keywords: ['chest pain', 'chest tightness', 'crushing', 'squeezing', 'pressure', 'left arm', 'jaw pain',
               'sweating', 'diaphoresis', 'shortness of breath on exertion', 'radiating', 'nausea with chest', 'angina'],
    againstKw: ['pleuritic', 'sharp stabbing chest', 'reproducible chest wall'],
    age: { min: 35 }, weight: 1.0,
    vitalsHints: { systolic: ['<90', '>180'], heartRate: ['>110', '<50'], spo2: ['<94'] },
    examHints: ['diaphoretic', 's4 gallop', 'bilateral crackles', 'pale', 'clammy'],
    redFlags: ['Crushing central chest pain', 'Radiation to jaw or left arm', 'Diaphoresis with hypotension',
               'New ECG ST changes', 'Hemodynamic instability'],
    reasoning: 'Cardiac-sounding chest pain with risk factors and/or autonomic features warrants urgent ACS workup. Time-critical — STEMI demands reperfusion within 90 min where available.',
    investigations: {
      bedside: [
        { test: '12-lead ECG (within 10 min)', reason: 'Detect STEMI / NSTEMI / arrhythmia.' },
        { test: 'Continuous cardiac monitoring', reason: 'Detect malignant arrhythmias.' },
        { test: 'Pulse oximetry & continuous BP', reason: 'Detect haemodynamic compromise.' },
      ],
      labs: [
        { test: 'High-sensitivity Troponin (0 hr & 3 hr)', reason: 'Confirm myocardial injury.' },
        { test: 'FBC, U&E, glucose', reason: 'Baseline; potassium correction; rule out anaemia.' },
        { test: 'Lipid profile', reason: 'Risk stratification.' },
        { test: 'Coagulation profile (PT/INR, aPTT)', reason: 'Pre-thrombolysis / anticoagulation.' },
        { test: 'BNP/NT-proBNP (if HF suspected)', reason: 'Heart failure overlay.' },
      ],
      imaging: [
        { test: 'Chest X-ray (PA)', reason: 'Pulmonary oedema, alternative diagnoses.' },
        { test: 'Echocardiogram', reason: 'Wall-motion abnormality, ejection fraction.' },
      ],
      specialist: [{ test: 'Urgent cardiology review', reason: 'Reperfusion / PCI decision.' }],
    },
    treatment: {
      immediate: [
        'Sit patient up, attach monitors, secure IV access × 2',
        'Oxygen ONLY if SpO₂ < 94 % (target 94-98 %)',
        'Aspirin 300 mg PO chewed (if no allergy / active bleed)',
        'Sublingual glyceryl trinitrate (GTN) 0.3-0.6 mg unless SBP < 90 or RV infarct suspected',
        'Morphine 2.5-5 mg IV titrated for pain only after GTN; antiemetic with first dose',
        'Activate cath lab / arrange transfer if STEMI is confirmed on ECG',
      ],
      medications: [
        { name: 'Aspirin', dose: '300 mg loading then 75 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Chew first dose. Caution: active GI bleed.' },
        { name: 'Clopidogrel (or Ticagrelor)', dose: '300-600 mg load then 75 mg OD (Ticagrelor 180 mg load then 90 mg BD)', route: 'PO', frequency: '', duration: '12 months', notes: 'Dual antiplatelet therapy after consultant decision.' },
        { name: 'Atorvastatin', dose: '80 mg', route: 'PO', frequency: 'nocte', duration: 'long-term', notes: 'High-intensity statin.' },
        { name: 'Enoxaparin', dose: '1 mg/kg', route: 'SC', frequency: 'BD', duration: 'till revascularisation', notes: 'Adjust in renal impairment.' },
        { name: 'Bisoprolol (β-blocker)', dose: '1.25-2.5 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Hold if HR < 60 or SBP < 100.' },
      ],
      non_pharm: [
        'Strict bed rest until stable',
        'Smoking cessation advice and nicotine replacement if needed',
        'Cardiac diet — low salt, low saturated fat',
        'Cardiac rehabilitation referral on discharge',
      ],
      monitoring: [
        'Continuous ECG until 24 h pain-free',
        'BP every 15 min in first hour then 1 hourly',
        'Repeat troponin at 3 h and 6 h',
        'Strict fluid balance',
      ],
      follow_up: 'Cardiology clinic within 1-2 weeks of discharge; primary-care review within 1 week.',
      patient_advice: 'You are being treated for a possible heart attack. Take all medicines exactly as prescribed and never stop antiplatelets without speaking to your cardiologist. Avoid heavy lifting and strenuous exercise until cleared. Stop smoking, eat a low-salt low-fat diet and aim for 30 minutes of moderate activity most days once cleared. Call emergency services immediately if chest pain returns and lasts more than 10-15 minutes despite GTN, or if you faint, become very breathless, or develop severe sweating.',
      red_flags: ['Recurrent chest pain', 'Sudden severe breathlessness', 'Fainting / near-syncope',
                  'New palpitations', 'Cold clammy skin with weakness'],
      referrals: ['Cardiology — urgent', 'Cardiac rehabilitation'],
    },
  },

  {
    name: 'Hypertensive Urgency / Emergency',
    system: 'Cardiovascular',
    keywords: ['headache', 'high blood pressure', 'blurred vision', 'chest tightness with high bp', 'epistaxis with bp'],
    weight: 0.8,
    vitalsHints: { systolic: ['>180'], diastolic: ['>120'] },
    redFlags: ['SBP > 220 or DBP > 130', 'Confusion / focal neurology', 'Chest pain', 'Pulmonary oedema'],
    reasoning: 'Severely raised BP. Distinguish urgency (no end-organ damage) from emergency (target-organ damage) — the latter requires controlled IV reduction.',
    investigations: {
      bedside: [{ test: 'Repeat BP both arms; pulse, fundoscopy', reason: 'Confirm and look for papilloedema.' },
                { test: 'ECG', reason: 'LVH or acute strain.' }],
      labs: [{ test: 'U&E, creatinine', reason: 'Renal target-organ damage.' },
             { test: 'Urinalysis (protein, blood)', reason: 'Hypertensive nephropathy.' },
             { test: 'Troponin (if chest pain)', reason: 'Cardiac injury.' }],
      imaging: [{ test: 'Chest X-ray', reason: 'Aortic shadow, pulmonary oedema.' },
                { test: 'CT brain (if neurologic signs)', reason: 'Haemorrhagic stroke.' }],
      specialist: [{ test: 'Cardiology / nephrology if recurrent', reason: 'Optimise long-term control.' }],
    },
    treatment: {
      immediate: [
        'Quiet room, repeat BP after 15 min',
        'Establish target organ damage: chest pain? neurology? proteinuria? pulmonary oedema?',
        'For URGENCY: oral agent over 24-48 h aiming MAP ↓ ~20 %',
        'For EMERGENCY: IV labetalol or nicardipine, ICU monitoring, lower MAP by ≤25 % in first hour',
      ],
      medications: [
        { name: 'Amlodipine', dose: '5-10 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'First line in many guidelines; ankle oedema in some.' },
        { name: 'Lisinopril (or Losartan)', dose: '10 mg (Losartan 50 mg)', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Avoid in pregnancy / bilateral RAS / hyperkalaemia.' },
        { name: 'Hydrochlorothiazide / Indapamide', dose: '12.5 / 1.5 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Add if BP not at goal on 2 agents.' },
        { name: 'Labetalol IV (emergency)', dose: '10-20 mg slow IV; infusion 1-2 mg/min', route: 'IV', frequency: '', duration: 'short', notes: 'Avoid in asthma / heart block.' },
      ],
      non_pharm: ['Salt restriction (< 5 g/day)', 'DASH diet', 'Weight loss if BMI > 25', 'Limit alcohol', 'Regular aerobic exercise', 'Smoking cessation'],
      monitoring: ['Home BP diary BD for 7 days', 'Recheck U&E 1-2 weeks after starting ACEI/ARB', 'Annual fundoscopy'],
      follow_up: 'Review in 1-2 weeks to titrate therapy; sooner if BP > 180/110.',
      patient_advice: 'Your blood pressure is very high. Take medication every day, even when you feel well. Check your blood pressure at home if possible and keep a diary. Cut down on salt, processed food, alcohol and caffeine; aim for at least 30 minutes of brisk walking most days. Return urgently if you have severe headache, chest pain, sudden weakness/numbness, slurred speech, fainting, or sudden visual loss.',
      red_flags: ['Severe headache with vomiting', 'Sudden visual loss', 'Chest pain', 'Slurred speech / weakness', 'Severe shortness of breath'],
      referrals: ['Cardiology if resistant hypertension', 'Nephrology if proteinuria / impaired GFR'],
    },
  },

  {
    name: 'Acute Heart Failure / Decompensation',
    system: 'Cardiovascular',
    keywords: ['shortness of breath', 'orthopnoea', 'pnd', 'leg swelling', 'ankle oedema', 'cannot lie flat', 'frothy sputum', 'paroxysmal nocturnal'],
    age: { min: 50 }, weight: 0.85,
    vitalsHints: { spo2: ['<92'], heartRate: ['>110'], respRate: ['>22'] },
    examHints: ['raised jvp', 'bibasal crackles', 'pitting oedema', 'gallop', 's3'],
    redFlags: ['Pink frothy sputum', 'SpO2 < 90 % on air', 'Hypotension', 'Cool peripheries (cardiogenic shock)'],
    reasoning: 'Dyspnoea + orthopnoea + raised JVP + bibasal crackles strongly suggest pulmonary congestion. Look for precipitants: ischaemia, AF, infection, non-compliance, anaemia, thyroid.',
    investigations: {
      bedside: [{ test: 'ECG', reason: 'AF, ischaemia, LVH.' }, { test: 'Pulse oximetry', reason: 'Hypoxia.' }],
      labs: [{ test: 'BNP / NT-proBNP', reason: 'Confirm HF aetiology.' },
             { test: 'FBC, U&E, glucose, LFT, TFT', reason: 'Anaemia, renal, thyroid precipitants.' },
             { test: 'Troponin', reason: 'Ischaemic precipitant.' }],
      imaging: [{ test: 'Chest X-ray', reason: 'Cardiomegaly, Kerley B lines, effusion.' },
                { test: 'Echocardiogram', reason: 'Ejection fraction, valves.' }],
      specialist: [{ test: 'Cardiology referral', reason: 'Optimise HF therapy.' }],
    },
    treatment: {
      immediate: [
        'Sit upright, oxygen to maintain SpO₂ 94-98 %',
        'IV access, monitor ECG/SpO₂/BP',
        'IV furosemide 40-80 mg (or 2.5× home dose) — repeat / infusion as needed',
        'GTN spray / infusion if BP allows (SBP > 110)',
        'Treat precipitant: rate-control AF, antibiotics for chest sepsis, transfuse if Hb very low',
      ],
      medications: [
        { name: 'Furosemide', dose: '40-80 mg IV bolus, then OD/BD', route: 'IV → PO', frequency: 'BD', duration: 'titrate to euvolaemia', notes: 'Watch K⁺, U&E, weight.' },
        { name: 'Bisoprolol', dose: 'start 1.25 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Start once euvolaemic; uptitrate weekly.' },
        { name: 'Ramipril (ACEI) or Sacubitril-Valsartan', dose: '2.5 mg / 24-26 mg', route: 'PO', frequency: 'BD', duration: 'long-term', notes: 'Mortality benefit in HFrEF.' },
        { name: 'Spironolactone', dose: '25 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Add if EF ≤ 35 %.' },
        { name: 'Dapagliflozin (SGLT2i)', dose: '10 mg', route: 'PO', frequency: 'OD', duration: 'long-term', notes: 'Mortality benefit in HFrEF/HFpEF.' },
      ],
      non_pharm: ['Daily weights at home (alert if ↑ 2 kg in 3 days)', 'Salt restriction < 2 g/day', 'Fluid restriction 1.5 L/day if dilutional hyponatraemia', 'Pneumococcal & annual influenza vaccine', 'Cardiac rehabilitation'],
      monitoring: ['Strict fluid balance, daily weights in hospital', 'U&E daily while diuresing', 'Repeat NT-proBNP at discharge'],
      follow_up: 'Heart failure nurse / cardiology clinic within 2 weeks of discharge.',
      patient_advice: 'You are in heart failure — your heart is struggling to pump effectively. Take every medicine, even when you feel well. Weigh yourself every morning after the toilet, before breakfast, in the same clothing. If your weight goes up by 2 kg over 3 days, contact us — your fluid pills may need to be increased. Limit salt to roughly half a teaspoon a day. Avoid heavy salty processed foods, soups, pickles. Get the flu jab every year. Return urgently if you cannot lie flat, wake at night gasping for air, cough up pink frothy sputum, faint, or your weight rises rapidly.',
      red_flags: ['Inability to lie flat', 'Pink frothy sputum', 'Sudden weight gain', 'Fainting', 'Severe leg swelling'],
      referrals: ['Cardiology / heart-failure nurse'],
    },
  },

  // ---------------- RESPIRATORY ----------------
  {
    name: 'Community-Acquired Pneumonia',
    system: 'Respiratory',
    keywords: ['cough', 'productive', 'green sputum', 'rusty sputum', 'fever', 'pleuritic chest pain', 'breathlessness', 'rigors'],
    weight: 0.9,
    vitalsHints: { temperature: ['>=38'], heartRate: ['>100'], respRate: ['>22'], spo2: ['<94'] },
    examHints: ['bronchial breathing', 'crackles', 'dullness to percussion', 'increased vocal resonance'],
    redFlags: ['CURB-65 ≥ 3', 'SpO2 < 92 % on air', 'Multilobar consolidation', 'Sepsis criteria'],
    reasoning: 'Productive cough + fever + focal chest signs is classic CAP. Use CURB-65 to triage; admit if ≥ 2.',
    investigations: {
      bedside: [{ test: 'SpO₂, RR, BP', reason: 'CURB-65 score & severity.' }, { test: 'Sputum Gram stain & culture', reason: 'Identify pathogen.' }],
      labs: [{ test: 'FBC, U&E (urea ≥ 7 = "U" of CURB-65)', reason: 'Severity scoring.' },
             { test: 'CRP', reason: 'Severity & response.' },
             { test: 'Blood cultures × 2 (if febrile / unwell)', reason: 'Bacteraemia.' },
             { test: 'ABG if SpO₂ < 92 %', reason: 'Type-1 / type-2 respiratory failure.' },
             { test: 'Urinary pneumococcal & legionella antigen (severe CAP)', reason: 'Atypical cover.' }],
      imaging: [{ test: 'Chest X-ray PA', reason: 'Confirm consolidation, exclude complication.' }],
      specialist: [],
    },
    treatment: {
      immediate: ['Oxygen if SpO₂ < 94 %', 'IV fluids if dehydrated / septic', 'Antipyretic / analgesia',
                  'Start empirical antibiotics within 4 h of arrival'],
      medications: [
        { name: 'Amoxicillin', dose: '500 mg-1 g', route: 'PO', frequency: 'TDS', duration: '5-7 days', notes: 'Mild CAP, CURB-65 0-1.' },
        { name: 'Co-amoxiclav + Clarithromycin', dose: '1.2 g IV / 500 mg PO', route: 'IV/PO', frequency: 'TDS / BD', duration: '5-7 days', notes: 'Moderate-severe CAP.' },
        { name: 'Doxycycline', dose: '200 mg load, then 100 mg', route: 'PO', frequency: 'OD', duration: '5-7 days', notes: 'Penicillin allergy; covers atypicals.' },
        { name: 'Paracetamol', dose: '1 g', route: 'PO', frequency: 'QDS PRN', duration: 'as needed', notes: 'Antipyretic.' },
      ],
      non_pharm: ['Hydration', 'Rest', 'Smoking cessation', 'Pneumococcal & flu vaccination'],
      monitoring: ['Vitals 4-hourly', 'Repeat CXR at 6 weeks if > 50 yrs / smoker / persistent symptoms (rule out malignancy)'],
      follow_up: 'Primary care in 1 week; chest clinic if persistent shadowing.',
      patient_advice: 'You have a chest infection (pneumonia). Take antibiotics every dose, even after you feel better. Drink plenty of fluids and rest. Use paracetamol for fever. Stop smoking and avoid second-hand smoke. You should feel better in 3-5 days; full recovery takes 4-6 weeks. Seek urgent help if breathing becomes more difficult, you cough up blood, develop confusion, severe chest pain, or your fever returns.',
      red_flags: ['Severe breathlessness at rest', 'Coughing up blood', 'Confusion / drowsiness', 'Persistent fever beyond 5 days'],
      referrals: ['Respiratory team if non-resolving / severe'],
    },
  },

  {
    name: 'Asthma exacerbation',
    system: 'Respiratory',
    keywords: ['wheeze', 'wheezing', 'tight chest', 'inhaler', 'nocturnal cough', 'cold triggered', 'allergic'],
    weight: 0.8,
    vitalsHints: { respRate: ['>25'], heartRate: ['>110'], spo2: ['<94'] },
    examHints: ['wheeze', 'prolonged expiration', 'silent chest', 'accessory muscle use'],
    redFlags: ['Silent chest', 'PEF < 33 % best/predicted', 'Exhaustion', 'Confusion', 'SpO2 < 92 %'],
    reasoning: 'Episodic wheeze, nocturnal cough and reversible airflow limitation suggests asthma. Severity dictates therapy intensity.',
    investigations: {
      bedside: [{ test: 'Peak expiratory flow', reason: 'Severity grading.' },
                { test: 'SpO₂, ECG', reason: 'Hypoxia, sinus tachycardia.' }],
      labs: [{ test: 'FBC, CRP, U&E', reason: 'Infection trigger, β2-agonist hypokalaemia.' },
             { test: 'ABG if life-threatening', reason: 'Type-2 failure (rising CO₂).' }],
      imaging: [{ test: 'Chest X-ray (only if focal signs / pneumothorax suspected)', reason: 'Exclude complications.' }],
      specialist: [{ test: 'Respiratory team if life-threatening / near-fatal', reason: 'ICU / NIV consideration.' }],
    },
    treatment: {
      immediate: ['Oxygen 94-98 %', 'Salbutamol 5 mg neb back-to-back × 3', 'Ipratropium 0.5 mg neb if severe',
                  'Hydrocortisone 100 mg IV / Prednisolone 40 mg PO', 'IV magnesium sulfate 1.2-2 g over 20 min if life-threatening', 'Senior / ICU review if not improving'],
      medications: [
        { name: 'Salbutamol (SABA)', dose: '2-4 puffs MDI/spacer or 5 mg neb', route: 'inh', frequency: 'every 4 h or PRN', duration: 'until controlled', notes: 'Beware hypokalaemia.' },
        { name: 'Prednisolone', dose: '40-50 mg', route: 'PO', frequency: 'OD', duration: '5-7 days', notes: 'No tapering needed for short courses.' },
        { name: 'Inhaled Corticosteroid + LABA', dose: 'e.g. Budesonide-Formoterol', route: 'inh', frequency: 'BD', duration: 'long-term', notes: 'MART regimen preferred per GINA.' },
        { name: 'Montelukast', dose: '10 mg', route: 'PO', frequency: 'nocte', duration: 'long-term', notes: 'Add-on for allergic phenotype.' },
      ],
      non_pharm: ['Inhaler technique check at every visit', 'Trigger avoidance (dust mites, pets, smoke, NSAIDs in aspirin-sensitive)', 'Personalised written asthma action plan', 'Annual flu vaccine'],
      monitoring: ['PEF diary', 'Symptom score (ACT)', 'Recheck inhaler technique 6-monthly'],
      follow_up: 'Primary care in 48 h after exacerbation; respiratory clinic for poorly-controlled disease.',
      patient_advice: 'You are having an asthma flare-up. Take your reliever inhaler (blue) as instructed and finish the full steroid course. Always carry your reliever. Avoid known triggers. Get the annual flu jab. Seek urgent help if your reliever does not last 4 hours, you cannot complete a sentence in one breath, your lips/fingers turn blue, or you become exhausted.',
      red_flags: ['Reliever needed more often than 4-hourly', 'Cannot speak full sentences', 'Blue lips / fingertips', 'Exhaustion or drowsiness'],
      referrals: ['Respiratory clinic if severe / poorly controlled'],
    },
  },

  // ---------------- INFECTION / GENERAL ----------------
  {
    name: 'Sepsis (suspected)',
    system: 'Infection',
    keywords: ['fever', 'rigors', 'unwell', 'confused', 'low blood pressure', 'rapid breathing', 'high heart rate'],
    weight: 1.0,
    vitalsHints: { temperature: ['>=38', '<36'], heartRate: ['>120'], systolic: ['<90'], respRate: ['>22'], spo2: ['<92'] },
    examHints: ['mottled', 'cold peripheries', 'altered mental state', 'oliguria'],
    redFlags: ['SBP < 90', 'Lactate > 2', 'New confusion', 'RR > 25', 'Mottled skin'],
    reasoning: 'qSOFA ≥ 2 (RR ≥ 22, GCS < 15, SBP ≤ 100) with infection source = sepsis. Time-critical: complete the BUFALO bundle in the first hour.',
    investigations: {
      bedside: [{ test: 'Blood cultures × 2 BEFORE antibiotics', reason: 'Identify pathogen.' },
                { test: 'Lactate (venous or arterial)', reason: 'Tissue perfusion marker.' },
                { test: 'Urine output (catheterise)', reason: 'AKI / shock marker.' }],
      labs: [{ test: 'FBC, U&E, LFT, glucose, CRP, coagulation', reason: 'Organ dysfunction screen.' },
             { test: 'Procalcitonin (if available)', reason: 'Bacterial likelihood.' },
             { test: 'Urine dip & MSU, sputum, swabs from any focus', reason: 'Source identification.' }],
      imaging: [{ test: 'Chest X-ray', reason: 'Pulmonary source.' },
                { test: 'CT abdomen if intra-abdominal source suspected', reason: 'Localise focus.' }],
      specialist: [{ test: 'Critical care / outreach', reason: 'Escalation if not improving in 1 h.' }],
    },
    treatment: {
      immediate: [
        'Sepsis Six within 1 hour:',
        '  • B — Blood cultures',
        '  • U — Urine output measured',
        '  • F — Fluids 30 mL/kg crystalloid IV',
        '  • A — Antibiotics broad-spectrum (e.g. Piperacillin-tazobactam 4.5 g IV)',
        '  • L — Lactate measurement',
        '  • O — Oxygen to keep SpO₂ ≥ 94 %',
        'Reassess after each fluid bolus; vasopressors if MAP < 65 despite fluids',
        'Source control (drain abscess, remove infected line) ASAP',
      ],
      medications: [
        { name: 'Piperacillin-tazobactam (or local protocol)', dose: '4.5 g', route: 'IV', frequency: 'TDS', duration: 'reassess at 48-72 h', notes: 'Adjust to culture & susceptibility.' },
        { name: 'Vancomycin (add if MRSA risk)', dose: '15-20 mg/kg load then by levels', route: 'IV', frequency: '', duration: 'as per culture', notes: 'Trough 15-20 mg/L for serious infections.' },
        { name: 'Noradrenaline', dose: 'start 0.05 µg/kg/min, titrate', route: 'IV (central line)', frequency: '', duration: '', notes: 'First-line vasopressor.' },
      ],
      non_pharm: ['Source control', 'Stress-ulcer & VTE prophylaxis once stable', 'Nutrition within 48 h'],
      monitoring: ['Vitals every 30 min until stable', 'Hourly urine output', 'Repeat lactate at 2 h', 'Daily organ scores'],
      follow_up: 'ITU step-down then ward + microbiology review for antibiotic streamlining.',
      patient_advice: 'You have a serious infection that has affected your whole body (sepsis). Antibiotics and fluids are being given quickly because every hour matters. Once recovered you may feel weak and tired for weeks (post-sepsis syndrome). Take all antibiotics, complete physiotherapy, follow up with your GP, and seek urgent help if fever or confusion returns.',
      red_flags: ['Fever returning', 'New confusion', 'Reduced urine', 'Increasing breathlessness'],
      referrals: ['Critical-care outreach', 'Microbiology / infectious diseases'],
    },
  },

  {
    name: 'Malaria (Plasmodium falciparum likely)',
    system: 'Infection',
    keywords: ['fever', 'travel', 'rigors', 'sweats', 'headache', 'myalgia', 'jaundice', 'tropical', 'sub-saharan', 'cerebral malaria'],
    weight: 0.9,
    vitalsHints: { temperature: ['>=38'] },
    examHints: ['jaundice', 'splenomegaly', 'pallor'],
    redFlags: ['Reduced GCS', 'Convulsions', 'Hypoglycaemia', 'Parasitaemia > 2 %', 'Acidosis'],
    reasoning: 'Fever in a returning traveller from an endemic area is malaria until proven otherwise. Severe falciparum is a medical emergency.',
    investigations: {
      bedside: [{ test: 'Capillary glucose', reason: 'Hypoglycaemia common.' }],
      labs: [{ test: 'Thick & thin films × 3 over 24 h', reason: 'Speciate, parasitaemia %.' },
             { test: 'Rapid Diagnostic Test (mRDT)', reason: 'Quick screen.' },
             { test: 'FBC (haemolysis, thrombocytopaenia), U&E, LFT, glucose, lactate, coagulation', reason: 'Severity / organ dysfunction.' },
             { test: 'Blood culture', reason: 'Concomitant bacteraemia common.' },
             { test: 'HIV test', reason: 'Co-infection alters severity.' }],
      imaging: [],
      specialist: [{ test: 'Infectious diseases / tropical medicine', reason: 'Severe / complicated cases.' }],
    },
    treatment: {
      immediate: ['IV access, treat shock with crystalloid (cautious in cerebral malaria — pulmonary oedema risk)',
                  'Correct hypoglycaemia (10 % dextrose)', 'Empirical antimalarials within 1 h of severe diagnosis'],
      medications: [
        { name: 'Artesunate (severe falciparum)', dose: '2.4 mg/kg at 0, 12, 24 h then daily', route: 'IV', frequency: '', duration: 'switch to oral ACT once tolerated', notes: 'Beware delayed haemolysis; recheck Hb at 14 days.' },
        { name: 'Artemether-Lumefantrine (uncomplicated)', dose: '4 tabs at 0, 8, 24, 36, 48, 60 h', route: 'PO', frequency: '', duration: '3 days', notes: 'Take with fatty food.' },
        { name: 'Paracetamol', dose: '1 g', route: 'PO', frequency: 'QDS PRN', duration: 'as needed', notes: 'Avoid NSAIDs in severe disease (renal).' },
      ],
      non_pharm: ['Cool with tepid sponging if temperature very high', 'Seizure precautions in cerebral malaria',
                  'Mosquito-net education for prevention'],
      monitoring: ['Daily parasitaemia until negative', 'Glucose 4-hourly', 'GCS, urine output, vitals'],
      follow_up: 'Recheck parasitaemia day 3, 7, 28; repeat FBC at 14 days for delayed haemolysis after artesunate.',
      patient_advice: 'You have malaria — a parasite infection from a mosquito bite. Complete the full course of medication or the parasites can return. Drink fluids and rest. Use insect repellent and a mosquito net for the next month, especially at night, and inform anyone you live with about symptoms. Return immediately if fever returns, you feel very weak, become confused, develop dark urine, or yellow eyes.',
      red_flags: ['Confusion / seizures', 'Dark urine', 'Severe abdominal pain', 'Persistent vomiting',
                  'Recurrent fever after treatment'],
      referrals: ['Infectious diseases / tropical medicine'],
    },
  },

  {
    name: 'Acute gastroenteritis',
    system: 'Gastrointestinal',
    keywords: ['diarrhoea', 'diarrhea', 'vomiting', 'loose stool', 'abdominal cramps', 'food poisoning', 'watery stool'],
    weight: 0.7,
    vitalsHints: { heartRate: ['>100'], systolic: ['<100'] },
    examHints: ['dry mucous membranes', 'sunken eyes', 'reduced skin turgor'],
    redFlags: ['Bloody diarrhoea', 'Severe dehydration', 'Persistent vomiting', 'Recent travel / antibiotics'],
    reasoning: 'Self-limiting viral aetiology common; assess hydration status and look for invasive features (blood, fever, tenesmus) needing further work-up.',
    investigations: {
      bedside: [{ test: 'Hydration assessment, weight', reason: 'Replace deficits.' }],
      labs: [{ test: 'Stool MC&S, ova/cysts/parasites', reason: 'If bloody / prolonged / immunocompromised / travel.' },
             { test: 'C. difficile toxin', reason: 'Recent antibiotics.' },
             { test: 'U&E, FBC', reason: 'Dehydration, electrolyte derangement.' }],
      imaging: [],
      specialist: [],
    },
    treatment: {
      immediate: ['Oral rehydration salts (ORS) — small frequent sips', 'IV fluids if shocked / cannot tolerate oral', 'Identify and stop trigger food / contact tracing'],
      medications: [
        { name: 'Oral Rehydration Solution', dose: 'after each loose stool / vomit', route: 'PO', frequency: '', duration: 'until stools formed', notes: 'WHO ORS preferred.' },
        { name: 'Loperamide', dose: '4 mg load then 2 mg', route: 'PO', frequency: 'after each loose stool', duration: 'short-course', notes: 'Avoid in bloody diarrhoea / suspected C diff.' },
        { name: 'Ondansetron', dose: '4 mg', route: 'PO/IV', frequency: '8-hourly PRN', duration: 'short', notes: 'For persistent vomiting; ECG QT.' },
        { name: 'Antibiotic only if invasive / Shigella / cholera / traveller\'s', dose: 'eg Ciprofloxacin 500 mg BD 3 days', route: 'PO', frequency: '', duration: '3-5 days', notes: 'Most cases need only rehydration.' },
      ],
      non_pharm: ['Hand hygiene', 'Avoid food preparation for others until 48 h symptom-free', 'BRAT (bananas, rice, apple, toast) diet as appetite returns'],
      monitoring: ['Weight & hydration', 'Frequency of stools / vomiting'],
      follow_up: 'Review if no improvement in 48-72 h or red flags appear.',
      patient_advice: 'You have a stomach bug. Drink small frequent sips of oral rehydration solution after every loose stool or vomit. Eat plain foods (rice, toast, bananas) as your appetite returns. Wash your hands carefully and do not prepare food for other people until 48 hours after symptoms stop. Return if you cannot keep fluids down for 24 hours, your urine becomes very dark or stops, you pass blood in stools, develop severe abdominal pain, or feel faint when standing.',
      red_flags: ['Blood in stool', 'Inability to keep fluids down', 'Severe abdominal pain', 'Dark / no urine', 'Fainting'],
      referrals: ['Gastroenterology if persistent > 14 days'],
    },
  },

  {
    name: 'Urinary Tract Infection (cystitis / pyelonephritis)',
    system: 'Genitourinary',
    keywords: ['burning urination', 'dysuria', 'frequency', 'urgency', 'cloudy urine', 'flank pain', 'loin pain', 'haematuria', 'pelvic pain'],
    weight: 0.85,
    sex: ['F'],
    vitalsHints: { temperature: ['>=38'] },
    examHints: ['suprapubic tenderness', 'renal angle tenderness'],
    redFlags: ['Loin pain + fever (pyelonephritis)', 'Vomiting', 'Sepsis features', 'Pregnancy', 'Catheter'],
    reasoning: 'Dysuria, frequency and urgency = lower UTI. Add loin pain and fever → upper UTI / pyelonephritis: needs systemic antibiotics and admission consideration.',
    investigations: {
      bedside: [{ test: 'Urine dipstick', reason: 'Nitrites / leukocyte esterase.' }],
      labs: [{ test: 'Mid-stream urine MC&S', reason: 'Pathogen & sensitivities.' },
             { test: 'FBC, U&E, CRP', reason: 'Severity / pyelonephritis.' },
             { test: 'Pregnancy test', reason: 'Drug choice.' }],
      imaging: [{ test: 'Renal ultrasound (if upper UTI in male / recurrent / pregnant / sepsis)', reason: 'Obstruction, abscess.' }],
      specialist: [{ test: 'Urology if recurrent / structural concerns', reason: 'Investigation & management.' }],
    },
    treatment: {
      immediate: ['Hydration', 'Empirical antibiotic per local guideline', 'IV antibiotics if pyelonephritis / sepsis / pregnant'],
      medications: [
        { name: 'Nitrofurantoin', dose: '100 mg MR', route: 'PO', frequency: 'BD', duration: '3-5 days (women) / 7 days (men/pregnancy)', notes: 'Avoid eGFR < 45.' },
        { name: 'Trimethoprim', dose: '200 mg', route: 'PO', frequency: 'BD', duration: '3 days', notes: 'Avoid in 1st trimester pregnancy.' },
        { name: 'Co-amoxiclav (pyelonephritis)', dose: '625 mg PO / 1.2 g IV', route: 'PO/IV', frequency: 'TDS', duration: '7-14 days', notes: 'Switch from IV when afebrile.' },
        { name: 'Cefalexin (pregnancy)', dose: '500 mg', route: 'PO', frequency: 'BD-TDS', duration: '7 days', notes: 'Pregnancy-safe.' },
        { name: 'Paracetamol', dose: '1 g', route: 'PO', frequency: 'QDS PRN', duration: 'as needed', notes: 'Analgesia.' },
      ],
      non_pharm: ['Increase fluids', 'Wipe front-to-back', 'Void after intercourse', 'Cranberry products (limited evidence)'],
      monitoring: ['Symptom resolution within 48 h', 'Repeat MSU only if symptoms persist'],
      follow_up: 'Primary care if symptoms persist beyond 48 h or recur.',
      patient_advice: 'You have a urinary tract infection. Take all the antibiotics even if symptoms improve. Drink at least 2 litres of water daily. Empty your bladder fully and after intercourse. Return urgently if you develop loin pain (kidney area), fever, vomiting, blood in urine, confusion (especially elderly), or symptoms persist beyond 48 hours.',
      red_flags: ['Fever or rigors', 'Loin pain', 'Vomiting', 'Confusion', 'Blood in urine'],
      referrals: ['Urology for recurrent / complicated UTI'],
    },
  },

  // ---------------- NEUROLOGY ----------------
  {
    name: 'Acute stroke (suspected)',
    system: 'Neurology',
    keywords: ['weakness', 'face droop', 'slurred speech', 'sudden numbness', 'sudden visual loss', 'sudden onset', 'facial asymmetry'],
    weight: 1.0,
    vitalsHints: { systolic: ['>180'] },
    examHints: ['hemiparesis', 'aphasia', 'facial droop', 'visual field defect', 'ataxia'],
    redFlags: ['Sudden onset', 'Time of onset known and < 4.5 h', 'Severe headache (haemorrhagic)', 'Reduced GCS'],
    reasoning: 'FAST-positive symptoms with sudden onset are stroke until imaging excludes it. Time = brain — every minute lost destroys ~1.9 million neurons.',
    investigations: {
      bedside: [{ test: 'Capillary glucose', reason: 'Stroke mimic.' }, { test: 'NIHSS score', reason: 'Severity / treatment threshold.' }, { test: 'ECG', reason: 'AF (cardio-embolic source).' }],
      labs: [{ test: 'FBC, U&E, glucose, lipid, coag, ESR (if young / vasculitis)', reason: 'Baseline and pre-thrombolysis.' }],
      imaging: [{ test: 'Non-contrast CT brain — IMMEDIATELY', reason: 'Differentiate ischaemic vs haemorrhagic.' },
                { test: 'CT angiography head/neck', reason: 'Large-vessel occlusion for thrombectomy.' },
                { test: 'Carotid Doppler / echo', reason: 'Embolic source.' }],
      specialist: [{ test: 'Stroke team — call IMMEDIATELY', reason: 'Thrombolysis / thrombectomy decision.' }],
    },
    treatment: {
      immediate: [
        'NIL by mouth until swallow assessed',
        'Maintain SpO₂ > 94 %, glucose 4-11 mmol/L',
        'Permissive hypertension unless thrombolysis planned (< 185/110)',
        'Thrombolysis (alteplase 0.9 mg/kg) within 4.5 h if ischaemic and no contraindication',
        'Mechanical thrombectomy within 6-24 h for large-vessel occlusion',
      ],
      medications: [
        { name: 'Alteplase', dose: '0.9 mg/kg (max 90 mg); 10 % bolus, rest over 1 h', route: 'IV', frequency: '', duration: 'once', notes: 'Strict BP & exclusion checklist.' },
        { name: 'Aspirin', dose: '300 mg (24 h after thrombolysis or immediately if no thrombolysis)', route: 'PO/PR', frequency: 'OD', duration: '2 weeks then 75 mg long-term', notes: 'After haemorrhage excluded.' },
        { name: 'Atorvastatin', dose: '80 mg', route: 'PO', frequency: 'nocte', duration: 'long-term', notes: 'Plaque stabilisation.' },
        { name: 'DOAC (if AF)', dose: 'eg Apixaban 5 mg BD', route: 'PO', frequency: 'BD', duration: 'long-term', notes: 'Start 2-14 days post-stroke per size.' },
      ],
      non_pharm: ['Stroke-unit care', 'Early swallow screen', 'Early mobilisation', 'VTE prophylaxis with intermittent pneumatic compression'],
      monitoring: ['Neuro obs every 15 min × 2 h, then 30 min', 'BP target per protocol', 'Glucose 4-11'],
      follow_up: 'Stroke clinic in 6 weeks; secondary-prevention review.',
      patient_advice: 'You have had a stroke. Recovery depends on early treatment, rehabilitation and risk-factor control. Take antiplatelet/anticoagulant and statin medication every day. Attend physiotherapy, speech therapy and occupational therapy. Stop smoking, control blood pressure, diabetes and cholesterol. Drive only after consulting your doctor and the licensing authority. Return urgently if symptoms recur, headache becomes severe, or you develop new weakness, speech change or visual loss.',
      red_flags: ['Recurrent weakness or speech change', 'Severe headache', 'Reduced consciousness', 'Seizure'],
      referrals: ['Stroke team / neurology', 'Stroke rehabilitation MDT'],
    },
  },

  // ---------------- ENDOCRINE ----------------
  {
    name: 'Diabetic Ketoacidosis (DKA)',
    system: 'Endocrine',
    keywords: ['polyuria', 'polydipsia', 'thirst', 'weight loss', 'vomiting', 'abdominal pain', 'kussmaul breathing', 'fruity breath'],
    weight: 1.0,
    vitalsHints: { heartRate: ['>110'], systolic: ['<100'], respRate: ['>22'] },
    examHints: ['dry mucous membranes', 'kussmaul', 'acetone breath', 'reduced gcs'],
    redFlags: ['pH < 7.1', 'Bicarb < 5', 'GCS < 12', 'K⁺ < 3.5 or > 6.0', 'SBP < 90'],
    reasoning: 'Hyperglycaemia + ketonaemia + acidosis = DKA. Common precipitants: infection, missed insulin, MI, new T1DM.',
    investigations: {
      bedside: [{ test: 'Capillary glucose & ketones', reason: 'Diagnosis.' }, { test: 'Venous blood gas', reason: 'pH, bicarb, anion gap.' }, { test: 'ECG', reason: 'K⁺ effects, ischaemic precipitant.' }],
      labs: [{ test: 'U&E, glucose, ketones, FBC, CRP, blood cultures, HbA1c, amylase', reason: 'Severity and precipitant.' },
             { test: 'Urine dip & MSU', reason: 'UTI as precipitant.' }],
      imaging: [{ test: 'Chest X-ray', reason: 'Pneumonia trigger.' }],
      specialist: [{ test: 'Diabetes team / ICU if severe', reason: 'Management oversight.' }],
    },
    treatment: {
      immediate: [
        'Two large-bore IV access',
        '0.9 % saline 1 L over 1 h, then titrated per protocol',
        'Fixed-rate IV insulin infusion 0.1 U/kg/h once K⁺ ≥ 3.5',
        'Add 5-10 % dextrose when glucose < 14 mmol/L',
        'Replace K⁺ in maintenance fluid based on serum level',
        'Treat precipitant (e.g. antibiotics for infection)',
      ],
      medications: [
        { name: '0.9 % Sodium chloride', dose: '1 L bolus then per protocol (1 L/h × 2, 1 L/2 h × 2 etc.)', route: 'IV', frequency: '', duration: 'until euvolaemic', notes: 'Switch to 5 % dextrose-saline when glucose < 14.' },
        { name: 'Soluble (Actrapid) insulin infusion', dose: '0.1 U/kg/h', route: 'IV', frequency: '', duration: 'until ketones < 0.6 and bicarb > 18', notes: 'Continue background long-acting insulin if patient was on one.' },
        { name: 'Potassium chloride', dose: 'titrate by serum K⁺', route: 'IV', frequency: '', duration: '', notes: '40 mmol/L if K⁺ 3.5-5.5; hold if > 5.5; ICU if < 3.5.' },
      ],
      non_pharm: ['VTE prophylaxis once stable', 'Diabetes-nurse education before discharge', 'Sick-day rules teaching'],
      monitoring: ['Hourly glucose, ketones, GCS', 'VBG at 2, 6, 12 h', 'Strict fluid balance, hourly urine'],
      follow_up: 'Diabetes specialist nurse within 48 h of discharge; clinic in 2-4 weeks.',
      patient_advice: 'You had diabetic ketoacidosis — a serious complication of diabetes when ketones build up. Never stop insulin even if you are not eating; learn the "sick-day rules" with your diabetes team. Check ketones whenever blood sugar exceeds 14 mmol/L or you feel unwell. Carry a medical alert. Return immediately if you vomit repeatedly, develop deep rapid breathing, abdominal pain, fruity breath, or feel drowsy.',
      red_flags: ['Vomiting that prevents fluid intake', 'Drowsiness / confusion', 'Deep rapid breathing', 'Abdominal pain', 'Ketones > 1.5 with high glucose'],
      referrals: ['Diabetes specialist team'],
    },
  },

  // ---------------- MUSCULOSKELETAL / TRAUMA ----------------
  {
    name: 'Mechanical low back pain',
    system: 'Musculoskeletal',
    keywords: ['back pain', 'lower back pain', 'lifted', 'twisted', 'lumbar pain', 'muscle spasm'],
    againstKw: ['saddle anaesthesia', 'urinary incontinence', 'cauda equina'],
    weight: 0.6,
    redFlags: ['Saddle anaesthesia', 'Bowel/bladder dysfunction', 'Bilateral leg weakness', 'Fever / weight loss', 'Trauma', 'Age > 50 with new pain'],
    reasoning: 'Most adult back pain is mechanical and self-limiting. Always exclude red flags for cauda equina, malignancy, infection or fracture.',
    investigations: {
      bedside: [{ test: 'Neurological exam, straight-leg raise, anal tone if red flags', reason: 'Detect radiculopathy / cauda equina.' }],
      labs: [{ test: 'FBC, ESR/CRP if red flags', reason: 'Infection, malignancy.' }],
      imaging: [{ test: 'No imaging routinely; X-ray / MRI only if red flags or > 6 weeks', reason: 'Exposure & cost; mostly normal.' }],
      specialist: [{ test: 'Urgent neurosurgery if cauda equina suspected', reason: 'Surgical emergency.' }],
    },
    treatment: {
      immediate: ['Reassurance', 'Stay active — avoid bed rest > 2 days', 'Simple analgesia ladder'],
      medications: [
        { name: 'Paracetamol', dose: '1 g', route: 'PO', frequency: 'QDS', duration: '1-2 weeks', notes: 'First-line.' },
        { name: 'Ibuprofen', dose: '400 mg', route: 'PO', frequency: 'TDS with food', duration: '1-2 weeks', notes: 'Caution: GI, renal, asthma.' },
        { name: 'Diazepam', dose: '2-5 mg', route: 'PO', frequency: 'TDS', duration: '< 5 days', notes: 'Only for muscle spasm; abuse potential.' },
        { name: 'Codeine', dose: '15-30 mg', route: 'PO', frequency: 'QDS PRN', duration: 'short', notes: 'Constipation; combine with stool softener.' },
      ],
      non_pharm: ['Heat / cold packs', 'Maintain activity', 'Physiotherapy / exercise programme', 'Posture & lifting education', 'Weight loss if BMI > 25'],
      monitoring: ['Reassess in 1-2 weeks', 'Look for red flags at each visit'],
      follow_up: 'Primary care in 2 weeks; physiotherapy referral if not resolving.',
      patient_advice: 'Most back pain settles in a few weeks with movement and simple painkillers. Avoid prolonged bed rest. Apply a warm pack. Use paracetamol or ibuprofen if safe. Continue normal activities as much as comfort allows. Return urgently if you have weakness in legs, numbness around the saddle area, problems controlling your bladder or bowels, fever, unexplained weight loss, or pain that is severe at night.',
      red_flags: ['Numbness around perineum / saddle', 'Loss of bowel or bladder control', 'Severe progressive weakness', 'Night pain / weight loss', 'Fever'],
      referrals: ['Physiotherapy', 'Spinal surgery only if red flags'],
    },
  },

  // ---------------- PSYCHIATRY ----------------
  {
    name: 'Major depressive episode',
    system: 'Psychiatry',
    keywords: ['low mood', 'sad', 'hopeless', 'anhedonia', 'no pleasure', 'sleep poor', 'early morning waking', 'weight loss', 'suicidal', 'tearful'],
    weight: 0.7,
    redFlags: ['Active suicidal ideation with plan', 'Psychotic features', 'Catatonia', 'Severe self-neglect'],
    reasoning: 'Two weeks of low mood and / or anhedonia plus 4 of: appetite/weight, sleep, psychomotor change, fatigue, guilt, concentration, suicidal thoughts (DSM-5 criteria).',
    investigations: {
      bedside: [{ test: 'Risk assessment (suicide, self-neglect, harm to others)', reason: 'Inform setting of care.' },
                { test: 'PHQ-9 score', reason: 'Severity grading.' }],
      labs: [{ test: 'TFT', reason: 'Hypothyroid mimic.' },
             { test: 'FBC, U&E, glucose, LFT, B12 / folate', reason: 'Organic mimics & baseline before drugs.' }],
      imaging: [],
      specialist: [{ test: 'Urgent CMHT / liaison psychiatry if active suicidality / psychosis', reason: 'Specialist care.' }],
    },
    treatment: {
      immediate: ['Establish therapeutic relationship', 'Assess and document risk', 'Same-day mental-health crisis referral if active suicidality'],
      medications: [
        { name: 'Sertraline (SSRI)', dose: 'start 50 mg, titrate to 100-200 mg', route: 'PO', frequency: 'OD', duration: '≥ 6-9 months past remission', notes: 'Counsel about delayed onset (2-4 wk), GI, sexual side-effects.' },
        { name: 'Mirtazapine (alternative)', dose: '15-45 mg', route: 'PO', frequency: 'nocte', duration: 'as above', notes: 'Useful when sleep / appetite poor; weight gain side-effect.' },
      ],
      non_pharm: ['Low-intensity psychological therapy (guided self-help, CBT)', 'High-intensity CBT or IPT for moderate-severe', 'Behavioural activation', 'Sleep hygiene', 'Regular exercise (3 × 45 min/week)'],
      monitoring: ['Review in 1-2 weeks (especially under-25 — suicide risk early)', 'PHQ-9 monthly until remission'],
      follow_up: 'Primary care in 1-2 weeks; mental-health team if not improving in 4-6 weeks.',
      patient_advice: 'Depression is a treatable medical condition. Antidepressants take 2-4 weeks to start working — keep taking them. Talk therapy (CBT) is as effective as medication for many people. Try to keep some routine: get out of bed, eat regularly, exercise lightly each day, and stay in contact with at least one trusted person. Reduce alcohol. Return immediately or call a crisis line if you have thoughts of harming yourself, hear voices, or feel unable to keep yourself safe.',
      red_flags: ['Suicidal thoughts with a plan', 'Hearing voices / paranoia', 'Self-harm', 'Severe self-neglect'],
      referrals: ['Community mental-health team', 'Talking-therapies service'],
    },
  },

  // ---------------- OBSTETRIC ----------------
  {
    name: 'Pre-eclampsia',
    system: 'Obstetric',
    keywords: ['pregnancy', 'headache pregnancy', 'visual disturbance', 'epigastric pain', 'swelling face', 'oedema', 'proteinuria', 'antenatal'],
    weight: 1.0, sex: ['F'],
    vitalsHints: { systolic: ['>=140'], diastolic: ['>=90'] },
    examHints: ['hyperreflexia', 'right upper quadrant tenderness', 'oedema'],
    redFlags: ['BP ≥ 160/110', 'Severe headache + visual symptoms', 'Epigastric pain (HELLP)', 'Reduced fetal movements'],
    reasoning: 'After 20 weeks gestation, BP ≥ 140/90 with proteinuria or end-organ dysfunction = pre-eclampsia. Severe features and HELLP need urgent delivery planning.',
    investigations: {
      bedside: [{ test: 'BP both arms, urine dipstick', reason: 'Confirm proteinuria.' },
                { test: 'CTG fetal monitoring', reason: 'Fetal wellbeing.' }],
      labs: [{ test: 'FBC (platelets), U&E, urate, LFT, LDH, coag, urine protein:creatinine ratio', reason: 'Organ involvement & HELLP.' },
             { test: 'PlGF (where available)', reason: 'Rule out pre-eclampsia in 20-35 weeks.' }],
      imaging: [{ test: 'Obstetric ultrasound (growth, dopplers, AFI)', reason: 'IUGR.' }],
      specialist: [{ test: 'Obstetrics & gynaecology — urgent', reason: 'Delivery planning.' }],
    },
    treatment: {
      immediate: ['Admit if BP ≥ 160/110, proteinuria, or severe features',
                  'Magnesium sulfate 4 g IV bolus + 1 g/h infusion if eclampsia / severe',
                  'Antihypertensive: labetalol or nifedipine to keep BP < 150/100',
                  'Steroids (betamethasone) if 24-34 weeks for fetal lung maturity',
                  'Plan timing of delivery — only cure'],
      medications: [
        { name: 'Labetalol', dose: '200 mg PO load then 100-400 mg TDS, or 20 mg IV titrated', route: 'PO/IV', frequency: 'TDS / titrated', duration: 'until delivery', notes: 'Avoid in asthma.' },
        { name: 'Nifedipine MR', dose: '20-40 mg', route: 'PO', frequency: 'BD', duration: 'until delivery', notes: 'Alternative to labetalol.' },
        { name: 'Magnesium sulfate', dose: '4 g IV over 5 min then 1 g/h', route: 'IV', frequency: '', duration: '24 h post-delivery / last seizure', notes: 'Monitor reflexes, RR, urine output.' },
        { name: 'Betamethasone', dose: '12 mg', route: 'IM', frequency: 'two doses 12-24 h apart', duration: '', notes: 'Fetal lung maturation, 24-34 weeks.' },
      ],
      non_pharm: ['Strict fluid restriction (~80 mL/h)', 'Quiet environment (eclampsia precaution)', 'VTE assessment'],
      monitoring: ['BP every 15 min until stable', 'Urine output hourly', 'CTG continuously', 'Daily bloods (HELLP)'],
      follow_up: 'Postnatal BP follow-up; future pregnancies need aspirin 75 mg from 12 weeks.',
      patient_advice: 'You have pre-eclampsia, a serious condition of pregnancy involving high blood pressure. Take medication as prescribed and attend ALL antenatal appointments. Watch for severe headache, blurred vision, swelling, upper-tummy pain, or reduced baby movements — go to hospital straight away if any occur. Pre-eclampsia can also occur in the first 6 weeks after delivery, so check your BP regularly during that time.',
      red_flags: ['Severe headache', 'Visual disturbance / flashing lights', 'Epigastric / RUQ pain', 'Reduced fetal movements', 'Sudden facial / hand swelling'],
      referrals: ['Obstetric team — urgent'],
    },
  },

  // ---------------- PEDIATRIC ----------------
  {
    name: 'Pediatric fever / sepsis screen',
    system: 'Pediatric',
    keywords: ['child fever', 'baby fever', 'feeding poorly', 'lethargic child', 'rash', 'irritable infant'],
    age: { max: 16 }, weight: 0.85,
    vitalsHints: { temperature: ['>=38'] },
    examHints: ['non-blanching rash', 'sunken fontanelle', 'cap refill > 3 s', 'mottled'],
    redFlags: ['Non-blanching rash', 'Cap refill > 3 s', 'Inconsolable / high-pitched cry', 'Reduced consciousness', 'Age < 3 months any fever ≥ 38 °C'],
    reasoning: 'Apply NICE traffic-light system. Any red feature = urgent paediatric referral. Children < 3 months with fever ≥ 38 °C automatically need full septic screen.',
    investigations: {
      bedside: [{ test: 'Capillary glucose, urine dip', reason: 'Hypoglycaemia, UTI.' }],
      labs: [{ test: 'FBC, CRP, U&E, blood culture', reason: 'Bacterial source.' },
             { test: 'Lumbar puncture if < 1 mo / red features (no contraindication)', reason: 'Meningitis.' }],
      imaging: [{ test: 'CXR if respiratory features', reason: 'Pneumonia.' }],
      specialist: [{ test: 'Paediatrics — urgent', reason: 'Specialist assessment.' }],
    },
    treatment: {
      immediate: ['ABCDE, oxygen', 'IV access × 2 (or IO)', 'Fluid bolus 10-20 mL/kg saline if shocked', 'Empirical antibiotics within 1 h (e.g. ceftriaxone 80 mg/kg IV)'],
      medications: [
        { name: 'Ceftriaxone', dose: '80 mg/kg', route: 'IV', frequency: 'OD', duration: 'reassess at 48-72 h', notes: 'First-line for unwell child.' },
        { name: 'Amoxicillin (under 1 month)', dose: '50 mg/kg', route: 'IV', frequency: '8-hourly', duration: 'as guided by cultures', notes: 'Add for listeria cover.' },
        { name: 'Paracetamol', dose: '15 mg/kg', route: 'PO/PR', frequency: '4-6 hourly', duration: 'as needed', notes: 'Antipyretic.' },
        { name: 'Ibuprofen (> 3 months)', dose: '5-10 mg/kg', route: 'PO', frequency: '6-8 hourly', duration: 'as needed', notes: 'Avoid in dehydration.' },
      ],
      non_pharm: ['Encourage fluids', 'Light clothing, room temperature', 'Look for source (ear / throat / chest / skin)'],
      monitoring: ['Vitals every 30 min until stable', 'Hydration & urine output'],
      follow_up: 'Review in 24 h or sooner if amber/red features develop.',
      patient_advice: 'Children get fevers often from common viral infections. Offer plenty of fluids in small frequent sips. Use paracetamol or ibuprofen for distress, not just to bring the temperature down. Dress lightly. Look for warning signs: a rash that does not fade when pressed by a glass, fast or laboured breathing, drowsiness or floppiness, refusal to feed, no wet nappies for 12 hours, fits, or a fever lasting more than 5 days. Any of these means come straight to A&E.',
      red_flags: ['Non-blanching rash', 'Drowsy / hard to rouse', 'Fast or laboured breathing', 'No wet nappies in 12 h', 'Seizure', 'Fever > 5 days'],
      referrals: ['Paediatrics'],
    },
  },

  // ---------------- COMMON / CATCH-ALL ----------------
  {
    name: 'Migraine',
    system: 'Neurology',
    keywords: ['headache', 'unilateral headache', 'photophobia', 'phonophobia', 'aura', 'visual disturbance before headache', 'pulsating headache'],
    weight: 0.6,
    redFlags: ['Sudden thunderclap onset', 'New focal neurology', 'Age > 50 new headache', 'Fever with headache', 'Worsening on cough / lying flat'],
    reasoning: 'Recurrent unilateral, pulsating headache lasting 4-72 h with photophobia/phonophobia and nausea is migraine. Always rule out red-flag secondary causes.',
    investigations: {
      bedside: [{ test: 'BP, neurological exam, fundoscopy', reason: 'Secondary cause screen.' }],
      labs: [{ test: 'No routine bloods unless red flags', reason: 'Diagnosis is clinical.' }],
      imaging: [{ test: 'CT/MRI brain only with red flags', reason: 'Rule out SAH / tumour / SOL.' }],
      specialist: [{ test: 'Neurology if uncertain or refractory', reason: 'Diagnostic clarification.' }],
    },
    treatment: {
      immediate: ['Quiet dark room', 'Acute treatment: NSAID + triptan + antiemetic'],
      medications: [
        { name: 'Sumatriptan', dose: '50-100 mg PO or 6 mg SC', route: 'PO/SC', frequency: 'PRN', duration: 'acute attack', notes: 'Avoid in IHD, uncontrolled HTN, hemiplegic migraine.' },
        { name: 'Naproxen', dose: '500 mg', route: 'PO', frequency: 'BD', duration: 'short course', notes: 'Take with food.' },
        { name: 'Metoclopramide', dose: '10 mg', route: 'PO/IV', frequency: 'TDS PRN', duration: 'short', notes: 'Antiemetic; helps gastric absorption.' },
        { name: 'Propranolol (prophylaxis)', dose: '40-160 mg', route: 'PO', frequency: 'BD', duration: 'long-term', notes: 'For ≥ 2-3 attacks/month.' },
        { name: 'Topiramate (prophylaxis)', dose: '50-100 mg', route: 'PO', frequency: 'BD', duration: 'long-term', notes: 'Teratogenic — avoid in women of child-bearing age unless reliable contraception.' },
      ],
      non_pharm: ['Trigger diary', 'Sleep regularity', 'Hydration', 'Avoid skipping meals', 'Limit caffeine / alcohol'],
      monitoring: ['Headache diary monthly', 'Med-overuse review (avoid analgesia > 10 days/month)'],
      follow_up: 'Primary care in 6-8 weeks once treatment started.',
      patient_advice: 'Migraine is a manageable condition. Identify and avoid your triggers (skipped meals, lack of sleep, dehydration, stress, certain foods). Treat attacks early with the prescribed medicine. Keep a headache diary. Avoid using painkillers more than 10 days a month — that can cause "rebound" headaches. Seek urgent help if a headache is the worst ever, sudden, with fever, confusion, weakness, slurred speech, or persistent vomiting.',
      red_flags: ['Sudden severe "thunderclap" headache', 'Fever and neck stiffness', 'New weakness / speech change', 'Persistent vomiting'],
      referrals: ['Neurology if refractory'],
    },
  },
];


/* ================================================================
 *   2.  SCORING & SELECTION
 * ================================================================ */

function ageFromDob(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / 31557600000);
}

function caseTextFrom({ patient, encounter }) {
  const ex = encounter.examination || {};
  const exam = [
    ex.general || '',
    ex.appearance || '',
    ex.systems || '',
    JSON.stringify(ex.systems_detail || {}),
    JSON.stringify(ex.systemFindings || {}),
  ].join(' ');
  return [
    encounter.chief_complaint || '',
    encounter.history_summary || '',
    exam,
    JSON.stringify(encounter.results || ''),
  ].join(' ').toLowerCase();
}

function checkVitalHint(vital, hint) {
  const v = parseFloat(vital);
  if (Number.isNaN(v)) return false;
  if (hint.startsWith('>=')) return v >= parseFloat(hint.slice(2));
  if (hint.startsWith('<=')) return v <= parseFloat(hint.slice(2));
  if (hint.startsWith('>'))  return v >  parseFloat(hint.slice(1));
  if (hint.startsWith('<'))  return v <  parseFloat(hint.slice(1));
  return false;
}

function scoreCondition(cond, ctx) {
  const { patient, encounter, caseText } = ctx;
  let score = 0;
  let supporting = [];
  let against = [];

  // ----- keywords -----
  for (const kw of (cond.keywords || [])) {
    if (caseText.includes(kw.toLowerCase())) {
      score += 1.5;
      supporting.push(`History/examination mentions "${kw}"`);
    }
  }
  for (const akw of (cond.againstKw || [])) {
    if (caseText.includes(akw.toLowerCase())) {
      score -= 1.5;
      against.push(`History mentions "${akw}" — atypical for this diagnosis`);
    }
  }

  // ----- demographics -----
  const age = ageFromDob(patient.date_of_birth);
  if (cond.age) {
    if (cond.age.min !== undefined && age !== null && age < cond.age.min) score -= 0.5;
    if (cond.age.max !== undefined && age !== null && age > cond.age.max) score -= 0.5;
    if (cond.age.min !== undefined && age !== null && age >= cond.age.min) {
      score += 0.4; supporting.push(`Age ${age} fits at-risk group`);
    }
  }
  if (cond.sex && patient.sex && cond.sex.length) {
    if (cond.sex.includes(patient.sex)) { score += 0.3; }
    else { score -= 0.4; against.push(`Sex ${patient.sex} less typical`); }
  }

  // ----- vitals -----
  const vitals = (encounter.examination && encounter.examination.vitals) || {};
  for (const [k, hints] of Object.entries(cond.vitalsHints || {})) {
    for (const h of hints) {
      if (checkVitalHint(vitals[k], h)) {
        score += 0.9;
        supporting.push(`${k} ${vitals[k]} (${h})`);
      }
    }
  }

  // ----- examination -----
  for (const e of (cond.examHints || [])) {
    if (caseText.includes(e.toLowerCase())) {
      score += 0.8;
      supporting.push(`Exam: ${e}`);
    }
  }

  return { score: score * (cond.weight || 1), supporting, against };
}

function rankConditions(ctx, max = 5) {
  const list = CONDITIONS.map(cond => {
    const { score, supporting, against } = scoreCondition(cond, ctx);
    return { cond, score, supporting, against };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  return list;
}


/* ================================================================
 *   3.  PUBLIC API used by aiService fallback
 * ================================================================ */

function fallbackDiagnoses({ patient, encounter }) {
  const caseText = caseTextFrom({ patient, encounter });
  const ranked = rankConditions({ patient, encounter, caseText });

  // If nothing matched at all, give a sensible "needs more workup" entry
  if (ranked.length === 0) {
    return {
      differentials: [{
        name: 'Undifferentiated illness — broad workup recommended',
        likelihood: 'moderate',
        reasoning:
          'No specific pattern matched the offline knowledge base. The history and findings are non-specific. ' +
          'A broad screening workup is suggested while the case is reviewed manually.',
        supporting: ['Non-specific presentation'],
        against: [],
        red_flags: ['Any new severe pain, breathlessness, confusion, or bleeding'],
      }],
      summary_for_doctor:
        'OFFLINE MODE — no clear pattern detected by the rule-based engine. The doctor is advised to review the full ' +
        'history and examination in detail and consider broad baseline investigations (FBC, U&E, glucose, urinalysis, ECG) ' +
        'while reassessing for red-flag symptoms.',
      urgent: false,
    };
  }

  const differentials = ranked.map(({ cond, score, supporting, against }, i) => ({
    name: cond.name,
    likelihood: i === 0 ? 'high' : (score > 4 ? 'moderate' : 'low'),
    reasoning: cond.reasoning,
    supporting,
    against,
    red_flags: cond.redFlags || [],
    system: cond.system,
  }));

  // urgency: if any high-likelihood condition has redFlags-strong wording
  const urgent = differentials.some(d =>
    /sepsis|stroke|acs|hypertensive emergency|dka|pre-eclampsia|cauda/i.test(d.name) ||
    (d.likelihood === 'high' && d.red_flags && d.red_flags.length >= 2)
  );

  const top = ranked[0].cond;
  const age = ageFromDob(patient.date_of_birth);
  const summary_for_doctor = [
    `OFFLINE CLINICAL DECISION SUPPORT — rule-based engine.`,
    ``,
    `${patient.full_name || 'The patient'} (${patient.sex || 'sex unspecified'}, age ${age || '?'}) presents with ` +
    `"${encounter.chief_complaint || 'an undefined chief complaint'}".`,
    ``,
    `Considering the history of presenting complaint, past medical history, vital signs and examination findings, ` +
    `the leading working diagnosis is **${top.name}** (${top.system}). ` +
    `${top.reasoning}`,
    ``,
    `Key supporting features: ${ranked[0].supporting.slice(0,5).join('; ') || 'see history.'}`,
    ranked[0].against.length ? `Features against: ${ranked[0].against.join('; ')}.` : '',
    ``,
    `Other differentials worth considering (in order): ${ranked.slice(1).map(r => r.cond.name).join('; ') || 'none.'}`,
    ``,
    `Red flags to look for: ${(top.redFlags || []).join('; ')}.`,
    ``,
    `This summary is generated by the offline knowledge base because the online AI is unavailable. ` +
    `The clinician should treat it as decision support only and finalise the diagnosis based on full clinical judgement.`,
  ].filter(Boolean).join('\n');

  return { differentials, summary_for_doctor, urgent };
}

function fallbackInvestigations({ patient, encounter, chosenDiagnoses }) {
  // build a merged investigation set from the chosen diagnoses
  const matches = (chosenDiagnoses || [])
    .map(name => CONDITIONS.find(c => c.name.toLowerCase() === String(name).toLowerCase())
              || CONDITIONS.find(c => String(name).toLowerCase().includes(c.name.split(' ')[0].toLowerCase())))
    .filter(Boolean);

  // if none matched, fall back to top-ranked auto suggestions
  let pool = matches;
  if (!pool.length) {
    const ranked = rankConditions({ patient, encounter, caseText: caseTextFrom({ patient, encounter }) }, 2);
    pool = ranked.map(r => r.cond);
  }
  if (!pool.length) {
    return {
      labs: [
        { test: 'FBC', reason: 'Baseline screen for anaemia / infection / haematological disease.' },
        { test: 'U&E + creatinine', reason: 'Renal function & electrolytes.' },
        { test: 'Random blood glucose', reason: 'Diabetes screen.' },
        { test: 'CRP', reason: 'Inflammation marker.' },
        { test: 'LFTs', reason: 'Hepatic baseline.' },
      ],
      imaging: [{ test: 'Chest X-ray', reason: 'Cardiopulmonary screen for adult presentations.' }],
      bedside: [{ test: 'ECG', reason: 'Cardiac rhythm and structural baseline.' },
                { test: 'Urinalysis', reason: 'UTI / proteinuria / haematuria.' }],
      specialist: [],
    };
  }
  const seen = new Set();
  const merged = { labs: [], imaging: [], bedside: [], specialist: [] };
  pool.forEach(cond => {
    ['labs','imaging','bedside','specialist'].forEach(g => {
      (cond.investigations[g] || []).forEach(item => {
        const k = (item.test || '').toLowerCase();
        if (k && !seen.has(g + ':' + k)) {
          seen.add(g + ':' + k);
          merged[g].push(item);
        }
      });
    });
  });
  return merged;
}

function fallbackTreatment({ patient, encounter }) {
  const chosen = (encounter.diagnoses && encounter.diagnoses.chosen) || [];
  const matches = chosen.map(name =>
    CONDITIONS.find(c => c.name.toLowerCase() === String(name).toLowerCase())
    || CONDITIONS.find(c => String(name).toLowerCase().includes(c.name.split(' ')[0].toLowerCase()))
  ).filter(Boolean);

  // if none, give a sensible generic supportive plan
  if (!matches.length) {
    return {
      immediate: ['Review patient and tailor management to working diagnosis.',
                  'Maintain ABCDE — airway, breathing, circulation, disability, exposure.',
                  'Establish IV access if unwell. Send baseline bloods.'],
      medications: [
        { name: 'Paracetamol', dose: '1 g', route: 'PO', frequency: 'QDS PRN', duration: 'as needed', notes: 'Analgesia / antipyretic.' },
      ],
      non_pharm: ['Hydration', 'Rest', 'Symptomatic care', 'Ensure safe discharge plan with carer if needed.'],
      monitoring: ['Vitals every 4 hours', 'Watch for new symptoms or red flags', 'Daily clinical review'],
      follow_up: 'Review in clinic in 1 week, sooner if symptoms worsen.',
      patient_advice: 'Take medication as prescribed, drink plenty of fluids, rest, and return immediately if you develop new severe symptoms such as difficulty breathing, chest pain, severe headache, repeated vomiting, fainting, weakness on one side of the body, or fever lasting more than 3 days.',
      referrals: [],
      red_flags: ['Severe pain', 'Difficulty breathing', 'Confusion', 'Weakness or numbness', 'Fainting', 'High fever'],
      summary: 'Generic offline plan generated because no condition was matched. Doctor to tailor.',
    };
  }

  // merge plans from the chosen condition(s); first match leads
  const top = matches[0].treatment;
  const merged = {
    immediate: [...(top.immediate || [])],
    medications: [...(top.medications || [])],
    non_pharm: [...(top.non_pharm || [])],
    monitoring: [...(top.monitoring || [])],
    follow_up: top.follow_up || '',
    patient_advice: top.patient_advice || '',
    red_flags: [...(top.red_flags || [])],
    referrals: [...(top.referrals || [])],
  };
  // append distinctive items from secondary diagnoses
  matches.slice(1).forEach(c => {
    (c.treatment.medications || []).forEach(m => {
      if (!merged.medications.some(x => x.name === m.name)) merged.medications.push(m);
    });
    (c.treatment.referrals || []).forEach(r => {
      if (!merged.referrals.includes(r)) merged.referrals.push(r);
    });
    (c.treatment.red_flags || []).forEach(r => {
      if (!merged.red_flags.includes(r)) merged.red_flags.push(r);
    });
  });
  return merged;
}

/* ================================================================
 *   4.  Detailed report writer (offline)
 * ================================================================
 *   Produces a long, professionally-worded clinical narrative
 *   for any phase. Used as a backup when the AI report endpoint
 *   cannot reach the external service.
 */
function fallbackPhaseReport(phase, { patient, encounter }) {
  const age = ageFromDob(patient.date_of_birth) || '?';
  const sex = patient.sex || 'unspecified sex';
  const cc  = encounter.chief_complaint || 'an unspecified chief complaint';
  const head = `**${phase.toUpperCase()} REPORT** — generated offline by the NovaMed clinical decision-support engine.\n` +
               `Patient: ${patient.full_name || '—'} (${patient.patient_id || '—'}), ${sex}, age ${age}.\n` +
               `Chief complaint: ${cc}.\n` +
               `Date of report: ${new Date().toLocaleString()}.\n\n`;

  switch (phase) {
    case 'history': {
      const hs = encounter.history_summary || '(history not yet recorded in detail)';
      return head +
`### Narrative
${hs}

### Clinical impression after history
The history points to a problem in keeping with **${cc}**. Documented history captures the key elements of the presenting complaint, past medical and surgical background, drug history with allergies, family history, social context (occupation, smoking, alcohol, living circumstances) and a relevant review of systems.

### Recommendations
Proceed to a focused physical examination paying particular attention to vital signs and the system implicated by the presenting complaint. Look for red-flag features that would change urgency or alter the differential diagnosis. Update this report at the next phase.`;
    }
    case 'examination': {
      const ex = encounter.examination || {};
      const v = ex.vitals || {};
      const vitalsLine =
        `BP ${v.systolic || '—'}/${v.diastolic || '—'} mmHg, HR ${v.heartRate || '—'} bpm, RR ${v.respRate || '—'}/min, ` +
        `Temp ${v.temperature || '—'} °C, SpO₂ ${v.spo2 || '—'} %, GCS ${v.gcs || '—'}.`;
      const warns = (encounter.warnings || []).map(w => `- [${w.level}] ${w.sign}: ${w.detail}`).join('\n') || '_No automated abnormality detected._';
      return head +
`### Vital signs
${vitalsLine}

### General appearance
${ex.general || '—'}

### Systems examination
${ex.systems || '—'}

### Automated abnormality screen
${warns}

### Clinical impression after examination
The findings are integrated with the history above. Vital-sign abnormalities (if any) are flagged. The clinician should now formulate a focused differential diagnosis based on the combined history and examination.`;
    }
    case 'diagnosis': {
      const dx = encounter.diagnoses || {};
      const dList = (dx.differentials || []).map((d, i) =>
        `${i + 1}. **${d.name}** (${d.likelihood || 'moderate'}) — ${d.reasoning || ''}`).join('\n') || '_No differentials generated yet._';
      const chosen = (dx.chosen || []).map(c => `- ${c}`).join('\n') || '_None chosen yet._';
      return head +
`### Differential diagnoses
${dList}

### Working diagnoses
${chosen}

### Clinical reasoning
The differentials above are derived from the synthesis of the history and examination. The most likely diagnosis is supported by the cardinal symptoms, demographics, and abnormal findings noted. Less likely diagnoses are retained pending investigation results that will refine the picture.

### Next steps
Order the targeted investigations in the next phase to confirm or refute each differential. Be ready to upgrade urgency if any red-flag feature emerges.`;
    }
    case 'investigations': {
      const inv = encounter.investigations || {};
      const list = ['labs','imaging','bedside','specialist'].map(g => {
        const items = (inv[g] || []).map(it => `  - ${it.test}${it.reason ? ' — ' + it.reason : ''}`).join('\n');
        return items ? `**${g.toUpperCase()}**\n${items}` : '';
      }).filter(Boolean).join('\n\n') || '_No investigations ordered yet._';
      const results = ((encounter.results || {}).entries || []).map(r =>
        `- **${r.label || r.kind}** ${r.abnormal ? '⚠️ abnormal' : '✓ normal'}: ${r.interpretation || ''}`).join('\n')
        || '_No results available yet._';
      return head +
`### Investigations ordered
${list}

### Results received & interpretation
${results}

### Synthesis
Each abnormal result is correlated with the working diagnoses. Any unexpected finding triggers a fresh look at the differentials and may require additional confirmatory tests. Critical / urgent abnormalities are escalated immediately.`;
    }
    case 'treatment': {
      const tx = encounter.treatment_plan || {};
      const meds = (tx.medications || []).map(m =>
        `- ${m.name} ${m.dose || ''} ${m.route || ''} ${m.frequency || ''} ${m.duration ? '× ' + m.duration : ''}${m.notes ? ' (' + m.notes + ')' : ''}`).join('\n') || '_None._';
      return head +
`### Immediate management
${(tx.immediate || []).map(x => '- ' + x).join('\n') || '_None._'}

### Medications
${meds}

### Non-pharmacological care
${(tx.non_pharm || []).map(x => '- ' + x).join('\n') || '_None._'}

### Monitoring plan
${(tx.monitoring || []).map(x => '- ' + x).join('\n') || '_None._'}

### Follow-up
${tx.follow_up || '_To be arranged._'}

### Patient advice
${tx.patient_advice || '_To be added._'}

### Red flags requiring urgent return
${(tx.red_flags || []).map(x => '- ' + x).join('\n') || '_None specified yet._'}

### Referrals
${(tx.referrals || []).map(x => '- ' + x).join('\n') || '_None._'}

### Clinical reasoning
The plan addresses the working diagnosis directly while supporting the patient symptomatically. Drug choices respect the patient's documented allergies and chronic conditions where possible. The patient is given clear safety-netting advice and a definite follow-up plan.`;
    }
    default: {
      return head + 'No detailed report template available for this phase yet.';
    }
  }
}

function fallbackFinalSummary({ patient, encounter, doctorName }) {
  const age = ageFromDob(patient.date_of_birth) || '?';
  const sex = patient.sex || 'unspecified sex';
  const cc  = encounter.chief_complaint || 'an unspecified chief complaint';
  const dx  = (encounter.diagnoses && encounter.diagnoses.chosen) || [];
  const tx  = encounter.treatment_plan || {};

  return `# CLINICAL ENCOUNTER SUMMARY (offline draft)

**Patient:** ${patient.full_name || '—'} (${patient.patient_id || '—'})
**Demographics:** ${sex}, age ${age}
**Encounter date:** ${new Date(encounter.created_at || Date.now()).toLocaleString()}
**Attending clinician:** ${doctorName || '—'}

---

## 1. Presenting concern
The patient was seen with **${cc}**.

## 2. History
${encounter.history_summary || '_History summary not recorded._'}

## 3. Examination
${(() => {
  const ex = encounter.examination || {};
  const v = ex.vitals || {};
  return `Vitals: BP ${v.systolic || '—'}/${v.diastolic || '—'} mmHg, HR ${v.heartRate || '—'} bpm, RR ${v.respRate || '—'}/min, Temp ${v.temperature || '—'} °C, SpO₂ ${v.spo2 || '—'} %, GCS ${v.gcs || '—'}.\nGeneral: ${ex.general || '—'}\nSystems: ${ex.systems || '—'}`;
})()}

## 4. Working diagnoses
${dx.length ? dx.map((d, i) => `${i + 1}. ${d}`).join('\n') : '_No working diagnosis recorded._'}

## 5. Investigations & results
${(() => {
  const inv = encounter.investigations || {};
  const lines = [];
  ['labs','imaging','bedside','specialist'].forEach(g => {
    if ((inv[g] || []).length) {
      lines.push(`**${g[0].toUpperCase() + g.slice(1)}:** ` +
        inv[g].map(i => i.test).join(', '));
    }
  });
  const results = ((encounter.results || {}).entries || []);
  if (results.length) {
    lines.push('');
    lines.push('**Results:**');
    results.forEach(r => {
      lines.push(`- ${r.label || r.kind}${r.abnormal ? ' (⚠️ abnormal)' : ''}: ${r.interpretation || ''}`);
    });
  }
  return lines.length ? lines.join('\n') : '_No investigation activity recorded._';
})()}

## 6. Management plan
**Immediate:** ${(tx.immediate || []).join('; ') || '—'}
**Medications:** ${(tx.medications || []).map(m => `${m.name} ${m.dose || ''} ${m.route || ''} ${m.frequency || ''}`).join('; ') || '—'}
**Non-pharmacological:** ${(tx.non_pharm || []).join('; ') || '—'}
**Monitoring:** ${(tx.monitoring || []).join('; ') || '—'}
**Follow-up:** ${tx.follow_up || '—'}
**Patient advice:** ${tx.patient_advice || '—'}
**Red flags:** ${(tx.red_flags || []).join('; ') || '—'}
**Referrals:** ${(tx.referrals || []).join('; ') || '—'}

---

_This summary was produced by the NovaMed offline reasoning engine because the online AI service is unavailable. The attending clinician retains full responsibility for the diagnosis and management plan recorded in this document._`;
}


module.exports = {
  CONDITIONS,
  fallbackDiagnoses,
  fallbackInvestigations,
  fallbackTreatment,
  fallbackPhaseReport,
  fallbackFinalSummary,
};
