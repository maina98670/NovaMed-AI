/**
 * NovaMed AI — claimsService.js
 * ==============================
 * Builds a pre-filled SHA/NHIF claim from a closed encounter.
 *
 * Pipeline for each encounter:
 *  1. Extract diagnoses, treatment_plan, investigations from JSONB
 *  2. Map diagnosis names → ICD-10 codes (DB lookup → AI fallback)
 *  3. Detect applicable SHA benefit package from diagnosis codes + history type
 *  4. Build line items from medications, labs, imaging
 *  5. Apply SHA tariff estimates (local lookup table)
 *  6. Return a claim object ready to INSERT or review in the UI
 */

const db  = require('../db');

/* ──────────────────────────────────────────────────────────
 * SHA TARIFF REFERENCE  (KES, 2024 schedule — update annually)
 * Key = lowercase keyword found in investigation/drug description
 * ────────────────────────────────────────────────────────── */
const SHA_TARIFFS = {
  /* Consultations */
  consultation_phc:    { code: 'CON-01', amount: 500  },
  consultation_level4: { code: 'CON-04', amount: 1500 },
  consultation_level5: { code: 'CON-05', amount: 2500 },

  /* Common labs */
  malaria:              { code: 'LAB-001', amount: 200  },
  'full blood':         { code: 'LAB-002', amount: 500  },
  'blood count':        { code: 'LAB-002', amount: 500  },
  'fbc':                { code: 'LAB-002', amount: 500  },
  'cbc':                { code: 'LAB-002', amount: 500  },
  'haemoglobin':        { code: 'LAB-002', amount: 500  },
  'hemoglobin':         { code: 'LAB-002', amount: 500  },
  creatinine:           { code: 'LAB-003', amount: 350  },
  'renal function':     { code: 'LAB-010', amount: 500  },  // U&E/RFT panel
  'rft':                { code: 'LAB-010', amount: 500  },
  'u&e':                { code: 'LAB-010', amount: 500  },
  'urea and electrolyte':{ code: 'LAB-010', amount: 500  },
  'urea & electrolyte': { code: 'LAB-010', amount: 500  },
  'electrolytes':       { code: 'LAB-010', amount: 500  },
  'sodium':             { code: 'LAB-010', amount: 500  },
  'potassium':          { code: 'LAB-010', amount: 500  },
  'chloride':           { code: 'LAB-010', amount: 500  },
  'bicarbonate':        { code: 'LAB-010', amount: 500  },
  'serum electrolyte':  { code: 'LAB-010', amount: 500  },
  glucose:              { code: 'LAB-004', amount: 150  },
  'blood sugar':        { code: 'LAB-004', amount: 150  },
  'rbs':                { code: 'LAB-004', amount: 150  },
  'fbs':                { code: 'LAB-004', amount: 150  },
  urinalysis:           { code: 'LAB-005', amount: 200  },
  'urine analysis':     { code: 'LAB-005', amount: 200  },
  'urine culture':      { code: 'LAB-013', amount: 1200 },
  'liver function':     { code: 'LAB-006', amount: 600  },
  'lft':                { code: 'LAB-006', amount: 600  },
  'lfts':               { code: 'LAB-006', amount: 600  },
  'typhoid':            { code: 'LAB-007', amount: 300  },
  'widal':              { code: 'LAB-007', amount: 300  },
  'hiv':                { code: 'LAB-008', amount: 250  },
  pregnancy:            { code: 'LAB-009', amount: 150  },
  'urine pregnancy':    { code: 'LAB-009', amount: 150  },
  'beta hcg':           { code: 'LAB-009', amount: 150  },
  'lipid profile':      { code: 'LAB-011', amount: 600  },
  'cholesterol':        { code: 'LAB-011', amount: 600  },
  'hba1c':              { code: 'LAB-012', amount: 700  },
  'glycated':           { code: 'LAB-012', amount: 700  },
  'blood culture':      { code: 'LAB-013', amount: 1200 },
  culture:              { code: 'LAB-013', amount: 1200 },
  'thyroid':            { code: 'LAB-014', amount: 800  },
  'tsh':                { code: 'LAB-014', amount: 800  },
  'psa':                { code: 'LAB-015', amount: 900  },
  'cd4':                { code: 'LAB-016', amount: 900  },
  'viral load':         { code: 'LAB-017', amount: 3500 },
  'sputum':             { code: 'LAB-018', amount: 400  },
  'genexpert':          { code: 'LAB-019', amount: 1500 },
  'stool':              { code: 'LAB-020', amount: 300  },
  'chest x':            { code: 'IMG-001', amount: 1500 },
  xray:                 { code: 'IMG-001', amount: 1500 },
  'x-ray':              { code: 'IMG-001', amount: 1500 },
  ultrasound:           { code: 'IMG-002', amount: 2500 },
  'scan':               { code: 'IMG-002', amount: 2500 },
  ecg:                  { code: 'IMG-003', amount: 600  },
  'electrocardiogram':  { code: 'IMG-003', amount: 600  },
  ct:                   { code: 'IMG-004', amount: 8000 },
  mri:                  { code: 'IMG-005', amount: 15000},
  echo:                 { code: 'IMG-006', amount: 5000 },
  echocardiogram:       { code: 'IMG-006', amount: 5000 },

  /* Common drugs (unit cost estimates) */
  amoxicillin:     { code: 'DRG-101', amount: 10   },
  azithromycin:    { code: 'DRG-102', amount: 25   },
  metronidazole:   { code: 'DRG-103', amount: 8    },
  ciprofloxacin:   { code: 'DRG-104', amount: 20   },
  paracetamol:     { code: 'DRG-105', amount: 5    },
  ibuprofen:       { code: 'DRG-106', amount: 8    },
  omeprazole:      { code: 'DRG-107', amount: 15   },
  'oral rehydration': { code: 'DRG-108', amount: 40 },
  artemether:      { code: 'DRG-109', amount: 120  },
  coartem:         { code: 'DRG-109', amount: 120  },
  salbutamol:      { code: 'DRG-110', amount: 350  },
  prednisolone:    { code: 'DRG-111', amount: 12   },
  insulin:         { code: 'DRG-112', amount: 450  },
  metformin:       { code: 'DRG-113', amount: 15   },
  amlodipine:      { code: 'DRG-114', amount: 20   },
  lisinopril:      { code: 'DRG-115', amount: 18   },
  atenolol:        { code: 'DRG-116', amount: 12   },
};

