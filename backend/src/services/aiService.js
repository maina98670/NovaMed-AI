/**
 * NovaMed AI — DB-FIRST clinical service
 * =======================================
 * Hierarchy for every clinical function:
 *   1. PRIMARY:  DB keyword scoring (with synonym expansion)
 *                → if confident (score >= threshold): return DB result
 *                → if not confident: hand off to AI
 *   2. FALLBACK: External LLM (Gemini → Groq → OpenAI)
 *
 * Special rules:
 *   - X-ray / image reading: AI ONLY. If AI unavailable → unavailable message.
 *   - Result interpretation (file): AI ONLY. If unavailable → unavailable message.
 *   - Result interpretation (text/lab values): DB range checker first, AI enriches.
 *   - medicalKnowledge.js (hardcoded data) is NOT used anywhere in this file.
 *
 * Output shapes are preserved for frontend compatibility.
 * Every diagnosis includes rank, percentage, and a well-defined reason
 * citing specific documented findings from the patient's record.
 */

const fs   = require('fs');
const DB   = require('./medicalDB');

const PROVIDER     = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const GEMINI_KEY   = process.env.GEMINI_API_KEY  || '';
const OPENAI_KEY   = process.env.OPENAI_API_KEY  || '';
const GROQ_KEY     = process.env.GROQ_API_KEY    || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.0-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'llama-3.3-70b-versatile';

const HISTORY_SECTIONS = ['HPC', 'PMH', 'DH', 'FH', 'SH', 'ROS'];

const SYSTEM_PROMPT = `
You are the clinical reasoning engine inside the NovaMed AI clinical decision
support system, used by qualified healthcare professionals.

ABSOLUTE RULES:
- Refer ONLY to "the system" or "NovaMed AI". NEVER name any external AI vendor.
- All output is for clinician decision support, NOT direct patient instructions.
- Be concise, accurate, and follow exactly the JSON schema you are given.
- If a field is unknown, write "—" rather than inventing details.
- Use SI units. Drug doses must include route and frequency.

STRICT DIAGNOSTIC ACCURACY RULES — these override everything else:
1. NEVER invent, assume, or infer symptoms that are NOT explicitly present in the patient data.
2. NEVER exaggerate the severity or significance of a symptom beyond what was reported.
3. Only map symptoms that ACTUALLY APPEAR in the history or examination to a diagnosis.
4. If the available clinical data is insufficient to support a specific diagnosis, return
   provisional.name = "Insufficient data for diagnosis" and explain what is still needed.
5. If the chief complaint does NOT match any recognised disease pattern, return
   provisional.name = "No diagnosis matched — further evaluation needed".
6. Likelihood scores must reflect the ACTUAL evidence in the case, not general prevalence.
7. Differentials must ONLY be listed if genuine clinical data in the case supports them.
8. Every diagnosis MUST include a well-defined reason citing the specific documented
   symptoms, signs, history, or examination findings that support it.
9. Every reason must explain WHY this diagnosis ranks where it ranks relative to others.
`.trim();

/* ============================================================
 * Low-level LLM calls
 * ============================================================ */
async function callGemini(prompt, { json = false, temperature = 0.4, maxOutputTokens = 4096 } = {}) {
  if (!GEMINI_KEY) throw new Error('NO_GEMINI_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: Array.isArray(prompt) ? prompt : [{ text: prompt }] }],
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature, topK: 32, topP: 0.95, maxOutputTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
    safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }],
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 220)}`);
  const data = await r.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

async function callOpenAI(prompt, { json = false, temperature = 0.4, maxTokens = 4096 } = {}) {
  if (!OPENAI_KEY) throw new Error('NO_OPENAI_KEY');
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (Array.isArray(prompt)) {
    const parts = prompt.map(p => p.text
      ? { type: 'text', text: p.text }
      : p.inlineData
        ? { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
        : null
    ).filter(Boolean);
    messages.push({ role: 'user', content: parts.length === 1 ? (parts[0].text || parts[0]) : parts });
  } else {
    messages.push({ role: 'user', content: prompt });
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL, messages, temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 220)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || '';
}

async function callGroq(prompt, { json = false, temperature = 0.4, maxTokens = 4096 } = {}) {
  if (!GROQ_KEY) throw new Error('NO_GROQ_KEY');
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (Array.isArray(prompt)) {
    const text = prompt.map(p => p.text || '').filter(Boolean).join('\n');
    messages.push({ role: 'user', content: text });
  } else {
    messages.push({ role: 'user', content: prompt });
  }
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 220)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Try configured provider first, fall back to others.
 * Throws ALL_AI_UNAVAILABLE if none reachable.
 */
async function callLLM(prompt, opts = {}) {
  const tries = [];
  if (PROVIDER === 'openai')    tries.push(['openai', callOpenAI], ['groq', callGroq],   ['gemini', callGemini]);
  else if (PROVIDER === 'groq') tries.push(['groq',   callGroq],   ['gemini', callGemini], ['openai', callOpenAI]);
  else                          tries.push(['gemini', callGemini], ['groq',   callGroq],   ['openai', callOpenAI]);

  let lastErr;
  for (const [name, fn] of tries) {
    try {
      const txt = await fn(prompt, opts);
      if (txt && txt.length > 5) return txt;
    } catch (e) {
      lastErr = e;
      console.warn(`[ai] ${name} failed: ${e.message}`);
    }
  }
  const err = new Error('ALL_AI_UNAVAILABLE');
  err.cause = lastErr;
  throw err;
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) try { return JSON.parse(m[1]); } catch {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s > -1 && e > s) try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  return null;
}

function fileToInlinePart(filepath, mime) {
  const data = fs.readFileSync(filepath);
  return { inlineData: { mimeType: mime || 'application/octet-stream', data: data.toString('base64') } };
}

function ageOf(p) {
  if (!p?.date_of_birth) return null;
  return Math.floor((Date.now() - new Date(p.date_of_birth)) / 31557600000);
}

function patientContext(patient, encounter) {
  return `
PATIENT
- Sex: ${patient?.sex || 'unknown'}
- Age: ${ageOf(patient) ?? 'unknown'}
- Allergies: ${patient?.allergies || 'none recorded'}
- Chronic conditions: ${patient?.chronic_conditions || 'none recorded'}

CHIEF COMPLAINT: ${encounter?.chief_complaint || '—'}

HISTORY SUMMARY:
${encounter?.history_summary || '(none recorded)'}

EXAMINATION:
${JSON.stringify(encounter?.examination || {}, null, 2)}

WORKING DIAGNOSES (if any):
${JSON.stringify(encounter?.diagnoses || {}, null, 2)}

