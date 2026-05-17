/**
 * NovaMed AI — Medical knowledge seed loader
 * ==========================================
 * Imports the curated condition set from medicalKnowledge.js into the DB.
 * Idempotent — re-running upserts.
 *
 * Run via:  node src/db/seedMedical.js
 */
require('dotenv').config();
const db = require('./index');

// Pull in-memory KB (same conditions used previously as fallbacks)
const KB = require('../services/medicalKnowledge');

const SYMPTOM_BANK = [
  // cardiovascular
  ['Chest pain',       'Cardiovascular'],
  ['Palpitations',     'Cardiovascular'],
  ['Shortness of breath','Cardiovascular'],
  ['Orthopnoea',       'Cardiovascular'],
  ['Leg swelling',     'Cardiovascular'],
  // respiratory
  ['Cough',            'Respiratory'],
  ['Sputum production','Respiratory'],
  ['Haemoptysis',      'Respiratory'],
  ['Wheeze',           'Respiratory'],
  // GI
  ['Nausea',           'Gastrointestinal'],
  ['Vomiting',         'Gastrointestinal'],
  ['Diarrhoea',        'Gastrointestinal'],
  ['Abdominal pain',   'Gastrointestinal'],
  ['Dysuria',          'Genitourinary'],
  ['Frequency',        'Genitourinary'],
  ['Haematuria',       'Genitourinary'],
  // neuro
  ['Headache',         'Neurological'],
  ['Weakness',         'Neurological'],
  ['Loss of consciousness','Neurological'],
  ['Seizure',          'Neurological'],
  // general
  ['Fever',            'General'],
  ['Chills',           'General'],
  ['Weight loss',      'General'],
  ['Fatigue',          'General'],
  ['Polyuria',         'Endocrine'],
  ['Polydipsia',       'Endocrine'],
  ['Back pain',        'Musculoskeletal'],
  ['Low mood',         'Psychiatric'],
  ['Anhedonia',        'Psychiatric'],
];

const QUESTION_BANK = [
  // HPC
  { section: 'HPC', question: 'What is the main complaint that brought the patient in today?', importance: 10 },
  { section: 'HPC', question: 'When did the symptom start, and was the onset sudden or gradual?', importance: 9 },
  { section: 'HPC', question: 'How would you describe the character of the symptom (e.g., sharp, dull, burning)?', importance: 8 },
  { section: 'HPC', question: 'Does the pain or symptom radiate anywhere else?', importance: 7, follow_up_for: 'pain' },
  { section: 'HPC', question: 'On a scale of 0–10, how severe is the symptom right now?', importance: 8 },
  { section: 'HPC', question: 'What makes the symptom worse?', importance: 7 },
  { section: 'HPC', question: 'What relieves the symptom?', importance: 7 },
  { section: 'HPC', question: 'Are there any associated symptoms (fever, sweating, vomiting, breathlessness)?', importance: 8 },
  { section: 'HPC', question: 'Has the symptom changed since onset (better, worse, intermittent)?', importance: 7 },
  // PMH
  { section: 'PMH', question: 'Does the patient have any chronic illnesses (diabetes, hypertension, asthma, HIV, TB, sickle cell)?', importance: 9 },
  { section: 'PMH', question: 'Has the patient had similar symptoms in the past?', importance: 7 },
  { section: 'PMH', question: 'Any past hospitalisations or surgeries?', importance: 7 },
  // DH
  { section: 'DH',  question: 'What medications is the patient currently taking?', importance: 9 },
  { section: 'DH',  question: 'Are there any known drug allergies, and if so what reaction occurred?', importance: 9 },
  { section: 'DH',  question: 'Any recent over-the-counter or herbal medicines used?', importance: 6 },
  // FH
  { section: 'FH',  question: 'Any family history of cardiovascular disease, cancer, diabetes, or mental illness?', importance: 7 },
  { section: 'FH',  question: 'Are there any inherited or genetic disorders in the family?', importance: 6 },
  // SH
  { section: 'SH',  question: 'What is the patient\'s occupation and any related exposures?', importance: 6 },
  { section: 'SH',  question: 'Does the patient smoke? If so, how many cigarettes per day for how many years?', importance: 7 },
  { section: 'SH',  question: 'How much alcohol does the patient consume per week?', importance: 7 },
  { section: 'SH',  question: 'Any recent travel, especially to malaria-endemic regions?', importance: 7, follow_up_for: 'fever' },
  // ROS
  { section: 'ROS', question: 'Cardiovascular review: any chest pain, palpitations, orthopnoea, or leg swelling?', importance: 7 },
  { section: 'ROS', question: 'Respiratory review: any cough, sputum, haemoptysis, wheeze, or breathlessness?', importance: 7 },
  { section: 'ROS', question: 'GI review: any nausea, vomiting, abdominal pain, change in bowel habit, or weight loss?', importance: 7 },
  { section: 'ROS', question: 'GU review: any dysuria, frequency, haematuria, or flank pain?', importance: 7 },
  { section: 'ROS', question: 'Neuro review: any headache, weakness, numbness, seizures, or memory change?', importance: 7 },
];

