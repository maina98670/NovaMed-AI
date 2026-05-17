/**
 * NovaMed AI — Admin routes
 * =========================
 * 1. User management (list / enable / disable / reset password)
 * 2. Medical knowledge CRUD:
 *      diseases, disease_keywords, disease_investigations,
 *      disease_treatments, symptoms, history_questions, symptom_synonyms
 * 3. SQL bulk upload — execute raw SQL files against the DB
 * 4. Extended stats (users + all medical knowledge counts)
 * 5. Audit log
 *
 * KEY INTEGRATION: every write calls DB.invalidateCache() so the
 * live clinical engine (aiService → medicalDB) picks up changes
 * within 30 s without a server restart.
 */
const express = require('express');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const DB      = require('../services/medicalDB');
const { authRequired, requireRole } = require('../middleware/auth');
const logger  = require('../services/logger');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin'));

/* SQL uploads in memory, max 10 MB */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/* ── audit helper ── */
async function _audit(req, action, entity, entityId, detail = {}) {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id,action,entity,entity_id,detail) VALUES ($1,$2,$3,$4,$5)`,
      [req.user?.sub, action, entity, entityId || null, JSON.stringify(detail)]
    );
  } catch { /* non-blocking */ }
}

/* ── safety guard for raw SQL uploads ──
 * Rejects DROP / TRUNCATE on tables we never want to lose,
 * and forbids access to system schemas / users table writes.
 */
function _isUnsafeSQL(sql) {
  const s = sql.toLowerCase();
  const forbidden = [
    /\bdrop\s+table\b/,
    /\btruncate\s+(table\s+)?(users|patients|encounters|history_turns|audit_log)/,
    /\bdrop\s+database\b/,
    /\bdrop\s+schema\b/,
    /\bdelete\s+from\s+users\b/,
    /\bupdate\s+users\s+set\s+password_hash/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\balter\s+role\b/,
    /\bcopy\s+.*\bfrom\s+program\b/,
    /\bpg_read_server_files\b/,
    /\bpg_write_server_files\b/,
  ];
  return forbidden.some(re => re.test(s));
}

/* ════════════════════════════════════════════════════════════
   STATS — includes all medical knowledge counts
════════════════════════════════════════════════════════════ */
router.get('/stats', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role != 'admin')                   AS users,
      (SELECT COUNT(*) FROM users WHERE role != 'admin' AND is_active)     AS users_active,
      (SELECT COUNT(*) FROM users WHERE role != 'admin' AND NOT is_active) AS users_disabled,
      (SELECT COUNT(*) FROM patients)                                       AS patients,
      (SELECT COUNT(*) FROM encounters)                                     AS encounters,
      (SELECT COUNT(*) FROM diseases)                                       AS diseases,
      (SELECT COUNT(*) FROM symptoms)                                       AS symptoms,
      (SELECT COUNT(*) FROM history_questions)                              AS questions,
      (SELECT COUNT(*) FROM disease_keywords)                               AS keywords,
      (SELECT COUNT(*) FROM disease_investigations)                         AS investigations,
      (SELECT COUNT(*) FROM disease_treatments)                             AS treatments,
      (SELECT COUNT(*) FROM symptom_synonyms)                              AS synonyms
  `);
  res.json({ ok: true, stats: rows[0] });
});

/* ════════════════════════════════════════════════════════════
   USERS
════════════════════════════════════════════════════════════ */
router.get('/users', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT id, full_name, email, role, specialty, is_verified, is_active,
           last_login_at, created_at,
           (SELECT COUNT(*) FROM patients p WHERE p.created_by = u.id)::int  AS patients_count,
           (SELECT COUNT(*) FROM encounters e WHERE e.doctor_id = u.id)::int AS encounters_count
      FROM users u WHERE role != 'admin' ORDER BY created_at DESC
  `);
  res.json({ ok: true, users: rows });
});

router.post('/users/:id/enable', async (req, res) => {
  await db.query(`UPDATE users SET is_active=TRUE  WHERE id=$1 AND role!='admin'`, [req.params.id]);
  await _audit(req, 'admin.user.enabled',  'user', req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/disable', async (req, res) => {
  await db.query(`UPDATE users SET is_active=FALSE WHERE id=$1 AND role!='admin'`, [req.params.id]);
  await _audit(req, 'admin.user.disabled', 'user', req.params.id);
  res.json({ ok: true });
});

/**
 * Admin-triggered password reset.
 * Generates a temporary password and returns it in the response so the admin
 * can communicate it to the user. The user should change it on next login.
 * Body (optional): { password: "custom value" }
 */
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { rows: users } = await db.query(
      `SELECT id, full_name, email, role FROM users WHERE id=$1`, [req.params.id]
    );
    if (!users.length) return res.status(404).json({ ok: false, error: 'User not found' });
    const user = users[0];
    if (user.role === 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin passwords cannot be reset via this endpoint.' });
    }

    // Custom password from body, or auto-generated 10-char alphanumeric
    let newPassword = (req.body?.password || '').trim();
    if (!newPassword) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      newPassword = '';
      for (let i = 0; i < 10; i++) {
        newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(
      `UPDATE users SET password_hash=$1 WHERE id=$2 AND role!='admin'`,
      [hash, user.id]
    );
    await _audit(req, 'admin.user.password_reset', 'user', user.id, { email: user.email });
    res.json({
      ok: true,
      message: `Password reset for ${user.full_name}. Share the new password securely.`,
      temporary_password: newPassword,
      user: { id: user.id, full_name: user.full_name, email: user.email },
    });
  } catch (e) {
    next(e);
  }
});

/* ════════════════════════════════════════════════════════════
   AUDIT LOG
════════════════════════════════════════════════════════════ */
router.get('/audit', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT a.id,a.action,a.entity,a.entity_id,a.detail,a.created_at,
           u.full_name AS user_name, u.email AS user_email
      FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
     ORDER BY a.created_at DESC LIMIT 200
  `);
  res.json({ ok: true, log: rows });
});