RESULTS / WARNINGS:
${JSON.stringify({ results: encounter?.results, warnings: encounter?.warnings }, null, 2)}
`.trim();
}

/* ============================================================
 * 1. ADAPTIVE NEXT QUESTION — Systematic, ordered, adaptive
 *    Order: HPC → PMH → DH → FH → SH (incl. occupation) → ROS → DONE
 *    Each question adapts to the PREVIOUS answer
 * ============================================================ */

const HISTORY_ORDER = ['HPC', 'PMH', 'DH', 'FH', 'SH', 'ROS'];

// Minimum questions per section before moving on
const SECTION_MIN = { HPC: 4, PMH: 2, DH: 2, FH: 1, SH: 2, ROS: 2 };

function currentSection(history) {
  const counts = {};
  for (const t of history) {
    if (t.role === 'patient' && t.section) {
      counts[t.section] = (counts[t.section] || 0) + 1;
    }
  }
  for (const sec of HISTORY_ORDER) {
    if ((counts[sec] || 0) < (SECTION_MIN[sec] || 2)) return sec;
  }
  return 'DONE';
}

async function nextHistoryQuestion({ encounter, patient, turns }) {
  const history   = turns || [];
  const askedSet  = new Set(history.filter(t => t.role === 'ai').map(t => (t.question || '').trim()));
  const askedList = [...askedSet];

  // Determine where we are in the systematic order
  const activeSec = currentSection(history);
  if (activeSec === 'DONE') {
    // Build summary from collected history
    const sections = {};
    for (const t of history) {
      if (t.role === 'patient' && t.answer) {
        const k = t.section || 'OTHER';
        sections[k] = sections[k] || [];
        sections[k].push(t.answer);
      }
    }
    const parts = [`The patient presents with ${encounter.chief_complaint || 'an undefined complaint'}.`];
    for (const sec of HISTORY_ORDER) {
      if (sections[sec]?.length) parts.push(`\n**${sec}:** ${sections[sec].join(' ')}`);
    }
    return { section: 'DONE', question: null, rationale: null, done: true, summary: parts.join('\n'), source: 'fallback' };
  }

  // Get last patient answer for adaptive follow-up
  const lastPatientTurn = [...history].reverse().find(t => t.role === 'patient');
  const lastAnswer      = lastPatientTurn?.answer || '';
  const lastSection     = lastPatientTurn?.section || '';

  // -- DB first: pull adaptive question from question bank --
  try {
    const q = await DB.nextAdaptiveQuestion({ history, encounter, patient });
    if (q) {
      return {
        section:   q.section || activeSec,
        question:  q.question,
        rationale: q.follow_up_for
          ? `Follow-up on "${q.follow_up_for}" — adaptive based on patient's answer.`
          : `Systematic ${q.section || activeSec} question from clinical knowledge base.`,
        done:    false,
        summary: null,
        source:  'db',
      };
    }
  } catch (e) {
    console.warn('[db] nextHistoryQuestion failed:', e.message);
  }

  // -- AI: systematic, section-ordered, adaptive question --
  try {
    const sectionDescriptions = {
      HPC: 'History of Presenting Complaint — onset, duration, character, severity, location, radiation, aggravating/relieving factors, associated symptoms, timeline',
      PMH: 'Past Medical History — previous illnesses, surgeries, hospitalisations, chronic diseases, childhood illnesses',
      DH:  'Drug History — current medications (name, dose, how long), OTC drugs, herbal remedies, contraceptives, compliance, previous drug reactions',
      FH:  'Family History — diseases in first-degree relatives, hereditary conditions, similar illness in family',
      SH:  'Social History — OCCUPATION (type of work, exposures, shift work), smoking, alcohol, recreational drugs, living situation, marital status, travel, diet, exercise, sexual history if relevant',
      ROS: 'Review of Systems — systematic enquiry of all body systems NOT yet covered: cardiovascular, respiratory, GIT, GU, neuro, MSK, skin, eyes/ears/nose',
    };

    const answeredInSection = history.filter(t => t.role === 'patient' && t.section === activeSec);
    const answeredCount     = answeredInSection.length;

    const prompt = `
You are conducting a SYSTEMATIC clinical history. You are currently in the ${activeSec} section.
SECTION FOCUS: ${sectionDescriptions[activeSec]}

RULES:
1. You MUST stay in the ${activeSec} section until at least ${SECTION_MIN[activeSec] || 2} questions have been answered (answered so far: ${answeredCount}).
2. Your next question MUST be adaptive — it should follow naturally from the patient's LAST answer: "${lastAnswer || '(none yet)'}"
3. If the last answer reveals something important, ask a follow-up about that specific finding first.
4. Do NOT repeat any previously asked question.
5. Questions must be phrased clinically but clearly, as the doctor asking the patient.
6. For SH section, specifically ask about OCCUPATION and potential occupational exposures/risks.
7. For HPC, use SOCRATES framework systematically.

Output JSON ONLY:
{
  "section":   "${activeSec}",
  "question":  "The single next question to ask the patient — adaptive, specific, not repetitive",
  "rationale": "One sentence: why this specific question now, referencing the patient's last response if applicable",
  "done":      false,
  "summary":   null
}

${patientContext(patient, encounter)}

SECTIONS COMPLETED (approximate):
${HISTORY_ORDER.map(s => {
  const c = history.filter(t => t.role === 'patient' && t.section === s).length;
  return `  ${s}: ${c} answer(s) / ${SECTION_MIN[s] || 2} minimum`;
}).join('\n')}

QUESTIONS ALREADY ASKED (do NOT repeat):
${askedList.map(q => '- ' + q).join('\n') || '(none)'}

LAST PATIENT ANSWER: "${lastAnswer || '(none)'}" [section: ${lastSection || 'start'}]

ALL PRIOR ANSWERS:
${history.filter(t => t.role === 'patient').map(t => `[${t.section}] Q: ${t.question||'—'}\n       A: ${t.answer}`).join('\n') || '(none)'}
`.trim();

    const txt = await callLLM(prompt, { json: true, temperature: 0.3 });
    const obj = parseJson(txt);
    if (obj && (obj.question || obj.done)) {
      return {
        section:   obj.section || activeSec,
        question:  obj.question || null,
        rationale: obj.rationale || '',
        done:      !!obj.done,
        summary:   obj.summary || null,
        source:    'ai',
      };
    }
  } catch (e) {
    console.warn('[ai] nextHistoryQuestion failed:', e.message);
  }

  // Last resort fallback
  const sections = {};
  for (const t of history) {
    if (t.role === 'patient' && t.answer) {
      const k = t.section || 'OTHER';
      sections[k] = sections[k] || [];
      sections[k].push(t.answer);
    }
  }
  const parts = [`The patient presents with ${encounter.chief_complaint || 'an undefined complaint'}.`];
  for (const [sec, ans] of Object.entries(sections)) parts.push(`\n**${sec}:** ${ans.join(' ')}`);
  return { section: 'DONE', question: null, rationale: null, done: true, summary: parts.join('\n'), source: 'fallback' };
}

