/**
 * Encounter (visit) lifecycle:
 *   history → examination → diagnosis → investigation → treatment → closed
 *
 * The frontend always uses a single encounter for the whole visit.
 * AI calls are reached through this router for context-rich operations.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const ai = require('../services/aiService');
const { buildEncounterPdf } = require('../services/pdfService');
const { authRequired } = require('../middleware/auth');
const { logActivity } = require('../services/activityLog');

const router = express.Router();
router.use(authRequired);

/**
 * Ownership guard — every encounter route uses this to ensure
 * that the caller (unless admin) only touches their own patients/encounters.
 */
async function requireOwnEncounter(req, res, next) {
  if (req.user?.role === 'admin') return next();
  try {
    const enc = await db.query(`
      SELECT e.id FROM encounters e
        JOIN patients p ON p.id = e.patient_id
       WHERE e.id = $1 AND (p.created_by = $2 OR e.doctor_id = $2)
    `, [req.params.id, req.user.sub]);
    if (!enc.rows[0]) return res.status(403).json({ ok: false, error: 'Not your encounter' });
    next();
  } catch (e) { next(e); }
}

// ---------- multer ----------
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 8);
      cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---------- helpers ----------
async function getEncounterFull(encounterId) {
  const { rows } = await db.query('SELECT * FROM encounters WHERE id = $1', [encounterId]);
  if (!rows[0]) return null;
  const enc = rows[0];
  const pat = (await db.query('SELECT * FROM patients WHERE id = $1', [enc.patient_id])).rows[0];
  const turns = (await db.query(
    'SELECT * FROM history_turns WHERE encounter_id = $1 ORDER BY id ASC', [encounterId]
  )).rows;
  const ups = (await db.query(
    'SELECT * FROM uploads WHERE encounter_id = $1 ORDER BY id DESC', [encounterId]
  )).rows;
  return { encounter: enc, patient: pat, turns, uploads: ups };
}

// =====================================================================
// CRUD on encounters
// =====================================================================

// POST /api/encounters    body: {patient_id, chief_complaint, history_type, input_mode}
router.post('/', async (req, res) => {
  const { patient_id, chief_complaint, history_type, input_mode } = req.body || {};
  if (!patient_id) return res.status(400).json({ ok: false, error: 'patient_id required' });

  // Verify patient ownership unless admin
  if (req.user.role !== 'admin') {
    const own = await db.query('SELECT 1 FROM patients WHERE id = $1 AND created_by = $2', [patient_id, req.user.sub]);
    if (!own.rows[0]) return res.status(403).json({ ok: false, error: 'Not your patient' });
  }

  const { rows } = await db.query(`
    INSERT INTO encounters (patient_id, doctor_id, chief_complaint, history_type, input_mode, status, case_category)
    VALUES ($1, $2, $3, $4, $5, 'history', 'pending') RETURNING *
  `, [patient_id, req.user.sub, chief_complaint || '', history_type || 'general', input_mode || 'form']);

  await logActivity({
    patient_id, encounter_id: rows[0].id, user_id: req.user.sub,
    action: 'encounter.created',
    detail: `New encounter (${history_type || 'general'}) — ${chief_complaint || 'no complaint set'}`,
  });
  res.json({ ok: true, encounter: rows[0] });
});

// GET /api/encounters/:id
router.get('/:id', requireOwnEncounter, async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, ...data });
});