/* ──────────────────────────────────────────────────────────
 * ICD-10 quick map for the most common conditions in Kenya.
 * DB lookup supersedes this; AI fills any remaining gaps.
 * ────────────────────────────────────────────────────────── */
const ICD10_QUICK = {
  malaria:               'B54',
  'plasmodium falciparum': 'B50.9',
  pneumonia:             'J18.9',
  'upper respiratory':   'J06.9',
  uri:                   'J06.9',
  'urinary tract':       'N39.0',
  uti:                   'N39.0',
  typhoid:               'A01.0',
  'gastroenteritis':     'A09',
  diarrhoea:             'A09',
  tuberculosis:          'A15.9',
  tb:                    'A15.9',
  'hypertension':        'I10',
  diabetes:              'E11.9',
  'type 2 diabetes':     'E11.9',
  anaemia:               'D64.9',
  asthma:                'J45.9',
  'sickle cell':         'D57.1',
  'hiv':                 'B24',
  sepsis:                'A41.9',
  'heart failure':       'I50.9',
  'acute kidney':        'N17.9',
  'stroke':              'I64',
  'peptic ulcer':        'K27.9',
  'appendicitis':        'K37',
  'ectopic':             'O00.9',
  preeclampsia:          'O14.9',
  'normal delivery':     'O80',
  'caesarean':           'O82',
  measles:               'B05.9',
  chickenpox:            'B01.9',
};