/* ============================================================
 * 2. STRUCTURED DIAGNOSIS — AI FIRST, DB as fallback
 *
 * Returns:
 * {
 *   provisional: { name, rank, percentage, justification, symptom_correlation,
 *                  clinical_reasoning, likelihood, reason,
 *                  causative_agent, pathology },
 *   differentials: [ { name, rank, percentage, likelihood, reasoning, reason,
 *                       supporting, against, red_flags, less_likely_because,
 *                       causative_agent } ],
 *   summary_for_doctor: "...",
 *   urgent: bool,
 *   source: "ai" | "db"
 * }
 * ============================================================ */
async function suggestDiagnoses({ patient, encounter }) {

  // ── STEP 1: AI FIRST ────────────────────────────────────
  try {
    // DB hints to enrich AI (used only as hints)
    let dbHint = '';
    try {
      const dbRanked = await DB.rankConditions({ patient, encounter, limit: 5 });
      if (dbRanked.length) {
        dbHint = `\nDB PRE-SCREENING (use as hints only):\n${dbRanked.slice(0,3).map(d =>
          `  - ${d.name} (score ${d.score}, matched: ${d.supporting.join(', ')})`
        ).join('\n')}`;
      }
    } catch {}

    const prompt = `
Generate a STRUCTURED clinical diagnosis assessment based STRICTLY on the symptoms and findings
documented below — including the FULL HISTORY (HPC, PMH, DH, FH, SH, ROS) and PHYSICAL EXAMINATION findings.
Also assess for OCCUPATIONAL RISKS based on the patient's stated occupation and social history.
Do NOT invent, assume, or infer any symptom not explicitly present in the record.

Output JSON ONLY — no extra text:
{
  "provisional": {
    "name": "single most likely diagnosis OR 'Insufficient data for diagnosis' OR 'No diagnosis matched — further evaluation needed'",
    "rank": 1,
    "percentage": <0-99 integer reflecting actual evidence strength>,
    "justification": "cite ONLY specific documented symptoms/signs from the history AND physical examination — NO invented data",
    "symptom_correlation": "map ONLY documented symptoms/findings (history + examination) to this diagnosis — nothing invented",
    "clinical_reasoning": "step-by-step reasoning: start with HPC → key examination findings → supporting history (PMH/DH/FH/SH/ROS) → why this diagnosis fits above others",
    "likelihood": "high | moderate | low | insufficient_data",
    "reason": "well-defined reason citing specific patient findings from history AND examination that support this as the #1 diagnosis",
    "causative_agent": "specific pathogen, organism, or aetiology (e.g. 'Plasmodium falciparum', 'Streptococcus pneumoniae', 'autoimmune') or '—' if not applicable",
    "pathology": "2-3 sentence explanation of the disease mechanism/pathophysiology relevant to this patient's specific presentation",
    "occupational_risks": "Assess whether the patient's OCCUPATION (from SH) contributes to or is relevant to this diagnosis — e.g. dust exposure, shift work, chemical exposure, sedentary work, infectious exposures; or 'No specific occupational risk identified'",
    "history_contribution": "Which specific aspects of PMH/DH/FH/SH/ROS contributed to this diagnosis — or 'Not significantly modified by background history'",
    "missing_information": "if data is insufficient, list exactly what is still needed"
  },
  "differentials": [
    {
      "name": "alternative diagnosis — ONLY if genuinely supported by documented history OR examination findings",
      "rank": 2,
      "percentage": <0-99 integer>,
      "explanation": "why this is on the differential — cite ONLY specific documented evidence from history OR examination",
      "supporting": ["ONLY documented history/examination findings that support this — no invented symptoms"],
      "opposing":   ["documented history/examination findings that argue against this"],
      "less_likely_because": "specific documented reason it ranks below the provisional",
      "reason": "well-defined reason citing specific patient history and examination findings for this rank",
      "likelihood": "moderate | low",
      "causative_agent": "specific pathogen or aetiology or '—'",
      "occupational_link": "any occupational or social history link to this differential or '—'"
    }
  ],
  "summary_for_doctor": "250-350 words integrating ONLY documented history (ALL sections) + examination + reasoning — including occupational context if relevant — NO invented symptoms",
  "urgent": true | false,
  "data_quality": "sufficient | partial | insufficient",
  "history_completeness": {
    "HPC": "complete | partial | missing",
    "PMH": "complete | partial | missing",
    "DH": "complete | partial | missing",
    "FH": "complete | partial | missing",
    "SH": "complete | partial | missing",
    "ROS": "complete | partial | missing",
    "examination": "complete | partial | missing"
  }
}

CRITICAL RULES:
- Provide EXACTLY 1 provisional diagnosis.
- Provide UP TO 3 differentials ONLY if genuinely supported by documented data — fewer is better.
- Every justification/reasoning MUST reference BOTH history AND examination findings where available.
- NEVER add symptoms the patient did not describe or findings not documented on examination.
- Occupational risk assessment is MANDATORY — always assess even if the occupation seems unrelated.
- causative_agent and pathology are MANDATORY for all infectious and inflammatory conditions.
- Use percentage scores (0-99%) and likelihood labels to indicate confidence clearly.
- history_completeness must honestly flag gaps that affect diagnostic confidence.
${dbHint}

${patientContext(patient, encounter)}
`.trim();

    const txt = await callLLM(prompt, { json: true, temperature: 0.3, maxOutputTokens: 6000 });
    const obj = parseJson(txt);
    if (obj?.provisional?.name && Array.isArray(obj.differentials)) {
      const legacy = [
        {
          name:       obj.provisional.name,
          rank:       1,
          percentage: obj.provisional.percentage || 0,
          likelihood: obj.provisional.likelihood || 'moderate',
          reasoning:  obj.provisional.justification || '',
          reason:     obj.provisional.reason || obj.provisional.justification || '',
          supporting: [],
          against:    [],
          red_flags:  [],
          causative_agent: obj.provisional.causative_agent || '—',
        },
        ...obj.differentials.map((d, i) => ({
          name:                d.name,
          rank:                i + 2,
          percentage:          d.percentage || 0,
          likelihood:          d.likelihood || 'low',
          reasoning:           d.explanation || '',
          reason:              d.reason || d.explanation || '',
          supporting:          d.supporting || [],
          against:             d.opposing   || [],
          red_flags:           [],
          less_likely_because: d.less_likely_because || '',
          causative_agent:     d.causative_agent || '—',
        })),
      ];
      return {
        provisional:        obj.provisional,
        differentials:      legacy,
        differentials_full: obj.differentials,
        summary_for_doctor: obj.summary_for_doctor || '',
        urgent:             !!obj.urgent,
        source:             'ai',
      };
    }
  } catch (e) {
    console.warn('[ai] suggestDiagnoses failed:', e.message);
  }

  // ── STEP 2: AI failed — DB fallback ────────────────────
  console.log(`[diagnosis] AI unavailable — falling back to DB`);
  let dbRanked = [];
  try {
    dbRanked = await DB.rankConditions({ patient, encounter, limit: 5 });
  } catch (e) {
    console.warn('[db] rankConditions failed:', e.message);
  }

  if (dbRanked.length) {
    return _buildDiagnosisFromDB(dbRanked, patient, encounter);
  }

  // Nothing at all
  return {
    provisional: {
      name:               'Insufficient data for diagnosis',
      rank:               1,
      percentage:         0,
      justification:      'Neither the AI engine nor the knowledge base could identify a diagnosis from the available data.',
      symptom_correlation:'No matching patterns found.',
      clinical_reasoning: 'Please ensure history, examination, and chief complaint are fully documented before requesting diagnosis.',
      likelihood:         'insufficient_data',
      reason:             'No documented findings matched any known disease pattern and the AI engine is currently unavailable.',
      causative_agent:    '—',
      pathology:          '—',
      missing_information:'Complete history, examination findings, and vital signs are required.',
    },
    differentials:      [],
    differentials_full: [],
    summary_for_doctor: 'No diagnosis could be generated. Ensure the clinical record is fully populated and try again.',
    urgent:             false,
    source:             'none',
  };
}


