const express = require('express');
const db      = require('../db');
const claims  = require('../services/claimsService');
const ai      = require('../services/aiService');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

/* ──────────────────────────────────────────────────────────
 * GET/PATCH /api/claims/facility-config  (admin only)
 * MUST be defined BEFORE /:id routes to avoid conflict
 * ────────────────────────────────────────────────────────── */
router.get('/facility-config', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM facility_config LIMIT 1');
    res.json({ ok: true, config: rows[0] || null });
  } catch (e) { next(e); }
});

router.patch('/facility-config', requireRole('admin'), async (req, res, next) => {
  try {
    const fields = [
      'facility_name','sha_facility_code','nhif_facility_code','county',
      'sub_county','facility_level','bank_name','bank_branch','bank_account',
      'contact_phone','contact_email',
    ];
    const { rows: existing } = await db.query('SELECT id FROM facility_config LIMIT 1');

    if (existing[0]) {
      const sets = fields.map((f, idx) => `${f} = COALESCE($${idx + 1}, ${f})`).join(', ');
      const vals = fields.map(f => req.body[f] ?? null);
      const { rows } = await db.query(
        `UPDATE facility_config SET ${sets}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
        [...vals, existing[0].id]
      );
      return res.json({ ok: true, config: rows[0] });
    } else {
      const cols = fields.filter(f => req.body[f] != null);
      const vals = cols.map(f => req.body[f]);
      const { rows } = await db.query(
        `INSERT INTO facility_config (${cols.join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,
        vals
      );
      return res.json({ ok: true, config: rows[0] });
    }
  } catch (e) { next(e); }
});

/* ──────────────────────────────────────────────────────────
 * POST /api/claims/build/:encounterId
 * Auto-generates a draft claim from encounter data.
 * ────────────────────────────────────────────────────────── */
router.post('/build/:encounterId', async (req, res, next) => {
  try {
    const encId = parseInt(req.params.encounterId);

    // Build pre-filled claim
    const claimData = await claims.buildClaim(encId, ai);
    claimData.created_by = req.user.sub;

    // Upsert into DB (idempotent — safe to call multiple times)
    const saved = await claims.upsertClaim(claimData);

    res.json({
      ok: true,
      claim: { ...saved, _meta: claimData._meta },
    });
  } catch (e) { next(e); }
});

/* ──────────────────────────────────────────────────────────
 * GET /api/claims  (admin only — full claims list)
 * Query params: status, from, to, page, limit
 * ────────────────────────────────────────────────────────── */
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { status, from, to, page = 1, limit = 50 } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;

    if (status) { conditions.push(`c.status = $${i++}`); params.push(status); }
    if (from)   { conditions.push(`c.created_at >= $${i++}`); params.push(from); }
    if (to)     { conditions.push(`c.created_at <= $${i++}`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await db.query(
      `SELECT c.id, c.status, c.scheme_type, c.benefit_package,
              c.grand_total, c.sha_payable, c.patient_copay,
              c.primary_icd10, c.submission_ref, c.created_at,
              p.full_name AS patient_name, p.patient_id AS patient_code
         FROM claims c
         JOIN patients p ON p.id = c.patient_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit), offset]
    );

    const stats = await claims.getClaimStats();
    res.json({ ok: true, claims: rows, stats });
  } catch (e) { next(e); }
});

/* ──────────────────────────────────────────────────────────
 * GET /api/claims/encounter/:encounterId
 * Fetch existing claim for an encounter (or 404).
 * ────────────────────────────────────────────────────────── */
router.get('/encounter/:encounterId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, p.full_name AS patient_name, p.date_of_birth,
              p.sex, p.sha_member_no, p.nhif_no,
              u.full_name AS doctor_name,
              e.chief_complaint, e.created_at AS encounter_date,
              e.history_type,
              fc.facility_name, fc.sha_facility_code, fc.facility_level
         FROM claims c
         JOIN patients p  ON p.id = c.patient_id
         JOIN encounters e ON e.id = c.encounter_id
    LEFT JOIN users u     ON u.id = e.doctor_id
    LEFT JOIN facility_config fc ON TRUE
        WHERE c.encounter_id = $1
        LIMIT 1`,
      [req.params.encounterId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No claim yet' });
    res.json({ ok: true, claim: rows[0] });
  } catch (e) { next(e); }
});

/* ──────────────────────────────────────────────────────────
 * PATCH /api/claims/:id
 * Doctor edits line items / amounts before submission.
 * ────────────────────────────────────────────────────────── */
router.patch('/:id', async (req, res, next) => {
  try {
    const {
      sha_member_no, nhif_no, scheme_type, benefit_package, preauth_code,
      insurance_provider, insurance_policy_no, insurance_member_name,
      primary_icd10, secondary_icd10,
      consultation_fee, drugs_total, labs_total, imaging_total,
      procedures_total, bed_charges, other_charges,
      sha_payable, patient_copay,
      line_items, notes, status,
    } = req.body;

    const { rows } = await db.query(
      `UPDATE claims SET
         sha_member_no        = COALESCE($1,  sha_member_no),
         nhif_no              = COALESCE($2,  nhif_no),
         scheme_type          = COALESCE($3,  scheme_type),
         benefit_package      = COALESCE($4,  benefit_package),
         preauth_code         = COALESCE($5,  preauth_code),
         insurance_provider   = COALESCE($6,  insurance_provider),
         insurance_policy_no  = COALESCE($7,  insurance_policy_no),
         insurance_member_name= COALESCE($8,  insurance_member_name),
         primary_icd10        = COALESCE($9,  primary_icd10),
         secondary_icd10      = COALESCE($10::jsonb, secondary_icd10),
         consultation_fee     = COALESCE($11, consultation_fee),
         drugs_total          = COALESCE($12, drugs_total),
         labs_total           = COALESCE($13, labs_total),
         imaging_total        = COALESCE($14, imaging_total),
         procedures_total     = COALESCE($15, procedures_total),
         bed_charges          = COALESCE($16, bed_charges),
         other_charges        = COALESCE($17, other_charges),
         sha_payable          = COALESCE($18, sha_payable),
         patient_copay        = COALESCE($19, patient_copay),
         line_items           = COALESCE($20::jsonb, line_items),
         notes                = COALESCE($21, notes),
         status               = COALESCE($22, status)
       WHERE id = $23
       RETURNING *`,
      [
        sha_member_no, nhif_no, scheme_type, benefit_package, preauth_code,
        insurance_provider, insurance_policy_no, insurance_member_name,
        primary_icd10,
        secondary_icd10 ? JSON.stringify(secondary_icd10) : null,
        consultation_fee, drugs_total, labs_total, imaging_total,
        procedures_total, bed_charges, other_charges,
        sha_payable, patient_copay,
        line_items ? JSON.stringify(line_items) : null,
        notes, status,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Claim not found' });
    res.json({ ok: true, claim: rows[0] });
  } catch (e) { next(e); }
});

/* ──────────────────────────────────────────────────────────
 * POST /api/claims/:id/submit
 * Records the SHA portal reference number after manual upload.
 * ────────────────────────────────────────────────────────── */
router.post('/:id/submit', async (req, res, next) => {
  try {
    const { submission_ref } = req.body;
    if (!submission_ref) return res.status(400).json({ ok: false, error: 'submission_ref required' });
    const updated = await claims.markSubmitted(req.params.id, submission_ref);
    res.json({ ok: true, claim: updated });
  } catch (e) { next(e); }
});

module.exports = router;