/* ──────────────────────────────────────────────────────────
 * Benefit package detection from ICD-10 codes + history type
 * ────────────────────────────────────────────────────────── */
const PACKAGE_RULES = [
  { codes: ['O00','O10','O11','O12','O13','O14','O15','O80','O82'], pkg: 'ECMB' },
  { codes: ['A15','A16','A17','A18','A19'], pkg: 'CICB' },  // TB
  { codes: ['B20','B21','B22','B23','B24'], pkg: 'CICB' },  // HIV
  { codes: ['E10','E11','E12','E13','E14'], pkg: 'CICB' },  // Diabetes
  { codes: ['I10','I11','I12','I13','I15'], pkg: 'CICB' },  // Hypertension
  { codes: ['I50','I60','I61','I62','I63','I64'], pkg: 'ECMB' }, // Stroke/HF
  { codes: ['N17','N18'], pkg: 'CICB' },                    // CKD
  { codes: ['A41'], pkg: 'ECMB' },                          // Sepsis
  { codes: ['S','T'], pkg: 'ECMB' },                        // Trauma (prefix)
];

/* ──────────────────────────────────────────────────────────
 * Load DB-overridden SHA tariffs (admin-editable).
 * Priority (highest → lowest):
 *   1. sha_tariff_overrides  (manually entered / keyword-mapped overrides)
 *   2. tariff_items          (from uploaded sha_tariffs.sql — matched by service_name)
 *   3. surgical_procedures   (from uploaded sha_tariffs.sql — matched by procedure_name)
 *   4. SHA_TARIFFS hardcoded constant (fallback)
 * ────────────────────────────────────────────────────────── */
async function getEffectiveTariffs() {
  const merged = { ...SHA_TARIFFS };

  // Layer 2: tariff_items from sha_tariffs.sql upload
  try {
    const { rows: tiRows } = await db.query(
      `SELECT LOWER(service_name) AS key, tariff_amount
         FROM tariff_items WHERE tariff_amount IS NOT NULL`
    );
    tiRows.forEach(r => {
      const key = r.key.trim();
      if (!merged[key]) {
        // Derive a code from the first words of the service name
        const codeParts = key.replace(/[^a-z0-9 ]/g,' ').trim().split(/\s+/).slice(0,2).join('-').toUpperCase();
        merged[key] = { code: `SHA-${codeParts.substring(0,8)}`, amount: Number(r.tariff_amount) };
      }
    });
  } catch (_) { /* tariff_items table not yet created — skip */ }

  // Layer 3: surgical_procedures from sha_tariffs.sql upload
  try {
    const { rows: spRows } = await db.query(
      `SELECT LOWER(procedure_name) AS key, tariff_kes FROM surgical_procedures`
    );
    spRows.forEach(r => {
      const key = r.key.trim();
      if (!merged[key]) {
        const codePart = key.replace(/[^a-z0-9]/g,'').substring(0,8).toUpperCase();
        merged[key] = { code: `PROC-${codePart}`, amount: Number(r.tariff_kes) };
      }
    });
  } catch (_) { /* surgical_procedures table not yet created — skip */ }

  // Layer 1: sha_tariff_overrides (wins over everything)
  try {
    const { rows } = await db.query(
      `SELECT keyword, sha_code, amount_kes FROM sha_tariff_overrides WHERE is_active=TRUE ORDER BY keyword`
    );
    rows.forEach(r => {
      merged[r.keyword.toLowerCase()] = { code: r.sha_code, amount: Number(r.amount_kes) };
    });
  } catch (_) { /* table may not exist yet */ }

  return merged;
}

/**
 * Look up a surgical procedure tariff from sha_tariffs.sql uploaded data.
 * Returns { procedure_name, tariff_kes } or null.
 */
async function lookupSurgicalTariff(procedureName) {
  const key = (procedureName || '').toLowerCase().trim();
  if (!key) return null;
  try {
    const { rows } = await db.query(
      `SELECT procedure_name, tariff_kes FROM surgical_procedures
        WHERE LOWER(procedure_name) ILIKE $1 LIMIT 1`,
      [`%${key}%`]
    );
    return rows[0] || null;
  } catch (_) { return null; }
}