/* ════════════════════════════════════════════════════════════
   DISEASES
════════════════════════════════════════════════════════════ */
router.get('/mk/diseases', async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM diseases ORDER BY name ASC`);
  res.json({ ok: true, diseases: rows });
});

router.post('/mk/diseases', async (req, res) => {
  const { name, icd10, category, age_group, sex, description, reasoning, red_flags } = req.body;
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name is required' });
  const { rows } = await db.query(
    `INSERT INTO diseases (name,icd10,category,age_group,sex,description,reasoning,red_flags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name.trim(), icd10||null, category||null, age_group||'any', sex||'any',
     description||null, reasoning||null, red_flags||[]]
  );
  DB.invalidateCache();
  await _audit(req, 'admin.mk.disease.created', 'disease', rows[0].id, { name });
  res.json({ ok: true, disease: rows[0] });
});

router.put('/mk/diseases/:id', async (req, res) => {
  const { name, icd10, category, age_group, sex, description, reasoning, red_flags } = req.body;
  const { rows } = await db.query(
    `UPDATE diseases SET name=$1,icd10=$2,category=$3,age_group=$4,sex=$5,
       description=$6,reasoning=$7,red_flags=$8 WHERE id=$9 RETURNING *`,
    [name, icd10||null, category||null, age_group||'any', sex||'any',
     description||null, reasoning||null, red_flags||[], req.params.id]
  );
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
  DB.invalidateCache();
  await _audit(req, 'admin.mk.disease.updated', 'disease', rows[0].id, { name });
  res.json({ ok: true, disease: rows[0] });
});

router.delete('/mk/diseases/:id', async (req, res) => {
  await db.query(`DELETE FROM diseases WHERE id=$1`, [req.params.id]);
  DB.invalidateCache();
  await _audit(req, 'admin.mk.disease.deleted', 'disease', req.params.id);
  res.json({ ok: true });
});

/* ── Keywords ── */
router.get('/mk/diseases/:id/keywords', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM disease_keywords WHERE disease_id=$1 ORDER BY id`, [req.params.id]);
  res.json({ ok: true, keywords: rows });
});
router.post('/mk/diseases/:id/keywords', async (req, res) => {
  const { keyword, weight, against } = req.body;
  if (!keyword?.trim()) return res.status(400).json({ ok: false, error: 'keyword required' });
  const { rows } = await db.query(
    `INSERT INTO disease_keywords (disease_id,keyword,weight,against) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, keyword.trim(), weight||1.0, against||false]
  );
  DB.invalidateCache();
  res.json({ ok: true, keyword: rows[0] });
});
router.delete('/mk/keywords/:id', async (req, res) => {
  await db.query(`DELETE FROM disease_keywords WHERE id=$1`, [req.params.id]);
  DB.invalidateCache();
  res.json({ ok: true });
});

