/**
 * NovaMed AI — DB-driven medical knowledge & scoring engine
 * ==========================================================
 * Hierarchy (per function):
 *   1. PRIMARY:  DB keyword scoring with synonym expansion
 *   2. FALLBACK: AI (handled in aiService.js when DB returns insufficient confidence)
 *
 * DB_CONFIDENCE_THRESHOLD — minimum score for DB result to be trusted.
 * If top score < threshold, aiService hands off to the LLM.
 *
 * Cache: keywords, questions, and synonyms are cached for CACHE_TTL_MS (30 s).
 * Admin routes call invalidateCache() after every write so changes are live immediately.
 */

const db = require('../db');

const CACHE_TTL_MS            = 30_000;
const DB_CONFIDENCE_THRESHOLD = 5;   // top score must reach this to be "confident"

const _cache = {
  keywords:  { data: null, at: 0 },
  questions: { data: null, at: 0 },
  synonyms:  { data: null, at: 0 },
};

function _fresh(bucket) {
  return _cache[bucket].data !== null && (Date.now() - _cache[bucket].at) < CACHE_TTL_MS;
}

/** Called by admin routes after every write to any medical knowledge table. */
function invalidateCache() {
  _cache.keywords.data  = null; _cache.keywords.at  = 0;
  _cache.questions.data = null; _cache.questions.at = 0;
  _cache.synonyms.data  = null; _cache.synonyms.at  = 0;
}

/* -- helpers -- */
function _ageFrom(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / 31_557_600_000);
}
function _ageGroup(age) {
  if (age == null) return 'any';
  return age <= 16 ? 'pediatric' : 'adult';
}

/* ================================================================
 * SYNONYM EXPANSION — loads from symptom_synonyms table
 * ================================================================ */
async function _loadSynonyms() {
  if (_fresh('synonyms')) return _cache.synonyms.data;
  const { rows } = await db.query(`SELECT canonical, synonym FROM symptom_synonyms`);
  const map = {};
  for (const r of rows) {
    const key = r.canonical.toLowerCase().trim();
    if (!map[key]) map[key] = [];
    map[key].push(r.synonym.toLowerCase().trim());
  }
  _cache.synonyms.data = map;
  _cache.synonyms.at   = Date.now();
  return map;
}

/**
 * Expand case text: for every canonical term found inject all its synonyms
 * and vice-versa so DB keywords fire regardless of how the doctor wrote them.
 */
async function expandSynonyms(text) {
  const map = await _loadSynonyms();
  let expanded = text;
  for (const [canonical, synonymList] of Object.entries(map)) {
    const foundViaSynonym = synonymList.some(s => expanded.includes(s));
    if (foundViaSynonym && !expanded.includes(canonical)) {
      expanded += ' ' + canonical;
    }
    if (expanded.includes(canonical)) {
      for (const s of synonymList) {
        if (!expanded.includes(s)) expanded += ' ' + s;
      }
    }
  }
  return expanded;
}

async function _caseText({ patient, encounter }) {
  const ex = encounter?.examination || {};
  const raw = [
    encounter?.chief_complaint  || '',
    encounter?.history_summary  || '',
    ex.general                  || '',
    ex.appearance               || '',
    ex.systems                  || '',
    JSON.stringify(ex.systems_detail || {}),
    JSON.stringify(encounter?.results || ''),
    patient?.chronic_conditions || '',
    patient?.allergies          || '',
  ].join(' ').toLowerCase();

  return expandSynonyms(raw);
}

/* ================================================================
 * rankConditions — score diseases against current case text
 * Each result includes rank, percentage, and a well-defined reason.
 * ================================================================ */