function detectBenefitPackage(icd10Codes = [], historyType = '') {
  for (const code of icd10Codes) {
    for (const rule of PACKAGE_RULES) {
      if (rule.codes.some(prefix => code.startsWith(prefix))) return rule.pkg;
    }
  }
  if (historyType === 'surgical') return 'MSB';
  return 'PCB'; // default outpatient
}

/* ──────────────────────────────────────────────────────────
 * ICD-10 resolver: DB → quick map → AI → 'Z99.9' (unknown)
 * ────────────────────────────────────────────────────────── */
async function resolveIcd10(diagnosisName, aiService = null) {
  const name = (diagnosisName || '').toLowerCase().trim();
  if (!name) return 'Z99.9';

  // 1. Database full-text search
  try {
    const { rows } = await db.query(
      `SELECT code FROM icd10_codes
        WHERE to_tsvector('english', description) @@ plainto_tsquery('english', $1)
           OR LOWER(description) LIKE $2
        ORDER BY ts_rank(to_tsvector('english', description), plainto_tsquery('english', $1)) DESC
        LIMIT 1`,
      [name, `%${name.split(' ')[0]}%`]
    );
    if (rows[0]) return rows[0].code;
  } catch (_) {}

  // 2. Quick in-memory lookup
  for (const [keyword, code] of Object.entries(ICD10_QUICK)) {
    if (name.includes(keyword)) return code;
  }

  // 3. AI fallback (only if aiService is available)
  if (aiService) {
    try {
      const result = await aiService.callAI(
        `Return ONLY the single most appropriate ICD-10 code (format: X##.#) for this diagnosis: "${diagnosisName}". Reply with just the code, nothing else.`,
        { json: false, maxOutputTokens: 10 }
      );
      const match = result.trim().match(/[A-Z]\d{2}\.?\d*/);
      if (match) return match[0];
    } catch (_) {}
  }

  return 'Z99.9';
}

/* ──────────────────────────────────────────────────────────
 * Extract and price line items from treatment_plan JSONB
 * Shape expected from aiService:
 *   treatment_plan.medications = [{ drug, dose, route, frequency, duration_days }]
 *   treatment_plan.investigations = [{ test, category }]
 * ────────────────────────────────────────────────────────── */
function buildMedicationLineItems(medications = [], tariffs = SHA_TARIFFS) {
  return medications.map(med => {
    const name = (med.drug || med.name || '').toLowerCase();
    const tariff = Object.entries(tariffs).find(([k]) => name.includes(k));
    const unit_cost = tariff ? tariff[1].amount : 30; // KES 30 default
    const days = parseInt(med.duration_days) || parseInt(med.duration) || 5;
    // crude qty: 3x/day default if not parsed
    const freqMap = { 'od':1,'bd':2,'tds':3,'qds':4,'nocte':1,'stat':1 };
    const freqKey = Object.keys(freqMap).find(k => (med.frequency||'').toLowerCase().includes(k));
    const daily = freqMap[freqKey] || 2;
    const qty = days * daily;
    const sha_code = tariff ? tariff[1].code : 'DRG-999';

    return {
      type: 'drug',
      description: `${med.drug || 'Medication'} ${med.dose || ''} ${med.route || ''} ${med.frequency || ''}`.trim(),
      quantity: qty,
      unit_cost,
      total: +(qty * unit_cost).toFixed(2),
      sha_code,
    };
  });
}