/* ── Investigations ── */
router.get('/mk/diseases/:id/investigations', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM disease_investigations WHERE disease_id=$1 ORDER BY category,id`, [req.params.id]);
  res.json({ ok: true, investigations: rows });
});
router.post('/mk/diseases/:id/investigations', async (req, res) => {
  const { category, test, reason } = req.body;
  if (!test?.trim()) return res.status(400).json({ ok: false, error: 'test required' });
  const { rows } = await db.query(
    `INSERT INTO disease_investigations (disease_id,category,test,reason) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, category||'lab', test.trim(), reason||null]
  );
  res.json({ ok: true, investigation: rows[0] });
});
router.delete('/mk/investigations/:id', async (req, res) => {
  await db.query(`DELETE FROM disease_investigations WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

/* ── Treatments ── */
router.get('/mk/diseases/:id/treatments', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM disease_treatments WHERE disease_id=$1 ORDER BY type,id`, [req.params.id]);
  res.json({ ok: true, treatments: rows });
});
router.post('/mk/diseases/:id/treatments', async (req, res) => {
  const { type, item, dose, route, frequency, duration, notes } = req.body;
  if (!item?.trim()) return res.status(400).json({ ok: false, error: 'item required' });
  const { rows } = await db.query(
    `INSERT INTO disease_treatments (disease_id,type,item,dose,route,frequency,duration,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, type||'medication', item.trim(),
     dose||null, route||null, frequency||null, duration||null, notes||null]
  );
  res.json({ ok: true, treatment: rows[0] });
});
router.delete('/mk/treatments/:id', async (req, res) => {
  await db.query(`DELETE FROM disease_treatments WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   SYMPTOMS
════════════════════════════════════════════════════════════ */
router.get('/mk/symptoms', async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM symptoms ORDER BY name ASC`);
  res.json({ ok: true, symptoms: rows });
});
router.post('/mk/symptoms', async (req, res) => {
  const { name, body_system, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const { rows } = await db.query(
    `INSERT INTO symptoms (name,body_system,description) VALUES ($1,$2,$3) RETURNING *`,
    [name.trim(), body_system||null, description||null]
  );
  res.json({ ok: true, symptom: rows[0] });
});
router.put('/mk/symptoms/:id', async (req, res) => {
  const { name, body_system, description } = req.body;
  const { rows } = await db.query(
    `UPDATE symptoms SET name=$1,body_system=$2,description=$3 WHERE id=$4 RETURNING *`,
    [name, body_system||null, description||null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, symptom: rows[0] });
});
router.delete('/mk/symptoms/:id', async (req, res) => {
  await db.query(`DELETE FROM symptoms WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   HISTORY QUESTIONS
════════════════════════════════════════════════════════════ */
router.get('/mk/questions', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM history_questions ORDER BY section, importance DESC`);
  res.json({ ok: true, questions: rows });
});
router.post('/mk/questions', async (req, res) => {
  const { section, question, importance, follow_up_for, triggers } = req.body;
  if (!question?.trim()) return res.status(400).json({ ok: false, error: 'question required' });
  const { rows } = await db.query(
    `INSERT INTO history_questions (section,question,importance,follow_up_for,triggers)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [section||'HPC', question.trim(), importance||5, follow_up_for||null, triggers||[]]
  );
  DB.invalidateCache();
  res.json({ ok: true, question: rows[0] });
});
router.put('/mk/questions/:id', async (req, res) => {
  const { section, question, importance, follow_up_for, triggers } = req.body;
  const { rows } = await db.query(
    `UPDATE history_questions SET section=$1,question=$2,importance=$3,
       follow_up_for=$4,triggers=$5 WHERE id=$6 RETURNING *`,
    [section, question, importance||5, follow_up_for||null, triggers||[], req.params.id]
  );
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
  DB.invalidateCache();
  res.json({ ok: true, question: rows[0] });
});
router.delete('/mk/questions/:id', async (req, res) => {
  await db.query(`DELETE FROM history_questions WHERE id=$1`, [req.params.id]);
  DB.invalidateCache();
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════
   SQL UPLOAD — execute a raw .sql file against the database
   - Use this to bulk-add diseases, keywords, treatments, synonyms etc.
   - The whole file runs in a single transaction
   - Forbidden statements (DROP TABLE, TRUNCATE users, etc.) are blocked
════════════════════════════════════════════════════════════ */
router.post('/sql/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

  const filename = req.file.originalname || 'unnamed.sql';
  if (!/\.sql$/i.test(filename)) {
    return res.status(400).json({ ok: false, error: 'File must have a .sql extension' });
  }

  const sql = req.file.buffer.toString('utf-8').trim();
  if (!sql) return res.status(400).json({ ok: false, error: 'SQL file is empty' });
  if (sql.length > 5_000_000) {
    return res.status(400).json({ ok: false, error: 'SQL file too large (max 5 MB of statements)' });
  }
  if (_isUnsafeSQL(sql)) {
    return res.status(403).json({
      ok: false,
      error: 'Forbidden SQL detected. Statements like DROP TABLE, TRUNCATE on core tables, ' +
             'modifications to users/passwords, GRANT/REVOKE, and file-system access are blocked.',
    });
  }

  // Execute inside a transaction — all-or-nothing
  const client = await db.pool.connect();
  let statementCount = 0;
  try {
    await client.query('BEGIN');
    // Postgres lets us send multiple statements in one query call
    const result = await client.query(sql);
    statementCount = Array.isArray(result) ? result.length : 1;
    await client.query('COMMIT');

    DB.invalidateCache();
    await _audit(req, 'admin.sql.uploaded', 'sql', null, {
      filename,
      bytes:      req.file.size,
      statements: statementCount,
    });

    res.json({
      ok: true,
      message:    `SQL file "${filename}" executed successfully.`,
      statements: statementCount,
      bytes:      req.file.size,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[admin.sql.upload] failed:', e.message);
    res.status(400).json({
      ok:        false,
      error:     'SQL execution failed — all changes rolled back.',
      details:   e.message,
      hint:      e.hint || null,
      position:  e.position || null,
    });
  } finally {
    client.release();
  }
});

/**
 * Returns ready-to-edit SQL templates so admins can download, fill in, and re-upload.
 */
router.get('/sql/templates', (_req, res) => {
  const templates = {
    diseases:
`-- Add a new disease with keywords, investigations and treatments
INSERT INTO diseases (name, icd10, category, age_group, sex, reasoning, red_flags)
VALUES (
  'Pulmonary Embolism',
  'I26.9',
  'Respiratory',
  'adult',
  'any',
  'Sudden breathlessness + pleuritic chest pain + risk factors strongly suggest PE.',
  ARRAY['Haemodynamic collapse','SpO2 < 90%','Massive haemoptysis','Syncope']
);

-- Keywords (positive ones increase score; against=TRUE reduces it)
INSERT INTO disease_keywords (disease_id, keyword, weight, against) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'sudden breathlessness', 3.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'pleuritic chest pain',  3.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'haemoptysis',           2.5, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'leg swelling',          2.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'recent surgery',        2.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'productive cough',      1.0, TRUE);

-- Investigations
INSERT INTO disease_investigations (disease_id, category, test, reason) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'lab',     'D-dimer', 'Sensitive screening test'),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'imaging', 'CTPA',    'Definitive diagnosis');

-- Treatments
INSERT INTO disease_treatments (disease_id, type, item, dose, route, frequency, duration, notes) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'medication', 'Enoxaparin', '1 mg/kg', 'SC', 'BD', '5–10 days', 'Adjust in renal impairment'),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'immediate',  'Oxygen to maintain SpO2 ≥ 94%', NULL, NULL, NULL, NULL, NULL);
`,

    synonyms:
`-- Bulk add synonyms (canonical → alternate spelling/abbreviation)
INSERT INTO symptom_synonyms (canonical, synonym) VALUES
  ('shortness of breath', 'sob'),
  ('shortness of breath', 'dyspnoea'),
  ('shortness of breath', 'breathlessness'),
  ('chest pain',          'chest tightness'),
  ('chest pain',          'chest pressure'),
  ('fever',               'pyrexia'),
  ('fever',               'febrile'),
  ('hypertension',        'htn'),
  ('hypertension',        'high blood pressure'),
  ('myocardial infarction','mi'),
  ('myocardial infarction','heart attack'),
  ('diabetes',            'dm'),
  ('diabetes',            't2dm'),
  ('vomiting',            'emesis'),
  ('haemoptysis',         'hemoptysis'),
  ('haemoptysis',         'coughing blood')
ON CONFLICT (canonical, synonym) DO NOTHING;
`,

    questions:
`-- Add new history questions to the adaptive bank
INSERT INTO history_questions (section, question, importance, follow_up_for, triggers) VALUES
  ('HPC', 'Does the pain radiate to the jaw, left arm, or shoulder?', 9, 'chest pain', ARRAY['chest pain','chest tightness','crushing']),
  ('HPC', 'Has the patient had any recent long-haul travel, immobility, or surgery?', 8, 'breathlessness', ARRAY['breathlessness','shortness of breath','pleuritic']),
  ('HPC', 'Is there photophobia or neck stiffness?', 9, 'headache', ARRAY['headache','fever','stiff neck']);
`,

    symptoms:
`-- Add new symptoms to the symptom bank
INSERT INTO symptoms (name, body_system, description) VALUES
  ('Pleuritic chest pain', 'Respiratory',     'Sharp chest pain worse on inspiration'),
  ('Orthopnoea',           'Cardiovascular',  'Breathlessness when lying flat')
ON CONFLICT (name) DO NOTHING;
`,
  };
  res.json({ ok: true, templates });
});

/* ════════════════════════════════════════════════════════════
   SYMPTOM SYNONYMS
   Canonical terms ↔ alternate spellings / abbreviations.
   The DB scoring engine expands case text using this table
   so keywords fire regardless of how the doctor wrote them.
════════════════════════════════════════════════════════════ */
router.get('/mk/synonyms', async (_req, res) => {
  try {
    const synonyms = await DB.listSynonyms();
    res.json({ ok: true, synonyms });
  } catch (e) { next(e); }
});

router.post('/mk/synonyms', async (req, res) => {
  const { canonical, synonym } = req.body;
  if (!canonical?.trim()) return res.status(400).json({ ok: false, error: 'canonical is required' });
  if (!synonym?.trim())   return res.status(400).json({ ok: false, error: 'synonym is required' });
  try {
    const row = await DB.addSynonym(canonical.trim(), synonym.trim());
    if (!row) return res.status(409).json({ ok: false, error: 'Synonym already exists' });
    await _audit(req, 'admin.mk.synonym.created', 'symptom_synonyms', row.id, { canonical, synonym });
    res.json({ ok: true, synonym: row });
  } catch (e) { next(e); }
});

router.put('/mk/synonyms/:id', async (req, res) => {
  const { canonical, synonym } = req.body;
  if (!canonical?.trim()) return res.status(400).json({ ok: false, error: 'canonical is required' });
  if (!synonym?.trim())   return res.status(400).json({ ok: false, error: 'synonym is required' });
  try {
    const row = await DB.updateSynonym(req.params.id, canonical.trim(), synonym.trim());
    if (!row) return res.status(404).json({ ok: false, error: 'Synonym not found' });
    await _audit(req, 'admin.mk.synonym.updated', 'symptom_synonyms', req.params.id, { canonical, synonym });
    res.json({ ok: true, synonym: row });
  } catch (e) { next(e); }
});

router.delete('/mk/synonyms/:id', async (req, res) => {
  try {
    await DB.deleteSynonym(req.params.id);
    await _audit(req, 'admin.mk.synonym.deleted', 'symptom_synonyms', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ════════════════════════════════════════════════════════════
   FACILITY CONFIG  — GET / PUT
════════════════════════════════════════════════════════════ */

router.get('/facility', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM facility_config LIMIT 1');
    res.json({ ok: true, facility: rows[0] || {} });
  } catch (e) { next(e); }
});

router.put('/facility', async (req, res) => {
  const {
    facility_name, sha_number, sha_facility_code,
    facility_level, address, phone, email, county, sub_county,
  } = req.body;

  if (!facility_name?.trim()) return res.status(400).json({ ok: false, error: 'facility_name is required' });

  try {
    // UPSERT: update the existing row, or insert one if the table is empty
    const { rows } = await db.query(
      `INSERT INTO facility_config
         (facility_name, sha_number, sha_facility_code, facility_level,
          address, phone, email, county, sub_county, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
       ON CONFLICT (id) DO UPDATE
          SET facility_name     = EXCLUDED.facility_name,
              sha_number        = EXCLUDED.sha_number,
              sha_facility_code = EXCLUDED.sha_facility_code,
              facility_level    = EXCLUDED.facility_level,
              address           = EXCLUDED.address,
              phone             = EXCLUDED.phone,
              email             = EXCLUDED.email,
              county            = EXCLUDED.county,
              sub_county        = EXCLUDED.sub_county,
              updated_at        = NOW()
       RETURNING *`,
      [
        facility_name.trim(),
        sha_number?.trim()        || null,
        sha_facility_code?.trim() || null,
        facility_level            || '4',
        address?.trim()           || null,
        phone?.trim()             || null,
        email?.trim()             || null,
        county?.trim()            || null,
        sub_county?.trim()        || null,
      ]
    );

    // Fallback if UPSERT returned nothing (no id conflict row yet)
    let saved = rows[0];
    if (!saved) {
      const upd = await db.query(
        `UPDATE facility_config
            SET facility_name=$1, sha_number=$2, sha_facility_code=$3, facility_level=$4,
                address=$5, phone=$6, email=$7, county=$8, sub_county=$9, updated_at=NOW()
          WHERE id=(SELECT id FROM facility_config ORDER BY id LIMIT 1)
          RETURNING *`,
        [
          facility_name.trim(), sha_number?.trim()||null, sha_facility_code?.trim()||null,
          facility_level||'4', address?.trim()||null, phone?.trim()||null,
          email?.trim()||null, county?.trim()||null, sub_county?.trim()||null,
        ]
      );
      saved = upd.rows[0];
    }

    await _audit(req, 'admin.facility.updated', 'facility_config', saved?.id, req.body);
    res.json({ ok: true, facility: saved });
  } catch (e) { next(e); }
});

/* ════════════════════════════════════════════════════════════
   SHA TARIFF SCHEDULE  — read uploaded benefit_packages, tariff_items,
   and surgical_procedures (populated by the sha_tariffs.sql upload)
════════════════════════════════════════════════════════════ */

router.get('/sha-schedule/packages', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT bp.id, bp.fund, bp.package,
              COUNT(ti.id)::int AS item_count
         FROM benefit_packages bp
         LEFT JOIN tariff_items ti ON ti.package_id = bp.id
        GROUP BY bp.id, bp.fund, bp.package
        ORDER BY bp.id`
    );
    res.json({ ok: true, packages: rows });
  } catch (e) {
    // Table may not exist yet — graceful empty response
    res.json({ ok: true, packages: [], note: 'Upload sha_tariffs.sql to populate.' });
  }
});

router.get('/sha-schedule/items', async (req, res) => {
  const { package_id, search, limit = 50, offset = 0 } = req.query;
  try {
    let q = `SELECT ti.*, bp.fund, bp.package AS package_name
               FROM tariff_items ti
               JOIN benefit_packages bp ON bp.id = ti.package_id
              WHERE 1=1`;
    const params = [];
    if (package_id) { params.push(package_id); q += ` AND ti.package_id = $${params.length}`; }
    if (search)     { params.push(`%${search}%`); q += ` AND ti.service_name ILIKE $${params.length}`; }
    params.push(Number(limit));  q += ` ORDER BY ti.id LIMIT $${params.length}`;
    params.push(Number(offset)); q += ` OFFSET $${params.length}`;
    const { rows } = await db.query(q, params);
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.json({ ok: true, items: [], note: 'Upload sha_tariffs.sql to populate.' });
  }
});

router.get('/sha-schedule/surgical', async (req, res) => {
  const { search, specialty, limit = 100, offset = 0 } = req.query;
  try {
    let q = `SELECT * FROM surgical_procedures WHERE 1=1`;
    const params = [];
    if (specialty) { params.push(specialty); q += ` AND specialty = $${params.length}`; }
    if (search)    { params.push(`%${search}%`); q += ` AND procedure_name ILIKE $${params.length}`; }
    params.push(Number(limit));  q += ` ORDER BY specialty, procedure_name LIMIT $${params.length}`;
    params.push(Number(offset)); q += ` OFFSET $${params.length}`;
    const { rows } = await db.query(q, params);
    // Also return distinct specialties for filter
    const { rows: specs } = await db.query(`SELECT DISTINCT specialty FROM surgical_procedures ORDER BY specialty`).catch(() => ({ rows: [] }));
    res.json({ ok: true, procedures: rows, specialties: specs.map(r => r.specialty) });
  } catch (e) {
    res.json({ ok: true, procedures: [], specialties: [], note: 'Upload sha_tariffs.sql to populate.' });
  }
});

/* ════════════════════════════════════════════════════════════
   SHA TARIFF OVERRIDES  — CRUD
════════════════════════════════════════════════════════════ */

// List all tariff overrides
router.get('/tariffs', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM sha_tariff_overrides ORDER BY category, keyword`
    );
    res.json({ ok: true, tariffs: rows });
  } catch (e) { next(e); }
});

// Create a new tariff override
router.post('/tariffs', async (req, res) => {
  const { keyword, sha_code, description, amount_kes, category } = req.body;
  if (!keyword?.trim())  return res.status(400).json({ ok: false, error: 'keyword is required' });
  if (!sha_code?.trim()) return res.status(400).json({ ok: false, error: 'sha_code is required' });
  if (!amount_kes || isNaN(Number(amount_kes))) return res.status(400).json({ ok: false, error: 'valid amount_kes is required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO sha_tariff_overrides (keyword, sha_code, description, amount_kes, category, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`,
      [
        keyword.trim().toLowerCase(),
        sha_code.trim().toUpperCase(),
        description?.trim() || null,
        Number(amount_kes),
        category || 'lab',
        req.user?.sub,
      ]
    );
    await _audit(req, 'admin.tariff.created', 'sha_tariff_overrides', rows[0].id, { keyword, sha_code, amount_kes });
    res.json({ ok: true, tariff: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Keyword already exists — update it instead.' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update a tariff override
router.put('/tariffs/:id', async (req, res) => {
  const { sha_code, description, amount_kes, category, is_active } = req.body;
  if (!sha_code?.trim()) return res.status(400).json({ ok: false, error: 'sha_code is required' });
  if (!amount_kes || isNaN(Number(amount_kes))) return res.status(400).json({ ok: false, error: 'valid amount_kes is required' });

  try {
    const { rows } = await db.query(
      `UPDATE sha_tariff_overrides
          SET sha_code    = $1,
              description = $2,
              amount_kes  = $3,
              category    = $4,
              is_active   = $5,
              updated_by  = $6,
              updated_at  = NOW()
        WHERE id = $7 RETURNING *`,
      [
        sha_code.trim().toUpperCase(),
        description?.trim() || null,
        Number(amount_kes),
        category || 'lab',
        is_active !== false,
        req.user?.sub,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Tariff not found' });
    await _audit(req, 'admin.tariff.updated', 'sha_tariff_overrides', req.params.id, req.body);
    res.json({ ok: true, tariff: rows[0] });
  } catch (e) { next(e); }
});

// Delete a tariff override
router.delete('/tariffs/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM sha_tariff_overrides WHERE id=$1', [req.params.id]);
    await _audit(req, 'admin.tariff.deleted', 'sha_tariff_overrides', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;

/* ════════════════════════════════════════════════════════════
   EPIDEMIOLOGY DASHBOARD
   - Disease incidence & prevalence across all users/encounters
   - Most common diagnoses, trends, alerts
════════════════════════════════════════════════════════════ */

/**
 * GET /api/admin/epidemiology/overview
 * Returns aggregate counts for epidemiology summary cards.
 */
router.get('/epidemiology/overview', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM encounters WHERE diagnoses IS NOT NULL AND diagnoses != 'null'::jsonb) AS encounters_with_dx,
        (SELECT COUNT(*) FROM encounters WHERE created_at >= NOW() - INTERVAL '30 days') AS encounters_30d,
        (SELECT COUNT(*) FROM encounters WHERE created_at >= NOW() - INTERVAL '7 days')  AS encounters_7d,
        (SELECT COUNT(*) FROM patients) AS total_patients,
        (SELECT COUNT(DISTINCT patient_id) FROM encounters
          WHERE created_at >= NOW() - INTERVAL '30 days') AS active_patients_30d,
        (SELECT COUNT(*) FROM encounters WHERE case_category = 'emergency') AS emergency_total,
        (SELECT COUNT(*) FROM encounters WHERE case_category = 'emergency'
          AND created_at >= NOW() - INTERVAL '30 days') AS emergency_30d
    `);
    res.json({ ok: true, overview: rows[0] });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/epidemiology/top-diagnoses?days=30&limit=20
 * Returns ALL diagnoses (even count=1) extracted from ALL users' encounters.
 * Includes rank, month of peak occurrence, age group breakdown, and warnings.
 */
router.get('/epidemiology/top-diagnoses', async (req, res) => {
  try {
    const days  = parseInt(req.query.days  || '30', 10);
    const limit = parseInt(req.query.limit || '200', 10); // default high — show all

    const { rows } = await db.query(`
      WITH dx_flat AS (
        SELECT
          e.id                    AS encounter_id,
          e.patient_id,
          e.doctor_id,
          e.created_at,
          e.case_category,
          p.sex                   AS patient_sex,
          EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS patient_age,
          TO_CHAR(e.created_at, 'Mon YYYY') AS encounter_month,
          EXTRACT(MONTH FROM e.created_at)  AS month_num,
          dx->>'name'             AS diagnosis_name,
          COALESCE(dx->>'icd10', d.icd10)   AS icd10,
          (dx->>'confidence')::numeric       AS confidence
        FROM encounters e
        JOIN patients p ON p.id = e.patient_id
        LEFT JOIN diseases d ON LOWER(d.name) = LOWER(dx->>'name')
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(e.diagnoses) = 'array' THEN e.diagnoses
            WHEN jsonb_typeof(e.diagnoses) = 'object'
              THEN COALESCE(
                CASE WHEN jsonb_typeof(e.diagnoses->'differentials') = 'array' THEN e.diagnoses->'differentials' END,
                CASE WHEN jsonb_typeof(e.diagnoses->'differentials_full') = 'array' THEN e.diagnoses->'differentials_full' END,
                '[]'::jsonb
              )
            ELSE '[]'::jsonb
          END
        ) AS dx
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND dx->>'name' IS NOT NULL
          AND TRIM(dx->>'name') != ''
          AND LOWER(TRIM(dx->>'name')) NOT IN (
            'insufficient data for diagnosis',
            'no diagnosis matched — further evaluation needed',
            'no diagnosis matched - further evaluation needed'
          )
      ),
      -- provisional diagnosis (single object with a name field)
      provisional_flat AS (
        SELECT
          e.id AS encounter_id, e.patient_id, e.doctor_id, e.created_at, e.case_category,
          p.sex AS patient_sex,
          EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS patient_age,
          TO_CHAR(e.created_at, 'Mon YYYY') AS encounter_month,
          EXTRACT(MONTH FROM e.created_at) AS month_num,
          e.diagnoses->'provisional'->>'name' AS diagnosis_name,
          d.icd10,
          (e.diagnoses->'provisional'->>'confidence')::numeric AS confidence
        FROM encounters e
        JOIN patients p ON p.id = e.patient_id
        LEFT JOIN diseases d ON LOWER(d.name) = LOWER(e.diagnoses->'provisional'->>'name')
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND jsonb_typeof(e.diagnoses) = 'object'
          AND e.diagnoses->'provisional'->>'name' IS NOT NULL
          AND TRIM(e.diagnoses->'provisional'->>'name') != ''
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND LOWER(TRIM(e.diagnoses->'provisional'->>'name')) NOT IN (
            'insufficient data for diagnosis',
            'no diagnosis matched — further evaluation needed',
            'no diagnosis matched - further evaluation needed'
          )
      ),
      -- chosen diagnoses from the diagnoses->chosen array (strings, not objects)
      chosen_flat AS (
        SELECT
          e.id AS encounter_id, e.patient_id, e.doctor_id, e.created_at, e.case_category,
          p.sex AS patient_sex,
          EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS patient_age,
          TO_CHAR(e.created_at, 'Mon YYYY') AS encounter_month,
          EXTRACT(MONTH FROM e.created_at) AS month_num,
          ch_name AS diagnosis_name,
          d.icd10,
          NULL::numeric AS confidence
        FROM encounters e
        JOIN patients p ON p.id = e.patient_id
        LEFT JOIN diseases d ON LOWER(d.name) = LOWER(ch_name)
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(e.diagnoses->'chosen') = 'array' THEN e.diagnoses->'chosen'
            ELSE '[]'::jsonb
          END
        ) AS ch_name
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND ch_name IS NOT NULL AND TRIM(ch_name) != ''
          AND LOWER(TRIM(ch_name)) NOT IN (
            'insufficient data for diagnosis',
            'no diagnosis matched — further evaluation needed'
          )
      ),
      combined AS (
        SELECT * FROM dx_flat
        UNION ALL
        SELECT * FROM provisional_flat
        UNION ALL
        SELECT * FROM chosen_flat
      ),
      deduped AS (
        SELECT DISTINCT ON (encounter_id, LOWER(TRIM(diagnosis_name)))
          *
        FROM combined
        ORDER BY encounter_id, LOWER(TRIM(diagnosis_name)), confidence DESC NULLS LAST
      ),
      ranked AS (
        SELECT
          diagnosis_name,
          MAX(icd10) AS icd10,
          COUNT(*)                                           AS case_count,
          COUNT(DISTINCT patient_id)                        AS patient_count,
          ROUND(AVG(confidence)::numeric, 2)                AS avg_confidence,
          COUNT(*) FILTER (WHERE patient_sex = 'male')      AS male_count,
          COUNT(*) FILTER (WHERE patient_sex = 'female')    AS female_count,
          COUNT(*) FILTER (WHERE case_category = 'emergency') AS emergency_count,
          ROUND(AVG(patient_age)::numeric, 1)               AS avg_age,
          MIN(patient_age)                                   AS min_age,
          MAX(patient_age)                                   AS max_age,
          -- Age group breakdown
          COUNT(*) FILTER (WHERE patient_age < 5)            AS age_0_4,
          COUNT(*) FILTER (WHERE patient_age BETWEEN 5 AND 14)  AS age_5_14,
          COUNT(*) FILTER (WHERE patient_age BETWEEN 15 AND 24) AS age_15_24,
          COUNT(*) FILTER (WHERE patient_age BETWEEN 25 AND 44) AS age_25_44,
          COUNT(*) FILTER (WHERE patient_age BETWEEN 45 AND 64) AS age_45_64,
          COUNT(*) FILTER (WHERE patient_age >= 65)              AS age_65plus,
          -- Peak month (month with most cases)
          MODE() WITHIN GROUP (ORDER BY encounter_month)    AS peak_month,
          MODE() WITHIN GROUP (ORDER BY month_num)          AS peak_month_num
        FROM deduped
        GROUP BY diagnosis_name
        ORDER BY case_count DESC
        LIMIT $2
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY case_count DESC) AS rank,
        r.*,
        CASE
          WHEN case_count >= 10 THEN 'HIGH ALERT — prevalent condition requiring active surveillance'
          WHEN case_count >= 5  THEN 'WARNING — notable frequency, monitor closely'
          WHEN case_count >= 3  THEN 'WATCH — emerging pattern, track trend'
          ELSE 'NOTE — isolated or rare case(s), document carefully'
        END AS alert_level,
        CASE
          WHEN case_count >= 10 THEN 'critical'
          WHEN case_count >= 5  THEN 'high'
          WHEN case_count >= 3  THEN 'medium'
          ELSE 'low'
        END AS alert_severity
      FROM ranked r
    `, [days, limit]);

    res.json({ ok: true, diagnoses: rows, period_days: days });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/epidemiology/trends?days=90&buckets=12
 * Returns encounter + case counts bucketed over time for trend chart.
 */
router.get('/epidemiology/trends', async (req, res) => {
  try {
    const days    = parseInt(req.query.days    || '90', 10);
    const buckets = parseInt(req.query.buckets || '12', 10);
    const interval = Math.ceil(days / buckets);

    const { rows } = await db.query(`
      SELECT
        date_trunc('day', gs)::date               AS bucket_date,
        COUNT(e.id)                                AS encounters,
        COUNT(e.id) FILTER (WHERE e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb) AS encounters_dx,
        COUNT(e.id) FILTER (WHERE e.case_category = 'emergency') AS emergencies,
        COUNT(DISTINCT e.patient_id)               AS unique_patients
      FROM generate_series(
        (NOW() - ($1 || ' days')::INTERVAL)::date,
        NOW()::date,
        ($2 || ' days')::INTERVAL
      ) AS gs
      LEFT JOIN encounters e
        ON e.created_at::date >= gs::date
       AND e.created_at::date < (gs + ($2 || ' days')::INTERVAL)::date
      GROUP BY bucket_date
      ORDER BY bucket_date
    `, [days, interval]);

    res.json({ ok: true, trends: rows });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/epidemiology/category-breakdown?days=30
 * Returns diagnosis counts by disease category.
 */
router.get('/epidemiology/category-breakdown', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);

    const { rows } = await db.query(`
      WITH dx_flat AS (
        -- differentials: array of objects with a 'name' field
        SELECT dx->>'name' AS diagnosis_name
        FROM encounters e
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(e.diagnoses) = 'array' THEN e.diagnoses
            WHEN jsonb_typeof(e.diagnoses) = 'object'
              THEN COALESCE(
                CASE WHEN jsonb_typeof(e.diagnoses->'differentials') = 'array' THEN e.diagnoses->'differentials' END,
                CASE WHEN jsonb_typeof(e.diagnoses->'differentials_full') = 'array' THEN e.diagnoses->'differentials_full' END,
                '[]'::jsonb
              )
            ELSE '[]'::jsonb
          END
        ) AS dx
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND dx->>'name' IS NOT NULL
          AND TRIM(dx->>'name') != ''
        UNION ALL
        -- provisional: single object with a 'name' field
        SELECT e.diagnoses->'provisional'->>'name' AS diagnosis_name
        FROM encounters e
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND jsonb_typeof(e.diagnoses) = 'object'
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND e.diagnoses->'provisional'->>'name' IS NOT NULL
          AND TRIM(e.diagnoses->'provisional'->>'name') != ''
        UNION ALL
        -- chosen: array of plain strings
        SELECT ch_name AS diagnosis_name
        FROM encounters e
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(e.diagnoses->'chosen') = 'array' THEN e.diagnoses->'chosen' ELSE '[]'::jsonb END
        ) AS ch_name
        WHERE e.diagnoses IS NOT NULL
          AND e.diagnoses != 'null'::jsonb
          AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
          AND ch_name IS NOT NULL
          AND TRIM(ch_name) != ''
      )
      SELECT
        COALESCE(d.category, 'Other') AS category,
        COUNT(*)::int                 AS count
      FROM dx_flat df
      LEFT JOIN diseases d ON LOWER(d.name) = LOWER(df.diagnosis_name)
      GROUP BY category
      ORDER BY count DESC
    `, [days]);

    res.json({ ok: true, categories: rows });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/epidemiology/alerts?days=7
 * Returns alert-worthy signals: sudden spikes, new emergencies, rare diseases seen.
 */
router.get('/epidemiology/alerts', async (req, res) => {
  try {
    // Compare last 7 days vs previous 7 days for each diagnosis
    const { rows: spikes } = await db.query(`
      WITH recent AS (
        SELECT name, COUNT(*) AS cnt FROM (
          SELECT dx->>'name' AS name
          FROM encounters e
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(e.diagnoses) = 'array' THEN e.diagnoses
              WHEN jsonb_typeof(e.diagnoses) = 'object'
                THEN COALESCE(
                  CASE WHEN jsonb_typeof(e.diagnoses->'differentials') = 'array' THEN e.diagnoses->'differentials' END,
                  CASE WHEN jsonb_typeof(e.diagnoses->'differentials_full') = 'array' THEN e.diagnoses->'differentials_full' END,
                  '[]'::jsonb
                )
              ELSE '[]'::jsonb
            END
          ) AS dx
          WHERE e.created_at >= NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND dx->>'name' IS NOT NULL AND TRIM(dx->>'name') != ''
          UNION ALL
          SELECT e.diagnoses->'provisional'->>'name' AS name
          FROM encounters e
          WHERE e.created_at >= NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND jsonb_typeof(e.diagnoses) = 'object'
            AND e.diagnoses->'provisional'->>'name' IS NOT NULL
          UNION ALL
          SELECT ch_name AS name
          FROM encounters e
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(e.diagnoses->'chosen') = 'array' THEN e.diagnoses->'chosen' ELSE '[]'::jsonb END
          ) AS ch_name
          WHERE e.created_at >= NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND ch_name IS NOT NULL AND TRIM(ch_name) != ''
        ) sub
        GROUP BY name
      ),
      previous AS (
        SELECT name, COUNT(*) AS cnt FROM (
          SELECT dx->>'name' AS name
          FROM encounters e
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(e.diagnoses) = 'array' THEN e.diagnoses
              WHEN jsonb_typeof(e.diagnoses) = 'object'
                THEN COALESCE(
                  CASE WHEN jsonb_typeof(e.diagnoses->'differentials') = 'array' THEN e.diagnoses->'differentials' END,
                  CASE WHEN jsonb_typeof(e.diagnoses->'differentials_full') = 'array' THEN e.diagnoses->'differentials_full' END,
                  '[]'::jsonb
                )
              ELSE '[]'::jsonb
            END
          ) AS dx
          WHERE e.created_at >= NOW() - INTERVAL '14 days'
            AND e.created_at <  NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND dx->>'name' IS NOT NULL AND TRIM(dx->>'name') != ''
          UNION ALL
          SELECT e.diagnoses->'provisional'->>'name' AS name
          FROM encounters e
          WHERE e.created_at >= NOW() - INTERVAL '14 days'
            AND e.created_at <  NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND jsonb_typeof(e.diagnoses) = 'object'
            AND e.diagnoses->'provisional'->>'name' IS NOT NULL
          UNION ALL
          SELECT ch_name AS name
          FROM encounters e
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(e.diagnoses->'chosen') = 'array' THEN e.diagnoses->'chosen' ELSE '[]'::jsonb END
          ) AS ch_name
          WHERE e.created_at >= NOW() - INTERVAL '14 days'
            AND e.created_at <  NOW() - INTERVAL '7 days'
            AND e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb
            AND ch_name IS NOT NULL AND TRIM(ch_name) != ''
        ) sub
        GROUP BY name
      )
      SELECT
        r.name,
        r.cnt::int  AS recent_count,
        COALESCE(p.cnt, 0)::int AS prev_count,
        CASE
          WHEN COALESCE(p.cnt, 0) = 0 THEN 999
          ELSE ROUND(((r.cnt - p.cnt)::numeric / p.cnt) * 100, 0)
        END AS pct_change
      FROM recent r
      LEFT JOIN previous p ON p.name = r.name
      WHERE r.cnt >= 2
        AND (COALESCE(p.cnt, 0) = 0 OR ((r.cnt - p.cnt)::numeric / p.cnt) > 0.5)
      ORDER BY pct_change DESC, recent_count DESC
      LIMIT 10
    `);

    // Emergency surge in last 48h
    const { rows: emergencies } = await db.query(`
      SELECT COUNT(*)::int AS count_48h
      FROM encounters
      WHERE case_category = 'emergency'
        AND created_at >= NOW() - INTERVAL '48 hours'
    `);

    // Doctors with unusually high encounter load (>2x average) in last 7 days
    const { rows: highLoad } = await db.query(`
      WITH per_doc AS (
        SELECT u.full_name, u.email, COUNT(e.id) AS enc_count
        FROM encounters e JOIN users u ON u.id = e.doctor_id
        WHERE e.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY u.id, u.full_name, u.email
      ),
      avg_load AS (SELECT AVG(enc_count) AS avg_enc FROM per_doc)
      SELECT pd.full_name, pd.enc_count::int, ROUND(pd.enc_count / al.avg_enc, 1) AS load_ratio
      FROM per_doc pd, avg_load al
      WHERE pd.enc_count > al.avg_enc * 2 AND al.avg_enc > 0
      ORDER BY pd.enc_count DESC LIMIT 5
    `).catch(() => ({ rows: [] }));

    res.json({
      ok: true,
      spikes,
      emergency_48h: emergencies[0]?.count_48h || 0,
      high_load_doctors: highLoad,
    });
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/epidemiology/by-doctor?days=30
 * Returns per-doctor encounter and diagnosis counts.
 */
router.get('/epidemiology/by-doctor', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const { rows } = await db.query(`
      SELECT
        u.id,
        u.full_name,
        u.specialty,
        COUNT(e.id)::int                                              AS encounters,
        COUNT(e.id) FILTER (WHERE e.diagnoses IS NOT NULL AND e.diagnoses != 'null'::jsonb)::int AS encounters_dx,
        COUNT(e.id) FILTER (WHERE e.case_category = 'emergency')::int AS emergencies,
        COUNT(DISTINCT e.patient_id)::int                             AS unique_patients
      FROM users u
      LEFT JOIN encounters e
        ON e.doctor_id = u.id
       AND e.created_at >= NOW() - ($1 || ' days')::INTERVAL
      WHERE u.role != 'admin'
      GROUP BY u.id, u.full_name, u.specialty
      ORDER BY encounters DESC
    `, [days]);
    res.json({ ok: true, doctors: rows });
  } catch (e) { next(e); }
});

module.exports = router;