async function rankConditions({ patient, encounter, limit = 5 }) {
  const text   = await _caseText({ patient, encounter });
  const age    = _ageFrom(patient?.date_of_birth);
  const sex    = (patient?.sex || '').toLowerCase();
  const ageGrp = _ageGroup(age);

  if (!_fresh('keywords')) {
    const { rows } = await db.query(`
      SELECT dk.disease_id, dk.keyword, dk.weight, dk.against,
             d.name, d.category, d.age_group, d.sex AS dsex,
             d.reasoning, d.red_flags, d.description, d.icd10
      FROM disease_keywords dk
      JOIN diseases d ON d.id = dk.disease_id
    `);
    _cache.keywords.data = rows;
    _cache.keywords.at   = Date.now();
  }
  const kws = _cache.keywords.data;
  if (!kws || !kws.length) return [];

  const byDisease = new Map();
  for (const k of kws) {
    if (!byDisease.has(k.disease_id)) {
      byDisease.set(k.disease_id, {
        id:          k.disease_id,
        name:        k.name,
        category:    k.category,
        icd10:       k.icd10,
        ageGroup:    k.age_group,
        sex:         k.dsex,
        reasoning:   k.reasoning,
        description: k.description,
        redFlags:    k.red_flags || [],
        score:       0,
        supporting:  [],
        against:     [],
      });
    }
    const d     = byDisease.get(k.disease_id);
    const lower = (k.keyword || '').toLowerCase();
    if (text.includes(lower)) {
      const w = Number(k.weight) || 1;
      if (k.against) {
        d.score -= w;
        d.against.push({ keyword: k.keyword, weight: w });
      } else {
        d.score += w;
        d.supporting.push({ keyword: k.keyword, weight: w });
      }
    }
  }

  // Demographic penalties
  for (const d of byDisease.values()) {
    if (d.ageGroup && d.ageGroup !== 'any' && d.ageGroup !== ageGrp) d.score -= 10;
    if (d.sex      && d.sex      !== 'any' && d.sex      !== sex)    d.score -= 5;
  }

  const sorted = [...byDisease.values()]
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!sorted.length) return [];

  const maxScore = sorted[0].score || 1;

  return sorted.map((d, i) => {
    const pct             = Math.min(Math.round((d.score / maxScore) * 100), 99);
    const supportingNames = d.supporting.map(s => s.keyword);
    const againstNames    = d.against.map(a => a.keyword);

    // Build a well-defined reason citing actual matched evidence
    const reasonParts = [];
    if (supportingNames.length) {
      reasonParts.push(`Supported by documented findings: ${supportingNames.slice(0, 6).join(', ')}.`);
    }
    if (againstNames.length) {
      reasonParts.push(`Features arguing against this diagnosis: ${againstNames.slice(0, 4).join(', ')}.`);
    }
    if (d.reasoning) {
      reasonParts.push(d.reasoning);
    }
    if (i > 0 && sorted[0]) {
      const topSupporting = sorted[0].supporting.map(s => s.keyword);
      const overlap       = supportingNames.filter(k => topSupporting.includes(k));
      if (overlap.length < supportingNames.length) {
        reasonParts.push(
          `Ranked below ${sorted[0].name} because it has fewer corroborating findings ` +
          `(score: ${d.score.toFixed(1)} vs ${sorted[0].score.toFixed(1)}).`
        );
      }
    }

    return {
      rank:       i + 1,
      name:       d.name,
      category:   d.category,
      icd10:      d.icd10 || null,
      score:      parseFloat(d.score.toFixed(2)),
      percentage: pct,
      likelihood: d.score >= 12 ? 'high' : d.score >= 5 ? 'moderate' : 'low',
      reason:     reasonParts.join(' ') || `Matched ${supportingNames.length} keyword(s) in the clinical knowledge base.`,
      reasoning:  d.reasoning || '',
      supporting: supportingNames.slice(0, 6),
      against:    againstNames.slice(0, 6),
      red_flags:  d.redFlags.slice(0, 6),
    };
  });
}

/** Returns true if the top DB result clears the confidence threshold. */
function isConfident(ranked) {
  return ranked.length > 0 && ranked[0].score >= DB_CONFIDENCE_THRESHOLD;
}

/* ================================================================
 * investigationsFor
 * ================================================================ */
async function investigationsFor(diseaseName) {
  const { rows } = await db.query(`
    SELECT di.category, di.test, di.reason
      FROM disease_investigations di
      JOIN diseases d ON d.id = di.disease_id
     WHERE LOWER(d.name) = LOWER($1)
     ORDER BY di.id ASC
  `, [diseaseName]);

  const out = { labs: [], imaging: [], bedside: [], specialist: [] };
  for (const r of rows) {
    const cat = r.category === 'lab' ? 'labs' : r.category;
    if (out[cat]) out[cat].push({ test: r.test, reason: r.reason, purpose: r.reason });
  }
  return out;
}

/* ================================================================
 * treatmentFor
 * ================================================================ */