function buildInvestigationLineItems(investigations = [], tariffs = SHA_TARIFFS) {
  const allTests = [
    ...(investigations.labs || []),
    ...(investigations.imaging || []),
    ...(investigations.bedside || []),
    ...(investigations.other || []),
    // flat array fallback
    ...(Array.isArray(investigations) ? investigations : []),
  ];

  return allTests.map(inv => {
    const name = (inv.test || inv.name || inv || '').toString().toLowerCase();
    const tariff = Object.entries(tariffs).find(([k]) => name.includes(k));
    const amount = tariff ? tariff[1].amount : 500;
    const sha_code = tariff ? tariff[1].code : 'LAB-999';
    const type = name.match(/x.?ray|ultrasound|ct|mri|ecg|echo/) ? 'imaging' : 'lab';

    return {
      type,
      description: inv.test || inv.name || String(inv),
      quantity: 1,
      unit_cost: amount,
      total: amount,
      sha_code,
    };
  });
}

/* ──────────────────────────────────────────────────────────
 * MAIN: buildClaim(encounterId, aiService)
 * Returns a claim object ready to upsert into the claims table.
 * ────────────────────────────────────────────────────────── */
async function buildClaim(encounterId, aiService = null) {
  // 1. Fetch full encounter + patient
  const { rows: encRows } = await db.query(
    `SELECT e.*, p.full_name, p.date_of_birth, p.sex, p.sha_member_no,
            p.nhif_no, p.scheme_type, p.id as p_id, p.blood_group,
            p.chronic_conditions, p.allergies,
            u.full_name AS doctor_name, u.specialty
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
  LEFT JOIN users u ON u.id = e.doctor_id
      WHERE e.id = $1`,
    [encounterId]
  );
  if (!encRows[0]) throw new Error('Encounter not found');
  const enc = encRows[0];

  // 2. Get facility config
  const { rows: facRows } = await db.query('SELECT * FROM facility_config LIMIT 1');
  const facility = facRows[0] || {};

  // 3. Resolve diagnoses → ICD-10
  const diagnoses = enc.diagnoses || {};
  // diagnoses can be: { chosen: [...], provisional: '...' } OR an array of strings
  let diagList = [];
  if (Array.isArray(diagnoses)) {
    diagList = diagnoses;
  } else {
    if (Array.isArray(diagnoses.chosen)) diagList = [...diagnoses.chosen];
    if (diagnoses.provisional) diagList.push(diagnoses.provisional);
  }
  // Normalise each entry to a string
  diagList = diagList.map(d => (typeof d === 'string' ? d : (d.name || d.label || JSON.stringify(d)))).filter(Boolean);

  const icd10List = await Promise.all(
    diagList.map(d => resolveIcd10(d, aiService))
  );
  const [primary_icd10, ...restIcd] = [...new Set(icd10List)];
  const secondary_icd10 = restIcd.filter(c => c !== 'Z99.9').slice(0, 5);

  // 4. Benefit package detection
  const allCodes = [primary_icd10, ...secondary_icd10].filter(Boolean);
  const benefit_package = detectBenefitPackage(allCodes, enc.history_type);

  // 5. Build line items
  const treatmentPlan = enc.treatment_plan || {};
  const investigations = enc.investigations || {};
  const effectiveTariffs = await getEffectiveTariffs();

  const medItems  = buildMedicationLineItems(treatmentPlan.medications || [], effectiveTariffs);
  const invItems  = buildInvestigationLineItems(investigations, effectiveTariffs);

  // Surgical procedure line items (from uploaded sha_tariffs.sql surgical_procedures table)
  const procItems = [];
  const procedures = treatmentPlan.procedures || treatmentPlan.surgical_procedures || [];
  for (const proc of (Array.isArray(procedures) ? procedures : [])) {
    const name = (proc.procedure || proc.name || proc || '').toString();
    if (!name) continue;
    const dbProc = await lookupSurgicalTariff(name);
    const tariffMatch = Object.entries(effectiveTariffs).find(([k]) => name.toLowerCase().includes(k));
    const unit_cost = dbProc ? Number(dbProc.tariff_kes) : (tariffMatch ? tariffMatch[1].amount : 2000);
    const sha_code  = tariffMatch ? tariffMatch[1].code : 'PROC-001';
    procItems.push({
      type: 'procedure',
      description: dbProc ? dbProc.procedure_name : name,
      quantity: 1,
      unit_cost,
      total: unit_cost,
      sha_code,
    });
  }

  // Consultation fee from facility level
  const levelKey = `consultation_level${facility.facility_level || '4'}`;
  const consFee  = (effectiveTariffs[levelKey] || effectiveTariffs['consultation_level4'] || SHA_TARIFFS['consultation_level4']).amount;

  const consultItem = {
    type: 'consultation',
    description: `Outpatient consultation — ${enc.chief_complaint || 'general'}`,
    quantity: 1,
    unit_cost: consFee,
    total: consFee,
    sha_code: SHA_TARIFFS[levelKey]?.code || 'CON-04',
  };

  const line_items = [consultItem, ...medItems, ...invItems, ...procItems];

  // 6. Compute totals per category
  const sum = (type) =>
    line_items
      .filter(i => i.type === type)
      .reduce((acc, i) => acc + (i.total || 0), 0);

  const consultation_fee  = sum('consultation');
  const drugs_total       = sum('drug');
  const labs_total        = sum('lab');
  const imaging_total     = sum('imaging');
  const procedures_total  = sum('procedure');
  const grand_total       = line_items.reduce((a, i) => a + (i.total || 0), 0);

  // 7. Payable estimate — logic depends on payment scheme
  const scheme = enc.scheme_type || 'SHA';
  let sha_payable, patient_copay;

  if (scheme === 'CASH') {
    // Cash: patient owes everything, payer pays nothing
    sha_payable   = 0;
    patient_copay = grand_total;
  } else if (scheme === 'PRIVATE') {
    // Private insurance: insurer pays 80%, patient pays 20% co-pay (common Kenyan model)
    // Facilities can adjust this in the UI after generation
    sha_payable   = +(grand_total * 0.8).toFixed(2);
    patient_copay = +(grand_total * 0.2).toFixed(2);
  } else {
    // SHA / NHIF: apply benefit package cap
    const { rows: pkgRows } = await db.query(
      'SELECT max_amount_kes FROM sha_benefit_packages WHERE code = $1',
      [benefit_package]
    );
    const cap   = pkgRows[0]?.max_amount_kes || grand_total;
    sha_payable   = Math.min(grand_total, cap);
    patient_copay = Math.max(0, grand_total - sha_payable);
  }

  return {
    encounter_id:    encounterId,
    patient_id:      enc.p_id,
    sha_member_no:   enc.sha_member_no,
    nhif_no:         enc.nhif_no,
    scheme_type:     scheme,
    insurance_provider:   enc.insurance_provider   || null,
    insurance_policy_no:  enc.insurance_policy_no  || null,
    insurance_member_name: enc.insurance_member_name || null,
    benefit_package,
    primary_icd10:   primary_icd10 || 'Z99.9',
    secondary_icd10: JSON.stringify(secondary_icd10),
    consultation_fee,
    drugs_total,
    labs_total,
    imaging_total,
    procedures_total,
    bed_charges:     0,
    other_charges:   0,
    sha_payable,
    patient_copay,
    line_items:      JSON.stringify(line_items),
    status:          'draft',
    // meta — returned to UI but not stored directly
    _meta: {
      patient_name:   enc.full_name,
      patient_dob:    enc.date_of_birth,
      sex:            enc.sex,
      doctor_name:    enc.doctor_name,
      specialty:      enc.specialty,
      chief_complaint:enc.chief_complaint,
      encounter_date: enc.created_at,
      facility_name:  facility.facility_name,
      sha_facility_code: facility.sha_facility_code,
      facility_level: facility.facility_level,
      grand_total,
    },
  };
}

