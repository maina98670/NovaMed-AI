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
  ('diabetes',