/** Build the standard diagnosis shape from DB ranked results. */
function _buildDiagnosisFromDB(ranked, patient, encounter) {
  const top    = ranked[0];
  const maxPct = top.percentage;

  const provisional = {
    name:               top.name,
    rank:               1,
    percentage:         maxPct,
    justification:      top.reason,
    symptom_correlation:`Documented findings supporting this diagnosis: ${top.supporting.join(', ') || 'see history & examination'}.`,
    clinical_reasoning: top.reasoning || top.reason,
    likelihood:         top.likelihood,
    reason:             top.reason,
  };

  const differentials_full = ranked.slice(1, 4).map((d, i) => ({
    name:                d.name,
    rank:                i + 2,
    percentage:          d.percentage,
    explanation:         d.reason,
    supporting:          d.supporting,
    opposing:            d.against,
    less_likely_because: d.reason.includes('Ranked below') ? d.reason : `Lower evidence score than ${top.name} (${d.score} vs ${top.score}).`,
    reason:              d.reason,
    likelihood:          d.likelihood,
  }));

  const legacy = [
    {
      name:       top.name,
      rank:       1,
      percentage: maxPct,
      likelihood: top.likelihood,
      reasoning:  top.reason,
      reason:     top.reason,
      supporting: top.supporting,
      against:    top.against,
      red_flags:  top.red_flags,
    },
    ...ranked.slice(1, 4).map((d, i) => ({
      name:                d.name,
      rank:                i + 2,
      percentage:          d.percentage,
      likelihood:          d.likelihood,
      reasoning:           d.reason,
      reason:              d.reason,
      supporting:          d.supporting,
      against:             d.against,
      red_flags:           d.red_flags,
      less_likely_because: `Evidence score ${d.score} vs ${top.score} for ${top.name}.`,
    })),
  ];

  const age    = ageOf(patient);
  const summary =
    `${patient?.full_name || 'The patient'} (${patient?.sex || 'sex unspecified'}, age ${age || '?'}) ` +
    `presents with "${encounter?.chief_complaint || 'an undefined complaint'}". ` +
    `Based on the documented findings, the leading working diagnosis is **${top.name}** ` +
    `(${top.likelihood} likelihood, ${maxPct}% confidence). ${top.reason} ` +
    (ranked.length > 1
      ? `Differentials considered: ${ranked.slice(1, 4).map(d => `${d.name} (${d.percentage}%)`).join(', ')}.`
      : '') +
    ` Confirm with targeted investigations and reassess as new information emerges.`;

  const urgent = ranked.some(d =>
    d.likelihood === 'high' &&
    /sepsis|infarct|stroke|emergency|shock|pre-eclampsia|anaphylax|embolism|dka|meningitis/i.test(d.name)
  );

  return {
    provisional,
    differentials:      legacy,
    differentials_full,
    summary_for_doctor: summary,
    urgent,
    source:             'db',
  };
}

/* ============================================================
 * 3. STRUCTURED INVESTIGATIONS — DB first, AI fallback
 * ============================================================ */
async function suggestInvestigations({ patient, encounter, chosenDiagnoses }) {
  const dxList = (chosenDiagnoses && chosenDiagnoses.length)
    ? chosenDiagnoses
    : (encounter.diagnoses?.chosen ||
       (encounter.diagnoses?.provisional?.name ? [encounter.diagnoses.provisional.name] :
       (encounter.diagnoses?.differentials || []).map(d => d.name) || []));

  // -- DB first --
  if (dxList.length) {
    try {
      const merged  = { labs: [], imaging: [], bedside: [], specialist: [] };
      const seen    = new Set();
      let   hasData = false;
      for (const name of dxList) {
        const inv = await DB.investigationsFor(name);
        for (const cat of Object.keys(merged)) {
          for (const item of inv[cat] || []) {
            const key = `${cat}::${(item.test || '').toLowerCase()}`;
            if (!seen.has(key)) { seen.add(key); merged[cat].push(item); hasData = true; }
          }
        }
      }
      if (hasData) return { ...merged, source: 'db' };
    } catch (e) {
      console.warn('[db] investigations failed:', e.message);
    }
  }

  // -- AI fallback with explicit reasoning --
  try {
    const prompt = `
Recommend a structured investigation plan for the following case. For EVERY investigation,
provide a specific clinical reason WHY it is needed for this patient — link to the diagnosis,
symptoms, or examination findings. Do not give generic reasons.

Output JSON ONLY:
{
  "labs": [
    {
      "test": "Full test name",
      "reason": "Specific clinical reason WHY this test — e.g. 'To confirm suspected malaria by detecting P. falciparum antigens given the fever and thrombocytopaenia'",
      "expected": "What result would confirm or refute the diagnosis",
      "urgency": "urgent | routine | if-available",
      "normal_range": "Reference range if applicable"
    }
  ],
  "imaging": [
    {
      "test": "Full imaging test name + region e.g. CXR PA, Abdominal USS",
      "reason": "Specific reason for THIS patient — e.g. 'CXR to exclude lobar pneumonia as cause of fever and productive cough'",
      "expected": "Expected findings that would support or exclude the diagnosis",
      "urgency": "urgent | routine | if-available",
      "preparation": "Any patient preparation needed e.g. fasting, full bladder"
    }
  ],
  "specialist": [
    {
      "test": "Specialist consultation or procedure",
      "reason": "Why this referral is needed — specific to this patient",
      "expected": "What expertise or intervention is sought",
      "urgency": "urgent | routine | elective"
    }
  ],
  "bedside": [
    {
      "test": "Bedside or point-of-care test",
      "reason": "Specific reason for THIS patient",
      "expected": "Expected result and its implication",
      "urgency": "urgent | routine"
    }
  ]
}

RULES:
- Every "reason" MUST be patient-specific and reference documented symptoms or findings.
- Every "expected" MUST explain what result would confirm vs exclude the diagnosis.
- Only include investigations that are genuinely indicated — do not pad the list.
- Order investigations by clinical priority (most urgent/informative first).

${patientContext(patient, encounter)}
WORKING DIAGNOSES: ${JSON.stringify(dxList)}
`.trim();

    const txt = await callLLM(prompt, { json: true, temperature: 0.3, maxOutputTokens: 4000 });
    const obj = parseJson(txt);
    if (obj && (obj.labs || obj.imaging || obj.bedside || obj.specialist)) {
      const norm = arr => (arr || []).map(x => ({
        test:         x.test || x.name || String(x),
        reason:       x.reason || x.purpose || '',
        expected:     x.expected || '',
        urgency:      x.urgency || 'routine',
        normal_range: x.normal_range || '',
        preparation:  x.preparation || '',
      }));
      return {
        labs:       norm(obj.labs),
        imaging:    norm(obj.imaging),
        bedside:    norm(obj.bedside),
        specialist: norm(obj.specialist),
        source:     'ai',
      };
    }
  } catch (e) {
    console.warn('[ai] investigations failed:', e.message);
  }

  return { labs: [], imaging: [], bedside: [], specialist: [], source: 'none' };
}