/* ──────────────────────────────────────────────────────────
 * upsertClaim — create or update a claim for an encounter
 * ────────────────────────────────────────────────────────── */
async function upsertClaim(claimData) {
  const {
    encounter_id, patient_id, sha_member_no, nhif_no, scheme_type,
    insurance_provider, insurance_policy_no, insurance_member_name,
    benefit_package, preauth_code, primary_icd10, secondary_icd10,
    consultation_fee, drugs_total, labs_total, imaging_total,
    procedures_total, bed_charges, other_charges, sha_payable,
    patient_copay, line_items, status, notes, created_by,
  } = claimData;

  const { rows } = await db.query(
    `INSERT INTO claims (
        encounter_id, patient_id, sha_member_no, nhif_no, scheme_type,
        insurance_provider, insurance_policy_no, insurance_member_name,
        benefit_package, preauth_code, primary_icd10, secondary_icd10,
        consultation_fee, drugs_total, labs_total, imaging_total,
        procedures_total, bed_charges, other_charges, sha_payable,
        patient_copay, line_items, status, notes, created_by
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
     )
     ON CONFLICT (encounter_id) DO UPDATE SET
        sha_member_no = EXCLUDED.sha_member_no,
        nhif_no = EXCLUDED.nhif_no,
        scheme_type = EXCLUDED.scheme_type,
        insurance_provider = EXCLUDED.insurance_provider,
        insurance_policy_no = EXCLUDED.insurance_policy_no,
        insurance_member_name = EXCLUDED.insurance_member_name,
        benefit_package = EXCLUDED.benefit_package,
        preauth_code = EXCLUDED.preauth_code,
        primary_icd10 = EXCLUDED.primary_icd10,
        secondary_icd10 = EXCLUDED.secondary_icd10,
        consultation_fee = EXCLUDED.consultation_fee,
        drugs_total = EXCLUDED.drugs_total,
        labs_total = EXCLUDED.labs_total,
        imaging_total = EXCLUDED.imaging_total,
        procedures_total = EXCLUDED.procedures_total,
        bed_charges = EXCLUDED.bed_charges,
        other_charges = EXCLUDED.other_charges,
        sha_payable = EXCLUDED.sha_payable,
        patient_copay = EXCLUDED.patient_copay,
        line_items = EXCLUDED.line_items,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes
     RETURNING *`,
    [
      encounter_id, patient_id, sha_member_no, nhif_no, scheme_type,
      insurance_provider || null, insurance_policy_no || null, insurance_member_name || null,
      benefit_package, preauth_code || null, primary_icd10, secondary_icd10,
      consultation_fee, drugs_total, labs_total, imaging_total,
      procedures_total, bed_charges || 0, other_charges || 0, sha_payable,
      patient_copay, line_items, status || 'draft', notes || null, created_by || null,
    ]
  );
  return rows[0];
}