// PATCH /api/encounters/:id    free-form update of any of the JSONB blobs
router.patch('/:id', requireOwnEncounter, async (req, res) => {
  const allowed = ['chief_complaint','status','case_category','history_type','input_mode',
                   'history_summary','examination','diagnoses','investigations',
                   'results','warnings','treatment_plan'];
  const fields = [], values = []; let i = 1;
  for (const k of allowed) {
    if (k in req.body) {
      fields.push(`${k} = $${i++}`);
      const v = req.body[k];
      values.push(typeof v === 'object' && v !== null ? v : v);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  // For JSONB columns we need to wrap with $::jsonb — simplest is to rebuild query
  const setParts = [];
  let idx = 1;
  const realValues = [];
  for (const k of allowed) {
    if (k in req.body) {
      const v = req.body[k];
      if (['examination','diagnoses','investigations','results','warnings','treatment_plan'].includes(k)) {
        setParts.push(`${k} = $${idx++}::jsonb`);
        realValues.push(JSON.stringify(v));
      } else if (k === 'case_category') {
        // Validate
        const cat = String(v).toLowerCase();
        if (!['pending','completed','emergency'].includes(cat)) {
          continue;
        }
        setParts.push(`${k} = $${idx++}`);
        realValues.push(cat);
      } else {
        setParts.push(`${k} = $${idx++}`);
        realValues.push(v);
      }
    }
  }
  realValues.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE encounters SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`,
    realValues
  );
  res.json({ ok: true, encounter: rows[0] });
});

// =====================================================================
// HISTORY: adaptive AI Q&A
// =====================================================================

// POST /api/encounters/:id/history/next
//   body: { lastAnswer?: string }
//   - if lastAnswer is supplied, save it as the patient turn first
//   - then ask Gemini for the next question (or completion summary)
const { transcribeAudio } = require('../services/voiceService');
const audioUpload = require('multer')({ dest: '/tmp/novamed-audio' });

router.post('/:id/voice/transcribe', requireOwnEncounter, audioUpload.single('audio'), async (req, res) => {
  const filepath = req.file?.path;
  if (!filepath) return res.status(400).json({ ok: false, error: 'No audio uploaded' });
  try {
    const text = await transcribeAudio(filepath, req.file.mimetype || 'audio/webm');
    res.json({ ok: true, text });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message, fallback: 'Use browser speech recognition' });
  } finally {
    try { fs.unlinkSync(filepath); } catch {}
  }
});

router.post('/:id/history/next', async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });

  const { lastAnswer } = req.body || {};
  if (lastAnswer && data.turns.length) {
    // attach answer to the last AI question (only if last turn was AI)
    const last = data.turns[data.turns.length - 1];
    if (last.role === 'ai') {
      await db.query(
        `INSERT INTO history_turns (encounter_id, role, section, answer) VALUES ($1, 'patient', $2, $3)`,
        [req.params.id, last.section, lastAnswer]
      );
    } else {
      await db.query(
        `INSERT INTO history_turns (encounter_id, role, answer) VALUES ($1, 'patient', $2)`,
        [req.params.id, lastAnswer]
      );
    }
  }

  // refresh
  const fresh = await getEncounterFull(req.params.id);
  const nextQ = await ai.nextHistoryQuestion({
    patient: fresh.patient,
    encounter: fresh.encounter,
    turns: fresh.turns,
    historyType: fresh.encounter.history_type || 'general',
  });

  if (nextQ.done) {
    await db.query(
      `UPDATE encounters SET history_summary = $1, status = 'examination' WHERE id = $2`,
      [nextQ.summary || '', req.params.id]
    );
    return res.json({ ok: true, done: true, summary: nextQ.summary });
  }

  await db.query(
    `INSERT INTO history_turns (encounter_id, role, section, question, meta) VALUES ($1, 'ai', $2, $3, $4::jsonb)`,
    [req.params.id, nextQ.section, nextQ.question, JSON.stringify({ rationale: nextQ.rationale })]
  );
  res.json({ ok: true, done: false, question: nextQ.question, section: nextQ.section, rationale: nextQ.rationale });
});

// POST /api/encounters/:id/history/form
// body: { sections: { HPC: {...}, PMH: {...}, ... }, summaryOverride?: string }
router.post('/:id/history/form', async (req, res) => {
  const { sections, summaryOverride } = req.body || {};
  if (!sections) return res.status(400).json({ ok: false, error: 'sections required' });

  const lines = [];
  for (const [sec, fields] of Object.entries(sections)) {
    lines.push(`### ${sec}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v && String(v).trim()) lines.push(`- ${k}: ${v}`);
    }
  }
  const summary = summaryOverride || lines.join('\n');

  // also dump each as a doctor turn for the audit trail
  for (const [sec, fields] of Object.entries(sections)) {
    for (const [k, v] of Object.entries(fields)) {
      if (v && String(v).trim()) {
        await db.query(
          `INSERT INTO history_turns (encounter_id, role, section, question, answer)
           VALUES ($1, 'doctor', $2, $3, $4)`,
          [req.params.id, sec, k, String(v)]
        );
      }
    }
  }

  await db.query(
    `UPDATE encounters SET history_summary = $1, status = 'examination' WHERE id = $2`,
    [summary, req.params.id]
  );
  res.json({ ok: true, summary });
});