async function treatmentFor(diseaseName) {
  const { rows } = await db.query(`
    SELECT dt.type, dt.item, dt.dose, dt.route, dt.frequency, dt.duration, dt.notes
      FROM disease_treatments dt
      JOIN diseases d ON d.id = dt.disease_id
     WHERE LOWER(d.name) = LOWER($1)
     ORDER BY dt.id ASC
  `, [diseaseName]);

  const plan = {
    immediate: [], medications: [], non_pharm: [], monitoring: [],
    follow_up: '', patient_advice: '', red_flags: [], referrals: [],
  };
  for (const r of rows) {
    switch (r.type) {
      case 'immediate':  plan.immediate.push(r.item); break;
      case 'non_pharm':  plan.non_pharm.push(r.item); break;
      case 'monitoring': plan.monitoring.push(r.item); break;
      case 'red_flag':   plan.red_flags.push(r.item); break;
      case 'referral':   plan.referrals.push(r.item); break;
      case 'follow_up':  plan.follow_up = r.item; break;
      case 'advice':     plan.patient_advice = r.item; break;
      case 'medication':
        plan.medications.push({
          name: r.item, dose: r.dose, route: r.route,
          frequency: r.frequency, duration: r.duration, notes: r.notes,
        });
        break;
    }
  }
  return plan;
}

/* ================================================================
 * nextAdaptiveQuestion
 * ================================================================ */
async function nextAdaptiveQuestion({ history, encounter, patient }) {
  const asked = new Set(
    (history || []).filter(t => t.role === 'ai').map(t => (t.question || '').trim())
  );
  const text = [
    encounter?.chief_complaint, encounter?.history_summary,
    ...(history || []).map(t => `${t.question || ''} ${t.answer || ''}`),
  ].join(' ').toLowerCase();

  if (!_fresh('questions')) {
    const { rows } = await db.query(
      `SELECT * FROM history_questions ORDER BY importance DESC, id ASC`
    );
    _cache.questions.data = rows;
    _cache.questions.at   = Date.now();
  }
  const qs = _cache.questions.data;
  if (!qs || !qs.length) return null;

  const scored = qs
    .filter(q => !asked.has(q.question.trim()))
    .map(q => {
      let score = Number(q.importance) || 5;
      if (q.follow_up_for && text.includes(q.follow_up_for.toLowerCase())) score += 6;
      if (Array.isArray(q.triggers)) {
        for (const t of q.triggers) {
          if (t && text.includes(t.toLowerCase())) { score += 3; break; }
        }
      }
      return { q, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length ? scored[0].q : null;
}

/* ================================================================
 * SYNONYM CRUD (for admin routes)
 * ================================================================ */
async function listSynonyms() {
  const { rows } = await db.query(
    `SELECT * FROM symptom_synonyms ORDER BY canonical, synonym`
  );
  return rows;
}

async function addSynonym(canonical, synonym) {
  const { rows } = await db.query(
    `INSERT INTO symptom_synonyms (canonical, synonym)
     VALUES (LOWER(TRIM($1)), LOWER(TRIM($2)))
     ON CONFLICT (canonical, synonym) DO NOTHING
     RETURNING *`,
    [canonical, synonym]
  );
  invalidateCache();
  return rows[0] || null;
}

async function updateSynonym(id, canonical, synonym) {
  const { rows } = await db.query(
    `UPDATE symptom_synonyms
        SET canonical = LOWER(TRIM($1)), synonym = LOWER(TRIM($2))
      WHERE id = $3
  RETURNING *`,
    [canonical, synonym, id]
  );
  invalidateCache();
  return rows[0] || null;
}

async function deleteSynonym(id) {
  await db.query(`DELETE FROM symptom_synonyms WHERE id = $1`, [id]);
  invalidateCache();
}

/* ================================================================
 * Admin listing helpers
 * ================================================================ */
async function listDiseases() {
  const { rows } = await db.query(
    `SELECT id, name, category, age_group, sex FROM diseases ORDER BY name ASC`
  );
  return rows;
}

async function listSymptoms() {
  const { rows } = await db.query(
    `SELECT id, name, body_system FROM symptoms ORDER BY body_system, name`
  );
  return rows;
}

async function getStats() {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM diseases)               AS diseases,
      (SELECT COUNT(*) FROM symptoms)               AS symptoms,
      (SELECT COUNT(*) FROM history_questions)      AS questions,
      (SELECT COUNT(*) FROM disease_keywords)       AS keywords,
      (SELECT COUNT(*) FROM disease_investigations) AS investigations,
      (SELECT COUNT(*) FROM disease_treatments)     AS treatments,
      (SELECT COUNT(*) FROM symptom_synonyms)       AS synonyms
  `);
  return rows[0];
}

module.exports = {
  rankConditions,
  isConfident,
  investigationsFor,
  treatmentFor,
  nextAdaptiveQuestion,
  listDiseases,
  listSymptoms,
  listSynonyms,
  addSynonym,
  updateSynonym,
  deleteSynonym,
  getStats,
  invalidateCache,
  DB_CONFIDENCE_THRESHOLD,
};