/* ──────────────────────────────────────────────────────────
 * markSubmitted — record the SHA portal reference number
 * ────────────────────────────────────────────────────────── */
async function markSubmitted(claimId, submissionRef) {
  const { rows } = await db.query(
    `UPDATE claims SET status='submitted', submission_ref=$1, submitted_at=NOW()
      WHERE id=$2 RETURNING *`,
    [submissionRef, claimId]
  );
  return rows[0];
}

/* ──────────────────────────────────────────────────────────
 * getClaimStats — admin dashboard numbers
 * ────────────────────────────────────────────────────────── */
async function getClaimStats() {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                              AS total,
      COUNT(*) FILTER (WHERE status='draft')      AS draft,
      COUNT(*) FILTER (WHERE status='submitted')  AS submitted,
      COUNT(*) FILTER (WHERE status='paid')       AS paid,
      COUNT(*) FILTER (WHERE status='rejected')   AS rejected,
      COALESCE(SUM(grand_total), 0)               AS total_billed,
      COALESCE(SUM(sha_payable) FILTER (WHERE status='paid'), 0) AS total_paid
    FROM claims
  `);
  return rows[0];
}

module.exports = {
  buildClaim,
  upsertClaim,
  markSubmitted,
  getClaimStats,
  resolveIcd10,
  detectBenefitPackage,
  getEffectiveTariffs,
  SHA_TARIFFS,
};
