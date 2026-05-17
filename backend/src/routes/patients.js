/**
 * Patients route — each user only sees their own patients.
 * Admin (server-only access) can see everything.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { logActivity } = require('../services/activityLog');

const router = express.Router();
router.use(authRequired);

function isAdmin(req) { return req.user?.role === 'admin'; }

// GET /api/patients?search=...&category=pending|completed|emergency
router.get('/', async (req, res) => {
  const search   = (req.query.search   || '').trim();
  const category = (req.query.category || '').trim();
  const params = [];
  const where  = [];

  if (!isAdmin(req)) {
    params.push(req.user.sub);
    where.push(`p.created_by = $${params.length}`);
  }

  if (search) {
    params.push('%' + search.toLowerCase() + '%');
    where.push(`(LOWER(p.full_name) LIKE $${params.length} OR LOWER(p.patient_id) LIKE $${params.length} OR LOWER(p.phone) LIKE $${params.length})`);
  }

  if (category && ['pending','completed','emergency'].includes(category)) {
    params.push(category);
    where.push(`EXISTS (SELECT 1 FROM encounters e WHERE e.patient_id = p.id AND e.case_category = $${params.length})`);
  }

  const sql = `
    SELECT p.id, p.patient_id, p.full_name, p.sex, p.date_of_birth,
           p.phone, p.created_at, p.last_activity_at,
           (SELECT MAX(case_category) FROM encounters e WHERE e.patient_id = p.id AND e.status != 'closed') AS active_category
    FROM patients p
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.last_activity_at DESC, p.created_at DESC
    LIMIT 200
  `;
  const { rows } = await db.query(sql, params);
  res.json({ ok: true, patients: rows });
});

// GET /api/patients/stats/summary  → dashboard cards
// IMPORTANT: must be defined before /:id to avoid Express matching "stats" as an id param
router.get('/stats/summary', async (req, res) => {
  const userScope = isAdmin(req) ? '' : ' WHERE created_by = $1';
  const params = isAdmin(req) ? [] : [req.user.sub];

  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM patients${userScope}`, params)).rows[0].n;
  const today = (await db.query(
    `SELECT COUNT(*)::int AS n FROM patients
     WHERE created_at::date = CURRENT_DATE ${isAdmin(req) ? '' : 'AND created_by = $1'}`, params
  )).rows[0].n;

  // For encounters, scope by doctor_id
  const encParams = isAdmin(req) ? [] : [req.user.sub];
  const encScope  = isAdmin(req) ? '' : ' AND doctor_id = $1';

  const encOpen = (await db.query(
    `SELECT COUNT(*)::int AS n FROM encounters WHERE status NOT IN ('closed')${encScope}`,
    encParams
  )).rows[0].n;

  const pending = (await db.query(
    `SELECT COUNT(*)::int AS n FROM encounters WHERE case_category='pending' AND status NOT IN ('closed')${encScope}`,
    encParams
  )).rows[0].n;
  const completed = (await db.query(
    `SELECT COUNT(*)::int AS n FROM encounters WHERE case_category='completed'${encScope}`,
    encParams
  )).rows[0].n;
  const emergency = (await db.query(
    `SELECT COUNT(*)::int AS n FROM encounters WHERE case_category='emergency' AND status NOT IN ('closed')${encScope}`,
    encParams
  )).rows[0].n;

  // Critical alerts from warnings JSON
  const warningsRaw = await db.query(
    `SELECT warnings FROM encounters
     WHERE warnings IS NOT NULL AND status NOT IN ('closed')${encScope}`,
    encParams
  );
  const criticalCount = warningsRaw.rows.reduce((acc, r) => {
    const arr = Array.isArray(r.warnings) ? r.warnings : [];
    return acc + arr.filter(w => w.level === 'critical').length;
  }, 0);

  res.json({
    ok: true,
    totalPatients: total, todayPatients: today,
    openEncounters: encOpen, criticalWarnings: criticalCount,
    cases: { pending, completed, emergency },
  });
});

// GET /api/patients/:id
router.get('/:id', async (req, res) => {
  const params = [req.params.id];
  let scope = '';
  if (!isAdmin(req)) {
    params.push(req.user.sub);
    scope = ' AND created_by = $2';
  }
  const { rows } = await db.query(`SELECT * FROM patients WHERE id = $1${scope}`, params);
  if (!rows[0]) return res.status(404).json({ ok: false, error: 'Patient not found' });

  const enc = await db.query(
    `SELECT id, status, case_category, chief_complaint, history_type, created_at, updated_at, closed_at
       FROM encounters WHERE patient_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  const activity = await db.query(
    `SELECT pa.id, pa.action, pa.detail, pa.created_at,
            u.full_name AS user_name
       FROM patient_activity pa
  LEFT JOIN users u ON u.id = pa.user_id
      WHERE pa.patient_id = $1
      ORDER BY pa.created_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ ok: true, patient: rows[0], encounters: enc.rows, activity: activity.rows });
});

// POST /api/patients
router.post('/', async (req, res) => {
  const p = req.body || {};
  if (!p.full_name) return res.status(400).json({ ok: false, error: 'full_name required' });

  const { rows: idRow } = await db.query('SELECT generate_patient_id() AS pid');
  const patient_id = idRow[0].pid;

  const { rows } = await db.query(`
    INSERT INTO patients
      (patient_id, full_name, date_of_birth, sex, phone, email, national_id,
       address, blood_group, allergies, chronic_conditions,
       next_of_kin, next_of_kin_phone, sha_member_no, nhif_no, scheme_type,
       insurance_provider, insurance_policy_no, insurance_member_name,
       created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *
  `, [
    patient_id,
    p.full_name, p.date_of_birth || null, p.sex || null,
    p.phone || null, p.email || null, p.national_id || null,
    p.address || null, p.blood_group || null,
    p.allergies || null, p.chronic_conditions || null,
    p.next_of_kin || null, p.next_of_kin_phone || null,
    p.sha_member_no || null, p.nhif_no || null, p.scheme_type || 'SHA',
    p.insurance_provider || null, p.insurance_policy_no || null, p.insurance_member_name || null,
    req.user.sub,
  ]);
  const patient = rows[0];

  await logActivity({
    patient_id: patient.id, user_id: req.user.sub,
    action: 'patient.created', detail: `Patient registered as ${patient.patient_id}`,
  });
  res.json({ ok: true, patient });
});

// PATCH /api/patients/:id
router.patch('/:id', async (req, res) => {
  // Verify ownership unless admin
  if (!isAdmin(req)) {
    const own = await db.query('SELECT 1 FROM patients WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.sub]);
    if (!own.rows[0]) return res.status(403).json({ ok: false, error: 'Not your patient' });
  }

  const allowed = ['full_name','date_of_birth','sex','phone','email','national_id',
                   'address','blood_group','allergies','chronic_conditions',
                   'next_of_kin','next_of_kin_phone',
                   'sha_member_no','nhif_no','scheme_type',
                   'insurance_provider','insurance_policy_no','insurance_member_name'];
  const fields = [], values = []; let i = 1;
  for (const k of allowed) {
    if (k in req.body) { fields.push(`${k} = $${i++}`); values.push(req.body[k]); }
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE patients SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  await logActivity({
    patient_id: req.params.id, user_id: req.user.sub,
    action: 'patient.updated', detail: 'Patient details updated',
  });
  res.json({ ok: true, patient: rows[0] });
});

module.exports = router;