// =====================================================================
// EXAMINATION: save vitals + findings, run abnormality detection
// =====================================================================
router.post('/:id/examination', requireOwnEncounter, async (req, res) => {
  const exam = req.body || {};
  const warnings = ai.detectVitalAbnormalities(exam.vitals || exam, {});

  // If there are any critical warnings, auto-flag this case as emergency
  const hasCritical = (warnings || []).some(w => w.level === 'critical');
  const newCategory = hasCritical ? 'emergency' : null;

  const updateParts = [`examination = $1::jsonb`, `warnings = $2::jsonb`, `status = 'diagnosis'`];
  const params = [JSON.stringify(exam), JSON.stringify(warnings)];
  if (newCategory) {
    updateParts.push(`case_category = $${params.length + 1}`);
    params.push(newCategory);
  }
  params.push(req.params.id);

  const { rows } = await db.query(
    `UPDATE encounters SET ${updateParts.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (hasCritical) {
    await logActivity({
      patient_id: rows[0].patient_id, encounter_id: rows[0].id, user_id: req.user.sub,
      action: 'encounter.flagged_emergency',
      detail: `Critical vital signs detected: ${warnings.filter(w => w.level === 'critical').map(w => w.detail).join('; ')}`,
    });
  }
  await logActivity({
    patient_id: rows[0].patient_id, encounter_id: rows[0].id, user_id: req.user.sub,
    action: 'examination.saved', detail: `Vitals & examination recorded`,
  });

  res.json({ ok: true, encounter: rows[0], warnings });
});

// =====================================================================
// DIAGNOSIS
// =====================================================================
router.post('/:id/diagnosis/suggest', async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  const out = await ai.suggestDiagnoses({ patient: data.patient, encounter: data.encounter });

  // merge with any existing chosen diagnoses
  const existing = data.encounter.diagnoses || {};
  const merged = {
    ...existing,
    provisional:        out.provisional,
    differentials_full: out.differentials_full,
    differentials:      out.differentials,
    summary:            out.summary_for_doctor,
    summary_for_doctor: out.summary_for_doctor,
    urgent:             out.urgent,
    source:             out.source,
  };
  await db.query(
    `UPDATE encounters SET diagnoses = $1::jsonb WHERE id = $2`,
    [JSON.stringify(merged), req.params.id]
  );
  res.json({ ok: true, ...out });
});

router.post('/:id/diagnosis/choose', async (req, res) => {
  const { chosen } = req.body || {};   // array of strings
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  const merged = { ...(data.encounter.diagnoses || {}), chosen: chosen || [] };
  await db.query(
    `UPDATE encounters SET diagnoses = $1::jsonb, status = 'investigation' WHERE id = $2`,
    [JSON.stringify(merged), req.params.id]
  );
  res.json({ ok: true });
});

// =====================================================================
// INVESTIGATIONS
// =====================================================================
router.post('/:id/investigations/suggest', async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  const chosen = (data.encounter.diagnoses || {}).chosen || [];
  const out = await ai.suggestInvestigations({ patient: data.patient, encounter: data.encounter, chosenDiagnoses: chosen });
  await db.query(
    `UPDATE encounters SET investigations = $1::jsonb WHERE id = $2`,
    [JSON.stringify(out), req.params.id]
  );
  res.json({ ok: true, ...out });
});

router.post('/:id/investigations/save', async (req, res) => {
  await db.query(
    `UPDATE encounters SET investigations = $1::jsonb WHERE id = $2`,
    [JSON.stringify(req.body || {}), req.params.id]
  );
  res.json({ ok: true });
});

// =====================================================================
// RESULTS: text values OR uploaded file (image / pdf)
// =====================================================================
router.post('/:id/results/text', async (req, res) => {
  const { kind, label, valuesText } = req.body || {};
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });

  const out = await ai.interpretResult({
    patient: data.patient, encounter: data.encounter, kind, valuesText,
  });

  const results = data.encounter.results || { entries: [] };
  results.entries = results.entries || [];
  results.entries.push({
    kind, label, valuesText,
    interpretation: out.explanation,
    abnormalFindings: out.abnormalFindings,
    abnormal: out.abnormal,
    urgent: out.urgent,
    created_at: new Date().toISOString(),
  });

  // append warnings
  const warnings = data.encounter.warnings || [];
  if (out.abnormal && out.abnormalFindings?.length) {
    out.abnormalFindings.forEach(f =>
      warnings.push({
        level: out.urgent ? 'critical' : 'high',
        sign: `${kind || 'Result'} abnormal`,
        detail: f,
      })
    );
  }

  await db.query(
    `UPDATE encounters SET results = $1::jsonb, warnings = $2::jsonb WHERE id = $3`,
    [JSON.stringify(results), JSON.stringify(warnings), req.params.id]
  );
  res.json({ ok: true, ...out });
});

router.post('/:id/results/file', upload.single('file'), async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });

  const kind = (req.body.kind || 'other').toLowerCase();
  const label = req.body.label || req.file.originalname;

  const out = await ai.interpretResult({
    patient: data.patient, encounter: data.encounter,
    kind, valuesText: '',
    filepath: req.file.path, mimeType: req.file.mimetype,
  });

  const upRow = await db.query(`
    INSERT INTO uploads (encounter_id, patient_id, kind, original_name, stored_path, mime_type, size_bytes, interpretation, abnormal)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    req.params.id, data.encounter.patient_id, kind,
    req.file.originalname, req.file.filename,
    req.file.mimetype, req.file.size,
    out.explanation, !!out.abnormal,
  ]);

  const results = data.encounter.results || { entries: [] };
  results.entries = results.entries || [];
  results.entries.push({
    kind, label,
    file_id: upRow.rows[0].id,
    interpretation: out.explanation,
    abnormalFindings: out.abnormalFindings,
    abnormal: out.abnormal, urgent: out.urgent,
    created_at: new Date().toISOString(),
  });

  const warnings = data.encounter.warnings || [];
  if (out.abnormal && out.abnormalFindings?.length) {
    out.abnormalFindings.forEach(f =>
      warnings.push({
        level: out.urgent ? 'critical' : 'high',
        sign: `${kind} abnormal`,
        detail: f,
      })
    );
  }
  await db.query(
    `UPDATE encounters SET results = $1::jsonb, warnings = $2::jsonb WHERE id = $3`,
    [JSON.stringify(results), JSON.stringify(warnings), req.params.id]
  );

  res.json({ ok: true, upload: upRow.rows[0], ...out });
});