/* ============================================================
 * 4. STRUCTURED TREATMENT — AI first with allergy check, DB fallback
 * ============================================================ */
async function suggestTreatment({ patient, encounter, chosenDiagnoses }) {
  const dxList = (chosenDiagnoses && chosenDiagnoses.length)
    ? chosenDiagnoses
    : (encounter.diagnoses?.chosen || []);

  const allergyInfo = patient?.allergies
    ? `\nKNOWN ALLERGIES: ${patient.allergies}\n⚠️ ALLERGY ALERT: Review every medication against this allergy list. Flag any drug that may cross-react.`
    : '\nKNOWN ALLERGIES: None recorded.';

  // -- AI first with allergy checking --
  try {
    const prompt = `
Generate a comprehensive treatment plan in STRICT TABLE FORM. The output MUST follow the exact column order below.
Check every drug against the patient's known allergies before prescribing.

Output JSON ONLY:
{
  "first_line": [
    {
      "drug": "Full drug name (generic + brand if known)",
      "dose": "Exact dose with unit e.g. 500 mg, 1 g",
      "route": "PO | IV | IM | SC | PR | Inhaled | Topical | Sublingual | Nebulised",
      "frequency": "e.g. TDS (8 hrly) | BD (12 hrly) | OD | PRN | STAT",
      "duration": "e.g. 5 days | 7 days | until review | lifelong",
      "mechanism_of_action": "Specific mechanism — e.g. 'Inhibits bacterial cell wall synthesis by binding PBPs' not just 'antibiotic'",
      "indication": "Specifically why this drug for THIS patient — link to diagnosis and symptoms",
      "contraindications": "List specific contraindications relevant to this patient",
      "side_effects": "Most clinically important side effects to monitor",
      "allergy_safe": true | false,
      "allergy_note": "Explain allergy conflict if allergy_safe=false and suggest specific alternative"
    }
  ],
  "alternatives": [
    {
      "drug": "Alternative drug name",
      "dose": "Dose",
      "route": "Route",
      "frequency": "Frequency",
      "duration": "Duration",
      "mechanism_of_action": "MOA",
      "indication": "When to use instead — e.g. 'If patient fails first line' or 'Allergy to penicillin'",
      "contraindications": "Key contraindications",
      "side_effects": "Key side effects",
      "allergy_safe": true | false,
      "allergy_note": ""
    }
  ],
  "allergy_warnings": [
    {
      "drug": "drug that conflicts",
      "allergy": "the documented allergy",
      "risk": "nature of cross-reactivity or direct allergy risk",
      "alternative": "safe specific substitute"
    }
  ],
  "supportive":       ["Immediate supportive measures e.g. IV fluids, oxygen"],
  "non_drug":         ["Non-pharmacological measures e.g. bed rest, dietary advice"],
  "monitoring":       ["Specific parameters to monitor — e.g. BP twice daily, RBS 4-hourly"],
  "follow_up":        "When and what to review at follow-up",
  "patient_advice":   "Key patient education points",
  "red_flags":        ["Symptoms requiring immediate return"],
  "referrals":        ["Specialist referrals if needed"],
  "clinical_reasoning": "Detailed explanation of WHY each first-line drug was selected — link each drug to disease pathology and patient factors"
}

COLUMN ORDER RULE: always present in this order: Drug → Dose → Route → Mechanism of Action → Indication → Contraindications → Side Effects.
Alternatives section must include at least 1-2 drugs as backup options.

${allergyInfo}
${patientContext(patient, encounter)}
WORKING DIAGNOSES: ${JSON.stringify(dxList)}
`.trim();

    const txt = await callLLM(prompt, { json: true, temperature: 0.3, maxOutputTokens: 6000 });
    const obj = parseJson(txt);
    if (obj && (obj.first_line || obj.alternatives)) {
      const meds = (obj.first_line || []).concat(obj.alternatives || []).map(d => ({
        name:               d.drug,
        dose:               d.dose,
        route:              d.route,
        frequency:          d.frequency,
        duration:           d.duration,
        mechanism_of_action:d.mechanism_of_action || d.mechanism || '',
        allergy_safe:       d.allergy_safe !== false,
        allergy_note:       d.allergy_note || '',
        notes: [d.indication, d.contraindications, d.side_effects].filter(Boolean).join(' · '),
      }));
      const plan = {
        immediate:       obj.supportive     || [],
        medications:     meds,
        non_pharm:       obj.non_drug       || [],
        monitoring:      obj.monitoring     || [],
        follow_up:       obj.follow_up      || '',
        patient_advice:  obj.patient_advice || '',
        red_flags:       obj.red_flags      || [],
        referrals:       obj.referrals      || [],
        allergy_warnings:obj.allergy_warnings || [],
      };
      return { plan, structured: obj, source: 'ai' };
    }
  } catch (e) {
    console.warn('[ai] treatment failed:', e.message);
  }

  // -- DB fallback --
  if (dxList.length) {
    try {
      const plan = {
        immediate: [], medications: [], non_pharm: [], monitoring: [],
        follow_up: '', patient_advice: '', red_flags: [], referrals: [], allergy_warnings: [],
      };
      const seen    = new Set();
      let   hasData = false;

      for (const name of dxList) {
        const p = await DB.treatmentFor(name);
        for (const x of p.immediate)  if (!plan.immediate.includes(x))  { plan.immediate.push(x);  hasData = true; }
        for (const x of p.non_pharm)  if (!plan.non_pharm.includes(x))  { plan.non_pharm.push(x);  hasData = true; }
        for (const x of p.monitoring) if (!plan.monitoring.includes(x)) { plan.monitoring.push(x); hasData = true; }
        for (const x of p.red_flags)  if (!plan.red_flags.includes(x))  { plan.red_flags.push(x);  hasData = true; }
        for (const x of p.referrals)  if (!plan.referrals.includes(x))  { plan.referrals.push(x);  hasData = true; }
        if (p.follow_up      && !plan.follow_up)      plan.follow_up      = p.follow_up;
        if (p.patient_advice && !plan.patient_advice) plan.patient_advice = p.patient_advice;
        for (const m of p.medications) {
          const key = `${m.name}|${m.dose}`;
          if (!seen.has(key)) { seen.add(key); plan.medications.push(m); hasData = true; }
        }
      }

      if (hasData) {
        const structured = {
          first_line: plan.medications.map(m => ({
            drug:             m.name,
            dose:             m.dose       || '—',
            route:            m.route      || '—',
            frequency:        m.frequency  || '—',
            duration:         m.duration   || '—',
            mechanism:        '—',
            indication:       dxList.join(', '),
            contraindications:'—',
            side_effects:     m.notes      || '—',
          })),
          alternatives:       [],
          supportive:         plan.immediate,
          non_drug:           plan.non_pharm,
          monitoring:         plan.monitoring,
          follow_up:          plan.follow_up,
          patient_advice:     plan.patient_advice,
          red_flags:          plan.red_flags,
          referrals:          plan.referrals,
          clinical_reasoning: `Treatment selected from the clinical knowledge base for: ${dxList.join(', ')}. Verify against current local guidelines and patient's allergy profile.`,
        };
        return { plan, structured, source: 'db' };
      }
    } catch (e) {
      console.warn('[db] treatment failed:', e.message);
    }
  }

  return {
    plan: { immediate: [], medications: [], non_pharm: [], monitoring: [], follow_up: '', patient_advice: '', red_flags: [], referrals: [] },
    structured: null,
    source: 'none',
  };
}