async function ensureSymptoms() {
  for (const [name, sys] of SYMPTOM_BANK) {
    await db.query(
      `INSERT INTO symptoms (name, body_system) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, sys]
    );
  }
}

async function ensureQuestions() {
  // Wipe & reload — small, idempotent for clean state
  await db.query(`TRUNCATE history_questions RESTART IDENTITY`);
  for (const q of QUESTION_BANK) {
    await db.query(
      `INSERT INTO history_questions (section, question, importance, follow_up_for)
       VALUES ($1, $2, $3, $4)`,
      [q.section, q.question, q.importance, q.follow_up_for || null]
    );
  }
}

async function ensureDisease(c) {
  // Map age range string
  let ageGroup = 'any';
  if (c.age?.max && c.age.max <= 16) ageGroup = 'pediatric';
  else if (c.age?.min && c.age.min >= 18) ageGroup = 'adult';

  // Upsert disease
  const d = await db.query(`
    INSERT INTO diseases (name, category, age_group, sex, reasoning, red_flags)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (name) DO UPDATE
      SET category = EXCLUDED.category,
          age_group = EXCLUDED.age_group,
          sex = EXCLUDED.sex,
          reasoning = EXCLUDED.reasoning,
          red_flags = EXCLUDED.red_flags
    RETURNING id
  `, [
    c.name,
    c.category || null,
    ageGroup,
    c.sex || 'any',
    c.reasoning || null,
    c.redFlags || [],
  ]);
  const id = d.rows[0].id;

  // Wipe child rows then re-insert
  await db.query('DELETE FROM disease_keywords WHERE disease_id = $1', [id]);
  for (const kw of (c.keywords || [])) {
    await db.query(
      `INSERT INTO disease_keywords (disease_id, keyword, weight, against)
       VALUES ($1, $2, $3, FALSE)`,
      [id, kw, kw.length]    // weight = length of keyword
    );
  }
  for (const kw of (c.againstKw || [])) {
    await db.query(
      `INSERT INTO disease_keywords (disease_id, keyword, weight, against)
       VALUES ($1, $2, $3, TRUE)`,
      [id, kw, kw.length]
    );
  }

  // Link symptoms based on keyword overlap
  for (const kw of (c.keywords || [])) {
    const sym = await db.query('SELECT id FROM symptoms WHERE LOWER(name) LIKE $1 LIMIT 1', ['%' + kw.toLowerCase() + '%']);
    if (sym.rows[0]) {
      await db.query(
        `INSERT INTO disease_symptoms (disease_id, symptom_id, weight)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, sym.rows[0].id, 2.0]
      );
    }
  }

  // Investigations
  await db.query('DELETE FROM disease_investigations WHERE disease_id = $1', [id]);
  for (const cat of ['labs','imaging','bedside','specialist']) {
    const arr = (c.investigations && c.investigations[cat]) || [];
    const dbCat = cat === 'labs' ? 'lab' : cat;
    for (const t of arr) {
      await db.query(
        `INSERT INTO disease_investigations (disease_id, category, test, reason)
         VALUES ($1, $2, $3, $4)`,
        [id, dbCat, t.test || t.name || String(t), t.reason || null]
      );
    }
  }

  // Treatments
  await db.query('DELETE FROM disease_treatments WHERE disease_id = $1', [id]);
  const tx = c.treatment || {};
  for (const item of (tx.immediate || [])) {
    await db.query(
      `INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'immediate', $2)`,
      [id, item]
    );
  }
  for (const m of (tx.medications || [])) {
    await db.query(
      `INSERT INTO disease_treatments (disease_id, type, item, dose, route, frequency, duration, notes)
       VALUES ($1, 'medication', $2, $3, $4, $5, $6, $7)`,
      [id, m.name, m.dose || null, m.route || null, m.frequency || null, m.duration || null, m.notes || null]
    );
  }
  for (const item of (tx.non_pharm || [])) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'non_pharm', $2)`, [id, item]);
  }
  for (const item of (tx.monitoring || [])) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'monitoring', $2)`, [id, item]);
  }
  if (tx.follow_up) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'follow_up', $2)`, [id, tx.follow_up]);
  }
  if (tx.patient_advice) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'advice', $2)`, [id, tx.patient_advice]);
  }
  for (const item of (tx.red_flags || [])) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'red_flag', $2)`, [id, item]);
  }
  for (const item of (tx.referrals || [])) {
    await db.query(`INSERT INTO disease_treatments (disease_id, type, item) VALUES ($1, 'referral', $2)`, [id, item]);
  }
}

async function main() {
  console.log('Seeding medical knowledge...');
  await ensureSymptoms();
  await ensureQuestions();

  // Pull all conditions from the medicalKnowledge module
  const conditions = KB.CONDITIONS || [];
  console.log(`  → ${conditions.length} conditions to import`);
  for (const c of conditions) {
    try {
      await ensureDisease(c);
      process.stdout.write('.');
    } catch (e) {
      console.error(`\n  ✗ failed for ${c.name}: ${e.message}`);
    }
  }
  console.log('\n✓ Seed complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