// =====================================================================
// TREATMENT
// =====================================================================
router.post('/:id/treatment/suggest', async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  const out = await ai.suggestTreatment({ patient: data.patient, encounter: data.encounter });
  // out = { plan: {...}, structured: {...}, source: '...' }
  // Save the plan portion to DB, return all parts to frontend
  await db.query(
    `UPDATE encounters SET treatment_plan = $1::jsonb, status = 'treatment' WHERE id = $2`,
    [JSON.stringify({ ...(out.plan || {}), structured: out.structured, source: out.source }), req.params.id]
  );
  res.json({ ok: true, plan: out.plan || {}, structured: out.structured || null, source: out.source || '' });
});

router.post('/:id/treatment/save', async (req, res) => {
  await db.query(
    `UPDATE encounters SET treatment_plan = $1::jsonb, status = 'treatment' WHERE id = $2`,
    [JSON.stringify(req.body || {}), req.params.id]
  );
  res.json({ ok: true });
});

// =====================================================================
// CLOSE / PDF
// =====================================================================
router.post('/:id/close', requireOwnEncounter, async (req, res) => {
  // Before closing, ensure diagnoses.chosen is populated for epi counting.
  // If the doctor never explicitly chose, fall back to provisional name.
  const encData = await getEncounterFull(req.params.id);
  if (encData) {
    const dx      = encData.encounter.diagnoses || {};
    const chosen  = dx.chosen || [];
    const provName = dx.provisional?.name || dx.provisional?.diagnosis;
    const hasValidChosen = chosen.filter(c =>
      c && c.trim() &&
      !['insufficient data for diagnosis','no diagnosis matched'].some(bad =>
        c.toLowerCase().includes(bad)
      )
    ).length > 0;

    if (!hasValidChosen && provName &&
      !['insufficient data for diagnosis','no diagnosis matched'].some(bad =>
        provName.toLowerCase().includes(bad)
      )
    ) {
      const merged = { ...dx, chosen: [provName] };
      await db.query(
        `UPDATE encounters SET diagnoses = $1::jsonb WHERE id = $2`,
        [JSON.stringify(merged), req.params.id]
      );
    }
  }

  const { rows } = await db.query(
    `UPDATE encounters
     SET status = 'closed',
         closed_at = NOW(),
         case_category = CASE WHEN case_category = 'emergency' THEN 'emergency' ELSE 'completed' END
     WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (rows[0]) {
    await logActivity({
      patient_id: rows[0].patient_id, encounter_id: rows[0].id, user_id: req.user.sub,
      action: 'encounter.closed', detail: 'Encounter closed and marked completed.',
    });
  }
  res.json({ ok: true });
});

router.get('/:id/pdf', async (req, res) => {
  const data = await getEncounterFull(req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
  let doctorName = '—';
  if (data.encounter.doctor_id) {
    const r = await db.query('SELECT full_name FROM users WHERE id = $1', [data.encounter.doctor_id]);
    doctorName = r.rows[0]?.full_name || '—';
  }
  // Load facility config for header
  const { rows: facRows } = await db.query('SELECT * FROM facility_config LIMIT 1');
  const facility = facRows[0] || {};
  // Load claim if it exists (for SHA tariff page)
  const { rows: claimRows } = await db.query(
    'SELECT * FROM claims WHERE encounter_id = $1 LIMIT 1',
    [req.params.id]
  );
  if (claimRows[0]) data.encounter.claim = claimRows[0];

  buildEncounterPdf(res, {
    patient:   data.patient,
    encounter: data.encounter,
    uploads:   data.uploads,
    doctorName,
    facility,
  });
});

// =====================================================================
// AI REPORTS (per-phase + final summary)
// =====================================================================

// POST /api/encounters/:id/report/:phase
//   phase ∈ { history | examination | diagnosis | investigations | treatment }
// Generates a detailed markdown medical report for that phase.
router.post('/:id/report/:phase', async (req, res) => {
  try {
    const validPhases = ['history','examination','diagnosis','investigations','treatment'];
    const phase = (req.params.phase || '').toLowerCase();
    if (!validPhases.includes(phase)) {
      return res.status(400).json({ ok: false, error: 'Invalid phase' });
    }
    const data = await getEncounterFull(req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: 'Not found' });

    let doctorName = '—';
    if (data.encounter.doctor_id) {
      const r = await db.query('SELECT full_name FROM users WHERE id = $1', [data.encounter.doctor_id]);
      doctorName = r.rows[0]?.full_name || '—';
    }

    const report = await ai.generatePhaseReport({
      phase,
      patient: data.patient,
      encounter: data.encounter,
      doctorName,
    });

    res.json({ ok: true, phase, report });
  } catch (e) {
    next(e);
  }
});

// POST /api/encounters/:id/summary
// Generates a full professional discharge-style summary.
router.post('/:id/summary', async (req, res) => {
  try {
    const data = await getEncounterFull(req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: 'Not found' });

    let doctorName = '—';
    if (data.encounter.doctor_id) {
      const r = await db.query('SELECT full_name FROM users WHERE id = $1', [data.encounter.doctor_id]);
      doctorName = r.rows[0]?.full_name || '—';
    }

    const report = await ai.generateFinalSummary({
      patient: data.patient,
      encounter: data.encounter,
      doctorName,
    });

    res.json({ ok: true, report });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