/* ============================================================
 * 5. RESULT INTERPRETATION
 *    - ALL uploaded files (images, X-rays, PDFs, documents): AI ONLY with type-specific prompts
 *    - Text / lab values: DB range checker + AI enrichment
 * ============================================================ */
async function interpretResult({ patient, encounter, kind, valuesText, filepath, mimeType }) {

  const kindLower     = (kind || '').toLowerCase();
  const isFileBased   = filepath && fs.existsSync(filepath);
  const isImageFile   = filepath && /\.(jpg|jpeg|png|gif|webp|bmp|tiff|dcm)$/i.test(filepath);

  // Detect specific imaging types for tailored prompts
  const isXray       = /x[\s-]?ray|radiograph|cxr|chest\s*film|plain\s*film/i.test(kindLower);
  const isCT         = /\bct\b|computed\s*tom|cat\s*scan/i.test(kindLower);
  const isMRI        = /\bmri\b|magnetic\s*reson/i.test(kindLower);
  const isUltrasound = /\bussd?\b|ultrasound|sonograph|echo/i.test(kindLower);
  const isECG        = /\becg\b|\bekg\b|electrocardiograph/i.test(kindLower);
  const isBlood      = /\bfbc\b|blood\s*count|haem|haemoglobin|wbc|cbc/i.test(kindLower);
  const isUrine      = /\burine\b|urinalysis|u\/e\b|uea\b/i.test(kindLower);
  const isCulture    = /culture|sensitivity|c&s|sensitivity\s*report/i.test(kindLower);
  const isHistology  = /histol|biopsy|patholog|cytol/i.test(kindLower);
  const isPDF        = filepath && /\.pdf$/i.test(filepath);

  // ── Build the type-specific AI prompt ──────────────────────────────
  function buildImagePrompt() {
    let typeSpecific = '';
    if (isXray) {
      typeSpecific = `
This is an X-RAY / RADIOGRAPH. Apply a systematic ABCDE approach:
A = Airways (tracheal position, bronchi)
B = Breathing (lung fields, pneumothorax, effusion, consolidation, infiltrates)
C = Cardiac (heart size, mediastinum, cardiothoracic ratio)
D = Diaphragm (domes, costophrenic angles, free air)
E = Everything else (bones, soft tissues, foreign bodies, lines/tubes)

For each zone, state: NORMAL or describe the specific finding. Note laterality (left/right).
Identify the exact type of X-ray (PA/AP/lateral/supine) if visible.`;
    } else if (isCT) {
      typeSpecific = `
This is a CT SCAN. Report systematically:
- Scan type/region (brain, chest, abdomen, etc.)
- Windows used (if multiple: bone, soft tissue, lung)
- Key structures: identify and describe each region systematically
- Density measurements (HU values) if relevant
- Contrast enhancement pattern if contrast used
- Any masses: size (3 planes), location, density, margins, enhancement`;
    } else if (isMRI) {
      typeSpecific = `
This is an MRI scan. Report systematically:
- Sequence type (T1, T2, FLAIR, DWI, etc.)
- Region imaged
- Signal characteristics of any lesion (hypo/iso/hyperintense on T1 & T2)
- Lesion location, size, margins, mass effect
- Enhancement pattern if contrast
- Any restricted diffusion (DWI/ADC)`;
    } else if (isUltrasound) {
      typeSpecific = `
This is an ULTRASOUND / SONOGRAPH. Report systematically:
- Organ(s) imaged and technique (B-mode, Doppler)
- Size of key organs (with normal range)
- Echogenicity (echogenic, hypoechoic, anechoic, mixed)
- Any masses: size, location, echogenicity, vascularity on Doppler
- Free fluid: presence and location
- Specific findings relevant to clinical context`;
    } else if (isECG) {
      typeSpecific = `
This is an ECG / EKG. Interpret systematically:
- Rate (bpm), Rhythm (regular/irregular)
- P waves: present/absent, morphology, axis
- PR interval (ms) — normal 120-200ms
- QRS complex: duration (ms), morphology, axis
- QT/QTc interval
- ST segment: elevation, depression, location
- T waves: morphology, inversion
- Any blocks (LBBB, RBBB, AV blocks)
- Overall interpretation and clinical correlation`;
    } else if (isHistology) {
      typeSpecific = `
This is a HISTOLOGY / PATHOLOGY / BIOPSY report or image.
- Tissue type and site
- Adequacy of specimen
- Microscopic findings (cell types, architecture)
- Any dysplasia, malignancy, or specific pathological features
- Grade (if applicable)
- Final pathological diagnosis
- Clinical implications`;
    }

    return `
You are an expert clinical radiologist and pathologist. Interpret the attached ${kind || 'medical image/document'} for this patient.
${typeSpecific}

After the systematic analysis, provide a CONCISE CLINICAL SUMMARY and RECOMMENDATIONS.

Output JSON ONLY:
{
  "result_type": "${kind || 'medical image'}",
  "systematic_findings": {
    "zone_or_area_1": "finding description (e.g. Airways: Trachea midline, not deviated)",
    "zone_or_area_2": "finding description",
    "zone_or_area_3": "finding description",
    "additional_zones": "as many as relevant"
  },
  "explanation": "Comprehensive narrative interpretation covering ALL findings systematically — minimum 150 words. Report normally as well as abnormally.",
  "abnormalFindings": ["List each specific abnormal finding as a complete sentence, including location and severity"],
  "normalFindings": ["List key normal findings that are clinically relevant to rule out differentials"],
  "clinicalSignificance": "Explain precisely what these findings mean for THIS specific patient given their clinical context, working diagnosis, and history — minimum 80 words",
  "recommendations": ["Specific next steps based on the findings — further imaging, clinical correlation, follow-up"],
  "abnormal": true | false,
  "urgent": true | false,
  "report_quality": "adequate | limited | inadequate",
  "limitations": "any technical limitations affecting interpretation"
}

${patientContext(patient, encounter)}
RESULT TYPE: ${kind || 'medical image/document'}
MIME TYPE: ${mimeType || 'unknown'}
`.trim();
  }

  // ── ALL file-based results: AI ONLY ───────────────────────────────
  if (isFileBased || isImageFile) {
    try {
      const promptText = buildImagePrompt();
      const parts = [{ text: promptText }];
      // Always attempt to pass the file inline regardless of type
      if (isFileBased) {
        try { parts.push(fileToInlinePart(filepath, mimeType)); } catch {}
      }
      const txt = await callLLM(parts, { json: true, temperature: 0.2, maxOutputTokens: 4096 });
      const obj = parseJson(txt);
      if (obj?.explanation) return { ...obj, source: 'ai' };
    } catch (e) {
      console.warn('[ai] file interpretation failed:', e.message);
    }
    return {
      result_type:          kind || 'uploaded file',
      systematic_findings:  {},
      explanation:          `${kind || 'File'} interpretation could not be completed — the AI engine encountered an error. The file has been stored. Please review manually or retry.`,
      abnormalFindings:     [],
      normalFindings:       [],
      clinicalSignificance: 'Manual review required.',
      recommendations:      ['Review file manually', 'Retry AI interpretation when engine is available'],
      abnormal:             false,
      urgent:               false,
      source:               'unavailable',
    };
  }

  // -- Text / lab values: DB range checker first --
  const text     = (valuesText || '').toLowerCase();
  const findings = [];
  const checks   = [
    { re: /\bwbc\b[^\d]*([\d.]+)/i,            low: 4,    high: 11,  label: 'WBC',         unit: '×10⁹/L' },
    { re: /\bhb\b[^\d]*([\d.]+)/i,             low: 12,   high: 16,  label: 'Haemoglobin', unit: 'g/dL' },
    { re: /\bhaemoglobin\b[^\d]*([\d.]+)/i,    low: 12,   high: 16,  label: 'Haemoglobin', unit: 'g/dL' },
    { re: /\bplt\b[^\d]*([\d.]+)/i,            low: 150,  high: 400, label: 'Platelets',   unit: '×10⁹/L' },
    { re: /\bplatelets\b[^\d]*([\d.]+)/i,      low: 150,  high: 400, label: 'Platelets',   unit: '×10⁹/L' },
    { re: /\bna\b[^\d]*([\d.]+)/i,             low: 135,  high: 145, label: 'Sodium',      unit: 'mmol/L' },
    { re: /\bsodium\b[^\d]*([\d.]+)/i,         low: 135,  high: 145, label: 'Sodium',      unit: 'mmol/L' },
    { re: /\bk\b[^\d]*([\d.]+)/i,              low: 3.5,  high: 5.1, label: 'Potassium',   unit: 'mmol/L' },
    { re: /\bpotassium\b[^\d]*([\d.]+)/i,      low: 3.5,  high: 5.1, label: 'Potassium',   unit: 'mmol/L' },
    { re: /\bcr(?:eatinine)?\b[^\d]*([\d.]+)/i,low: 0.6,  high: 1.3, label: 'Creatinine',  unit: 'mg/dL' },
    { re: /\burea\b[^\d]*([\d.]+)/i,           low: 2.5,  high: 7.5, label: 'Urea',        unit: 'mmol/L' },
    { re: /\bglucose\b[^\d]*([\d.]+)/i,        low: 3.9,  high: 7.8, label: 'Glucose',     unit: 'mmol/L' },
    { re: /\bbgl\b[^\d]*([\d.]+)/i,            low: 3.9,  high: 7.8, label: 'BGL',         unit: 'mmol/L' },
    { re: /\bcrp\b[^\d]*([\d.]+)/i,            low: 0,    high: 10,  label: 'CRP',         unit: 'mg/L' },
    { re: /\balt\b[^\d]*([\d.]+)/i,            low: 7,    high: 56,  label: 'ALT',         unit: 'U/L' },
    { re: /\bast\b[^\d]*([\d.]+)/i,            low: 10,   high: 40,  label: 'AST',         unit: 'U/L' },
  ];

  for (const c of checks) {
    const m = text.match(c.re);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) {
        if (v < c.low)  findings.push({ label: c.label, value: v, unit: c.unit, status: 'LOW',  normal: `${c.low}–${c.high}` });
        if (v > c.high) findings.push({ label: c.label, value: v, unit: c.unit, status: 'HIGH', normal: `${c.low}–${c.high}` });
      }
    }
  }

  const dbResult = {
    explanation: valuesText
      ? `Laboratory values reviewed against standard reference ranges. ${findings.length
          ? findings.map(f => `${f.label} is ${f.status} at ${f.value} ${f.unit} (normal ${f.normal})`).join('; ') + '.'
          : 'All measured values are within normal limits.'}`
      : `A ${kind || 'result'} was uploaded and stored for clinical review.`,
    abnormalFindings:     findings.map(f => `${f.label} ${f.status}: ${f.value} ${f.unit} (normal ${f.normal})`),
    clinicalSignificance: findings.length
      ? `Interpret in the context of the working diagnoses (${(encounter.diagnoses?.chosen || []).join(', ') || 'pending'}). ${
          findings.some(f => f.status === 'HIGH' && f.label === 'CRP') ? 'Elevated CRP suggests active inflammation or infection. ' : ''
        }${findings.some(f => f.label === 'Haemoglobin' && f.status === 'LOW') ? 'Anaemia detected — consider cause. ' : ''
        }${findings.some(f => f.label === 'Glucose' && f.status === 'HIGH') ? 'Hyperglycaemia — consider diabetes or stress response. ' : ''}`
      : 'No deviations from reference ranges detected. Continue clinical correlation.',
    abnormal: findings.length > 0,
    urgent:   findings.some(f =>
      (f.label === 'Sodium'    && (f.value < 125 || f.value > 155)) ||
      (f.label === 'Potassium' && (f.value < 2.5 || f.value > 6.5)) ||
      (f.label === 'Glucose'   && (f.value < 2.5 || f.value > 25))  ||
      (f.label === 'Haemoglobin' && f.value < 6)
    ),
    source: 'db',
  };

  // AI enrichment of text results
  if (valuesText) {
    try {
      const promptText = `
Interpret the following clinical result. Output JSON ONLY:
{
  "explanation": "narrative interpretation",
  "abnormalFindings": ["..."],
  "clinicalSignificance": "what this means for this patient",
  "abnormal": true | false,
  "urgent": true | false
}

${patientContext(patient, encounter)}
RESULT TYPE: ${kind || 'lab result'}
VALUES:
${valuesText}

DB PRE-ANALYSIS (use as a starting point):
${JSON.stringify(dbResult)}
`.trim();
      const txt = await callLLM([{ text: promptText }], { json: true, temperature: 0.25 });
      const obj = parseJson(txt);
      if (obj?.explanation) return { ...obj, source: 'ai' };
    } catch (e) {
      console.warn('[ai] result enrichment failed — using DB result:', e.message);
    }
  }

  return dbResult;
}

/* ============================================================
 * 6. VITALS ABNORMALITIES (deterministic — always works, no AI needed)
 * ============================================================ */
function detectVitalAbnormalities(vitals = {}) {
  const out = [];
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

  const sys = num(vitals.systolic), dia = num(vitals.diastolic);
  if (sys != null) {
    if (sys >= 180)      out.push({ sign: 'BP', detail: `Systolic ${sys} mmHg — hypertensive emergency range`, level: 'critical' });
    else if (sys >= 160) out.push({ sign: 'BP', detail: `Systolic ${sys} mmHg — markedly elevated`, level: 'warning' });
    else if (sys < 90)   out.push({ sign: 'BP', detail: `Systolic ${sys} mmHg — hypotension`, level: 'critical' });
  }
  if (dia != null && dia >= 110) out.push({ sign: 'BP', detail: `Diastolic ${dia} mmHg — severe hypertension`, level: 'warning' });

  const hr = num(vitals.heartRate);
  if (hr != null) {
    if (hr > 130)      out.push({ sign: 'HR', detail: `HR ${hr} bpm — marked tachycardia`, level: 'critical' });
    else if (hr > 100) out.push({ sign: 'HR', detail: `HR ${hr} bpm — tachycardia`, level: 'warning' });
    else if (hr < 50)  out.push({ sign: 'HR', detail: `HR ${hr} bpm — bradycardia`, level: 'warning' });
  }

  const rr = num(vitals.respRate);
  if (rr != null) {
    if (rr >= 30)      out.push({ sign: 'RR', detail: `RR ${rr}/min — severe tachypnoea`, level: 'critical' });
    else if (rr >= 24) out.push({ sign: 'RR', detail: `RR ${rr}/min — tachypnoea`, level: 'warning' });
    else if (rr < 10)  out.push({ sign: 'RR', detail: `RR ${rr}/min — bradypnoea`, level: 'critical' });
  }

  const temp = num(vitals.temperature);
  if (temp != null) {
    if (temp >= 39.5)  out.push({ sign: 'Temp', detail: `Temp ${temp}°C — high fever`, level: 'warning' });
    else if (temp <= 35) out.push({ sign: 'Temp', detail: `Temp ${temp}°C — hypothermia`, level: 'critical' });
  }

  const spo2 = num(vitals.spo2);
  if (spo2 != null) {
    if (spo2 < 90)      out.push({ sign: 'SpO₂', detail: `SpO₂ ${spo2}% — significant hypoxia`, level: 'critical' });
    else if (spo2 < 94) out.push({ sign: 'SpO₂', detail: `SpO₂ ${spo2}% — mild hypoxia`, level: 'warning' });
  }

  const gcs = num(vitals.gcs);
  if (gcs != null && gcs <= 8)        out.push({ sign: 'GCS', detail: `GCS ${gcs} — depressed consciousness`, level: 'critical' });
  else if (gcs != null && gcs <= 12)  out.push({ sign: 'GCS', detail: `GCS ${gcs} — reduced consciousness`, level: 'warning' });

  const bgl = num(vitals.bgl);
  if (bgl != null) {
    if (bgl < 4)       out.push({ sign: 'BGL', detail: `BGL ${bgl} mmol/L — hypoglycaemia`, level: 'critical' });
    else if (bgl > 15) out.push({ sign: 'BGL', detail: `BGL ${bgl} mmol/L — marked hyperglycaemia`, level: 'warning' });
  }
  return out;
}

/* ============================================================
 * 7. PROFESSIONAL CLINICAL REPORT — AI only (narrative writing)
 *    DB has no capacity for narrative report generation.
 * ============================================================ */
async function generateFinalSummary({ patient, encounter, doctorName }) {
  try {
    const prompt = `
Write a comprehensive professional clinical report for the following encounter.
600-1000 words in MARKDOWN. Include all of these sections in this order:

1. **Patient Identification & Demographics**
2. **Presenting Complaint & History of Presenting Illness**
3. **Past Medical, Drug, Family & Social History**
4. **Examination Findings (vitals + systems)**
5. **Working Diagnosis (provisional) and Differential Diagnoses**
6. **Investigations Ordered & Results Available**
7. **Management Plan (table of medications + supportive care + non-drug + monitoring)**
8. **Clinical Reasoning** — why this management for this disease pathology
9. **Patient Education & Follow-up**
10. **Red flags requiring urgent return**
11. **Sign-off:** clinician ${doctorName || '—'}, date ${new Date().toISOString().slice(0, 10)}

Read like a real medical report. Do not invent data.

${patientContext(patient, encounter)}
`.trim();

    const txt = await callLLM(prompt, { temperature: 0.35, maxOutputTokens: 8000 });
    if (txt && txt.length > 400) return txt;
  } catch (e) {
    console.warn('[ai] generateFinalSummary failed:', e.message);
  }
  return `# Clinical Report — AI Unavailable\n\nThe AI report engine is currently offline. Please compile the clinical report manually from the recorded history, examination, diagnosis, and treatment plan above.\n\n**Clinician:** ${doctorName || '—'}  \n**Date:** ${new Date().toISOString().slice(0, 10)}`;
}

/* ============================================================
 * 8. PHASE REPORT — AI only
 * ============================================================ */
async function generatePhaseReport({ phase, patient, encounter, doctorName }) {
  try {
    const prompt = `
Write a 250-500 word clinical narrative for the **${phase}** phase of this encounter.
MARKDOWN. Professional medical language. Do not invent missing data.

${patientContext(patient, encounter)}
Phase: ${phase}
Clinician: ${doctorName || '—'}
`.trim();

    const txt = await callLLM(prompt, { temperature: 0.35, maxOutputTokens: 3500 });
    if (txt && txt.length > 200) return txt;
  } catch (e) {
    console.warn('[ai] generatePhaseReport failed:', e.message);
  }
  return `## ${phase} Phase Summary — AI Unavailable\n\nThe AI report engine is currently offline. Please document the ${phase} phase findings manually.\n\n**Clinician:** ${doctorName || '—'}  \n**Date:** ${new Date().toISOString().slice(0, 10)}`;
}

module.exports = {
  nextHistoryQuestion,
  suggestDiagnoses,
  suggestInvestigations,
  interpretResult,
  detectVitalAbnormalities,
  suggestTreatment,
  generatePhaseReport,
  generateFinalSummary,
  HISTORY_SECTIONS,
callLLM
};
