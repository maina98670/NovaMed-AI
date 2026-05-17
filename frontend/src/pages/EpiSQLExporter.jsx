import { useState, useCallback } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/* ─── tiny fetch wrapper ─── */
async function apiFetch(path) {
  const token = localStorage.getItem("novamed_token") || "";
  const r = await fetch(API_BASE + path, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
  return r.json();
}

/* ─── helpers ─── */
const esc = (v) =>
  v == null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'";

const escArr = (arr) =>
  !Array.isArray(arr) || arr.length === 0
    ? "ARRAY[]::TEXT[]"
    : "ARRAY[" + arr.map((x) => esc(x)).join(", ") + "]";

function pad2(n) { return String(n).padStart(2, "0"); }
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/* ════════════════════════════════════════════════════════════
   SQL GENERATORS — matching your exact schema + template style
════════════════════════════════════════════════════════════ */

function buildHeader(days) {
  return `-- ============================================================
-- NovaMed AI — Epidemiology Export
-- Generated : ${nowStamp()}
-- Period    : Last ${days} days
-- ============================================================
-- HOW TO USE
--   psql -U <user> -d <dbname> -f novamed_epi_export.sql
--   or paste into Admin → SQL Upload
-- ============================================================
`;
}

/* Overview stat comment block */
function buildOverviewBlock(ov) {
  if (!ov) return "";
  return `
-- ─────────────────────────────────────────────────────────
-- OVERVIEW SNAPSHOT  (read-only — informational comments)
-- ─────────────────────────────────────────────────────────
-- Total patients         : ${ov.total_patients ?? 0}
-- Encounters with dx     : ${ov.encounters_with_dx ?? 0}
-- Encounters last 30 d   : ${ov.encounters_30d ?? 0}
-- Encounters last 7 d    : ${ov.encounters_7d ?? 0}
-- Active patients (30 d) : ${ov.active_patients_30d ?? 0}
-- Emergencies (30 d)     : ${ov.emergency_30d ?? 0}
`;
}

/* Diagnoses → diseases table upserts + child rows */
function buildDiagnosesSQL(diagnoses) {
  if (!diagnoses.length) return "\n-- No diagnoses found for this period.\n";

  const lines = [`
-- ─────────────────────────────────────────────────────────
-- DISEASES  (upserted from encounter diagnosis data)
-- Each row represents a distinct diagnosis observed in the
-- selected period.  Keywords, investigations and treatments
-- are NOT included here because they come from the AI; add
-- them manually or via the Admin → Medical Knowledge panel.
-- ─────────────────────────────────────────────────────────
`];

  for (const d of diagnoses) {
    const name     = d.diagnosis_name || "Unknown";
    const icd10    = d.icd10 || null;
    const category = null;   // not known from epi data — fill manually
    const ageGroup = "any";
    const sex      = "any";
    const reasoning = `Observed ${d.case_count} case${d.case_count !== 1 ? "s" : ""} ` +
                      `across ${d.patient_count} patient${d.patient_count !== 1 ? "s" : ""} ` +
                      (d.peak_month ? `(peak: ${d.peak_month})` : "") + ".";
    const redFlags = [];
    if (d.emergency_count > 0) redFlags.push(`${d.emergency_count} emergency encounter${d.emergency_count !== 1 ? "s" : ""} recorded`);

    lines.push(
`INSERT INTO diseases (name, icd10, category, age_group, sex, reasoning, red_flags)
VALUES (
  ${esc(name)},
  ${esc(icd10)},
  ${esc(category)},
  ${esc(ageGroup)},
  ${esc(sex)},
  ${esc(reasoning)},
  ${escArr(redFlags)}
)
ON CONFLICT (name) DO UPDATE
  SET icd10      = COALESCE(EXCLUDED.icd10,   diseases.icd10),
      reasoning  = EXCLUDED.reasoning,
      red_flags  = EXCLUDED.red_flags;
`
    );
  }

  return lines.join("\n");
}

/* Disease keywords — derived from the diagnosis name tokens */
function buildKeywordsSQL(diagnoses) {
  if (!diagnoses.length) return "";
  const lines = [`
-- ─────────────────────────────────────────────────────────
-- DISEASE KEYWORDS  (auto-derived from diagnosis names)
-- These are minimal seed keywords — enrich via Admin panel.
-- ─────────────────────────────────────────────────────────
`];
  for (const d of diagnoses) {
    const name = d.diagnosis_name || "Unknown";
    // split name into meaningful keyword tokens (2+ chars, skip stop words)
    const stop = new Set(["and","the","of","in","due","to","with","without","acute","chronic","unspecified"]);
    const tokens = name.toLowerCase().split(/[\s,\/\-]+/).filter(t => t.length > 2 && !stop.has(t));
    if (!tokens.length) continue;
    const weight = Math.min(3.0, 1.0 + (d.case_count || 1) * 0.1).toFixed(1);

    // Full name as a keyword (highest weight)
    lines.push(
`INSERT INTO disease_keywords (disease_id, keyword, weight, against)
  SELECT id, ${esc(name.toLowerCase())}, ${weight}, FALSE
  FROM diseases WHERE name = ${esc(name)}
ON CONFLICT DO NOTHING;`
    );

    // Individual tokens
    for (const tok of tokens.slice(0, 4)) {
      lines.push(
`INSERT INTO disease_keywords (disease_id, keyword, weight, against)
  SELECT id, ${esc(tok)}, 1.0, FALSE
  FROM diseases WHERE name = ${esc(name)}
ON CONFLICT DO NOTHING;`
      );
    }
  }
  return lines.join("\n") + "\n";
}

/* Symptom synonyms — one per unique diagnosis name alias */
function buildSynonymsSQL(diagnoses) {
  const pairs = [];
  for (const d of diagnoses) {
    const name = (d.diagnosis_name || "").toLowerCase().trim();
    if (!name) continue;
    // If ICD-10 exists, add it as a synonym of the name
    if (d.icd10) {
      pairs.push([name, d.icd10.toLowerCase()]);
    }
  }
  if (!pairs.length) return "";
  const vals = pairs.map(([c, s]) => `  (${esc(c)}, ${esc(s)})`).join(",\n");
  return `
-- ─────────────────────────────────────────────────────────
-- SYMPTOM SYNONYMS  (ICD-10 codes as canonical aliases)
-- ─────────────────────────────────────────────────────────
INSERT INTO symptom_synonyms (canonical, synonym) VALUES
${vals}
ON CONFLICT (canonical, synonym) DO NOTHING;
`;
}

/* Trend data → a custom epi_trends table (create if not exists) */
function buildTrendsSQL(trends, days) {
  if (!trends.length) return "\n-- No trend data for this period.\n";
  const vals = trends.map(t =>
    `  (${esc(t.bucket_date)}, ${Number(t.encounters)||0}, ${Number(t.encounters_dx)||0}, ` +
    `${Number(t.emergencies)||0}, ${Number(t.unique_patients)||0})`
  ).join(",\n");

  return `
-- ─────────────────────────────────────────────────────────
-- EPIDEMIOLOGY TREND LOG
-- Table: epi_trend_snapshots (created if not exists)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epi_trend_snapshots (
    id              SERIAL PRIMARY KEY,
    bucket_date     DATE NOT NULL,
    encounters      INTEGER NOT NULL DEFAULT 0,
    encounters_dx   INTEGER NOT NULL DEFAULT 0,
    emergencies     INTEGER NOT NULL DEFAULT 0,
    unique_patients INTEGER NOT NULL DEFAULT 0,
    period_days     INTEGER NOT NULL DEFAULT ${days},
    exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ets_date ON epi_trend_snapshots (bucket_date DESC);

INSERT INTO epi_trend_snapshots (bucket_date, encounters, encounters_dx, emergencies, unique_patients, period_days) VALUES
${vals};
`;
}

/* Category breakdown → epi_category_snapshots */
function buildCategoriesSQL(categories, days) {
  if (!categories.length) return "\n-- No category data for this period.\n";
  const vals = categories.map(c =>
    `  (${esc(c.category)}, ${Number(c.count)||0})`
  ).join(",\n");

  return `
-- ─────────────────────────────────────────────────────────
-- CATEGORY BREAKDOWN SNAPSHOT
-- Table: epi_category_snapshots (created if not exists)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epi_category_snapshots (
    id          SERIAL PRIMARY KEY,
    category    VARCHAR(80) NOT NULL,
    case_count  INTEGER NOT NULL DEFAULT 0,
    period_days INTEGER NOT NULL DEFAULT ${days},
    exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO epi_category_snapshots (category, case_count, period_days) VALUES
${vals};
`;
}

/* Per-doctor summary → epi_doctor_snapshots */
function buildDoctorsSQL(doctors, days) {
  if (!doctors.length) return "\n-- No clinician data for this period.\n";
  const vals = doctors.map(d =>
    `  (${esc(d.full_name)}, ${esc(d.specialty)}, ` +
    `${Number(d.encounters)||0}, ${Number(d.encounters_dx)||0}, ` +
    `${Number(d.emergencies)||0}, ${Number(d.unique_patients)||0})`
  ).join(",\n");

  return `
-- ─────────────────────────────────────────────────────────
-- CLINICIAN ACTIVITY SNAPSHOT
-- Table: epi_doctor_snapshots (created if not exists)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epi_doctor_snapshots (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150),
    specialty       VARCHAR(100),
    encounters      INTEGER NOT NULL DEFAULT 0,
    encounters_dx   INTEGER NOT NULL DEFAULT 0,
    emergencies     INTEGER NOT NULL DEFAULT 0,
    unique_patients INTEGER NOT NULL DEFAULT 0,
    period_days     INTEGER NOT NULL DEFAULT ${days},
    exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO epi_doctor_snapshots
  (full_name, specialty, encounters, encounters_dx, emergencies, unique_patients, period_days) VALUES
${vals};
`;
}

/* Full diagnosis detail → epi_diagnosis_log */
function buildDiagnosisLogSQL(diagnoses, days) {
  if (!diagnoses.length) return "";
  const vals = diagnoses.map(d =>
    `  (${esc(d.diagnosis_name)}, ${esc(d.icd10)}, ` +
    `${Number(d.case_count)||0}, ${Number(d.patient_count)||0}, ` +
    `${Number(d.male_count)||0}, ${Number(d.female_count)||0}, ` +
    `${Number(d.emergency_count)||0}, ` +
    `${d.avg_age != null ? Number(d.avg_age) : "NULL"}, ` +
    `${Number(d.age_0_4)||0}, ${Number(d.age_5_14)||0}, ` +
    `${Number(d.age_15_24)||0}, ${Number(d.age_25_44)||0}, ` +
    `${Number(d.age_45_64)||0}, ${Number(d.age_65plus)||0}, ` +
    `${esc(d.peak_month)}, ${esc(d.alert_severity)})`
  ).join(",\n");

  return `
-- ─────────────────────────────────────────────────────────
-- FULL DIAGNOSIS LOG  (ranked, with age groups & alerts)
-- Table: epi_diagnosis_log (created if not exists)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epi_diagnosis_log (
    id              SERIAL PRIMARY KEY,
    diagnosis_name  VARCHAR(200) NOT NULL,
    icd10           VARCHAR(20),
    case_count      INTEGER NOT NULL DEFAULT 0,
    patient_count   INTEGER NOT NULL DEFAULT 0,
    male_count      INTEGER NOT NULL DEFAULT 0,
    female_count    INTEGER NOT NULL DEFAULT 0,
    emergency_count INTEGER NOT NULL DEFAULT 0,
    avg_age         NUMERIC(5,1),
    age_0_4         INTEGER NOT NULL DEFAULT 0,
    age_5_14        INTEGER NOT NULL DEFAULT 0,
    age_15_24       INTEGER NOT NULL DEFAULT 0,
    age_25_44       INTEGER NOT NULL DEFAULT 0,
    age_45_64       INTEGER NOT NULL DEFAULT 0,
    age_65plus      INTEGER NOT NULL DEFAULT 0,
    peak_month      VARCHAR(20),
    alert_severity  VARCHAR(10),
    period_days     INTEGER NOT NULL DEFAULT ${days},
    exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_edl_name ON epi_diagnosis_log (LOWER(diagnosis_name));

INSERT INTO epi_diagnosis_log
  (diagnosis_name, icd10, case_count, patient_count,
   male_count, female_count, emergency_count, avg_age,
   age_0_4, age_5_14, age_15_24, age_25_44, age_45_64, age_65plus,
   peak_month, alert_severity, period_days) VALUES
${vals};
`;
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════ */
const PERIODS = [
  { label: "7 days",   val: 7 },
  { label: "30 days",  val: 30 },
  { label: "90 days",  val: 90 },
  { label: "180 days", val: 180 },
];

const SECTIONS = [
  { id: "overview",   label: "Overview snapshot",       desc: "Comment block with aggregate counts" },
  { id: "diseases",   label: "Diseases (upsert)",       desc: "INTO diseases — safe ON CONFLICT upsert" },
  { id: "keywords",   label: "Disease keywords",        desc: "INTO disease_keywords — seed tokens" },
  { id: "synonyms",   label: "Symptom synonyms",        desc: "INTO symptom_synonyms — ICD-10 aliases" },
  { id: "diaglog",    label: "Diagnosis log table",     desc: "epi_diagnosis_log — full ranked detail" },
  { id: "trends",     label: "Trend snapshots",         desc: "epi_trend_snapshots — time-series" },
  { id: "categories", label: "Category snapshots",      desc: "epi_category_snapshots — by disease group" },
  { id: "doctors",    label: "Clinician snapshots",     desc: "epi_doctor_snapshots — per-doctor activity" },
];

export default function EpiSQLExporter() {
  const [days,    setDays]    = useState(30);
  const [enabled, setEnabled] = useState(() => Object.fromEntries(SECTIONS.map(s => [s.id, true])));
  const [status,  setStatus]  = useState("idle");   // idle | loading | done | error
  const [error,   setError]   = useState("");
  const [sql,     setSql]     = useState("");
  const [stats,   setStats]   = useState(null);

  const toggleSection = (id) =>
    setEnabled(e => ({ ...e, [id]: !e[id] }));

  const selectAll = (v) =>
    setEnabled(Object.fromEntries(SECTIONS.map(s => [s.id, v])));

  const generate = useCallback(async () => {
    setStatus("loading");
    setError("");
    setSql("");
    setStats(null);
    try {
      const [ov, dx, tr, cat, doc] = await Promise.all([
        apiFetch(`/api/admin/epidemiology/overview`),
        apiFetch(`/api/admin/epidemiology/top-diagnoses?days=${days}&limit=500`),
        apiFetch(`/api/admin/epidemiology/trends?days=${days}`),
        apiFetch(`/api/admin/epidemiology/category-breakdown?days=${days}`),
        apiFetch(`/api/admin/epidemiology/by-doctor?days=${days}`),
      ]);

      const overview   = ov.overview || null;
      const diagnoses  = dx.diagnoses || [];
      const trends     = tr.trends    || [];
      const categories = cat.categories || [];
      const doctors    = doc.doctors   || [];

      setStats({
        diagnoses:  diagnoses.length,
        trends:     trends.length,
        categories: categories.length,
        doctors:    doctors.length,
      });

      let out = buildHeader(days);
      if (enabled.overview)   out += buildOverviewBlock(overview);
      if (enabled.diseases)   out += buildDiagnosesSQL(diagnoses);
      if (enabled.keywords)   out += buildKeywordsSQL(diagnoses);
      if (enabled.synonyms)   out += buildSynonymsSQL(diagnoses);
      if (enabled.diaglog)    out += buildDiagnosisLogSQL(diagnoses, days);
      if (enabled.trends)     out += buildTrendsSQL(trends, days);
      if (enabled.categories) out += buildCategoriesSQL(categories, days);
      if (enabled.doctors)    out += buildDoctorsSQL(doctors, days);

      out += `\n-- ============================================================\n-- END OF EXPORT\n-- ============================================================\n`;
      setSql(out);
      setStatus("done");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, [days, enabled]);

  const download = () => {
    const date = new Date().toISOString().slice(0,10);
    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `novamed_epi_${date}_${days}d.sql`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = () => navigator.clipboard?.writeText(sql);

  /* ── styles ── */
  const S = {
    wrap: {
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      background: "#0d1117",
      minHeight: "100vh",
      color: "#c9d1d9",
      padding: "32px 24px",
      boxSizing: "border-box",
    },
    header: {
      borderBottom: "1px solid #21262d",
      paddingBottom: 20,
      marginBottom: 28,
    },
    title: {
      margin: 0,
      fontSize: 22,
      fontWeight: 700,
      color: "#58a6ff",
      letterSpacing: "-0.5px",
    },
    subtitle: {
      margin: "4px 0 0",
      fontSize: 12,
      color: "#6e7681",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "280px 1fr",
      gap: 24,
      alignItems: "start",
    },
    panel: {
      background: "#161b22",
      border: "1px solid #21262d",
      borderRadius: 10,
      padding: 20,
    },
    label: {
      fontSize: 11,
      fontWeight: 700,
      color: "#6e7681",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
      display: "block",
    },
    periodRow: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 20,
    },
    periodBtn: (active) => ({
      padding: "5px 14px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      border: active ? "1.5px solid #58a6ff" : "1.5px solid #30363d",
      background: active ? "#1f6feb22" : "transparent",
      color: active ? "#58a6ff" : "#8b949e",
      transition: "all .15s",
    }),
    checkRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "8px 0",
      borderBottom: "1px solid #21262d",
      cursor: "pointer",
    },
    checkbox: (on) => ({
      width: 16,
      height: 16,
      borderRadius: 4,
      border: on ? "2px solid #58a6ff" : "2px solid #30363d",
      background: on ? "#58a6ff22" : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 2,
      transition: "all .15s",
    }),
    btn: (variant) => ({
      padding: "10px 20px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      border: "none",
      background:
        variant === "primary" ? "#1f6feb"
        : variant === "green" ? "#238636"
        : variant === "ghost" ? "#21262d"
        : "#21262d",
      color: variant === "ghost" ? "#8b949e" : "#fff",
      transition: "all .15s",
      display: "flex",
      alignItems: "center",
      gap: 6,
    }),
    statBadge: (color) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 10px",
      borderRadius: 12,
      background: color + "22",
      border: "1px solid " + color + "55",
      color: color,
      fontSize: 11,
      fontWeight: 700,
      marginRight: 8,
    }),
    pre: {
      background: "#0d1117",
      border: "1px solid #21262d",
      borderRadius: 8,
      padding: 16,
      fontSize: 11,
      lineHeight: 1.7,
      overflowX: "auto",
      overflowY: "auto",
      maxHeight: 480,
      color: "#c9d1d9",
      margin: 0,
      whiteSpace: "pre",
      wordBreak: "normal",
    },
    errorBox: {
      background: "#5a0000",
      border: "1px solid #f8514933",
      borderRadius: 8,
      padding: "14px 18px",
      color: "#ff7b72",
      fontSize: 13,
    },
  };

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <h1 style={S.title}>⬡ NovaMed — Epidemiology SQL Exporter</h1>
        <p style={S.subtitle}>
          Pulls live epidemiology data and converts it to importable PostgreSQL — ready to upload.
        </p>
      </div>

      <div style={S.grid}>
        {/* ── Left panel: controls ── */}
        <div>
          <div style={S.panel}>
            <span style={S.label}>Period</span>
            <div style={S.periodRow}>
              {PERIODS.map(p => (
                <button key={p.val} style={S.periodBtn(days === p.val)}
                  onClick={() => setDays(p.val)}>{p.label}</button>
              ))}
            </div>

            <span style={S.label}>Sections to include</span>
            <div style={{ display:"flex", gap:6, marginBottom:12 }}>
              <button style={{ ...S.btn("ghost"), fontSize:11, padding:"3px 10px" }}
                onClick={() => selectAll(true)}>All</button>
              <button style={{ ...S.btn("ghost"), fontSize:11, padding:"3px 10px" }}
                onClick={() => selectAll(false)}>None</button>
            </div>

            {SECTIONS.map(sec => (
              <div key={sec.id} style={S.checkRow} onClick={() => toggleSection(sec.id)}>
                <div style={S.checkbox(enabled[sec.id])}>
                  {enabled[sec.id] && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="#58a6ff" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color: enabled[sec.id]?"#c9d1d9":"#484f58" }}>
                    {sec.label}
                  </div>
                  <div style={{ fontSize:10, color:"#6e7681", marginTop:2 }}>{sec.desc}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop:20 }}>
              <button style={{ ...S.btn("primary"), width:"100%", justifyContent:"center" }}
                onClick={generate} disabled={status==="loading"}>
                {status === "loading"
                  ? "⏳ Fetching data…"
                  : "⚙ Generate SQL"}
              </button>
            </div>
          </div>

          {/* API connection hint */}
          <div style={{ ...S.panel, marginTop:14, fontSize:11, color:"#6e7681", lineHeight:1.7 }}>
            <strong style={{ color:"#8b949e" }}>💡 Note</strong><br/>
            This tool must run on the <strong style={{ color:"#c9d1d9" }}>same domain</strong> as your NovaMed backend,
            or configure <code style={{ color:"#58a6ff" }}>API_BASE</code> at the top of this file.
            Your auth token is read from <code style={{ color:"#58a6ff" }}>localStorage</code> automatically.
          </div>
        </div>

        {/* ── Right panel: output ── */}
        <div>
          {/* Stats row */}
          {stats && (
            <div style={{ marginBottom:14, display:"flex", flexWrap:"wrap", gap:4 }}>
              <span style={S.statBadge("#58a6ff")}>🔬 {stats.diagnoses} diagnoses</span>
              <span style={S.statBadge("#3fb950")}>📈 {stats.trends} trend buckets</span>
              <span style={S.statBadge("#d2a8ff")}>🗂 {stats.categories} categories</span>
              <span style={S.statBadge("#ffa657")}>👨‍⚕️ {stats.doctors} clinicians</span>
            </div>
          )}

          {status === "error" && (
            <div style={S.errorBox}>
              <strong>⚠ Error:</strong> {error}<br/>
              <span style={{ fontSize:11, opacity:.8 }}>
                Check that you are logged in as admin and the backend is reachable.
              </span>
            </div>
          )}

          {status === "done" && sql && (
            <>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <button style={S.btn("green")} onClick={download}>
                  ⬇ Download .sql
                </button>
                <button style={S.btn("ghost")} onClick={copy}>
                  📋 Copy to clipboard
                </button>
                <span style={{ marginLeft:"auto", fontSize:11, color:"#6e7681", alignSelf:"center" }}>
                  {(sql.length/1024).toFixed(1)} KB · {sql.split("\n").length} lines
                </span>
              </div>
              <pre style={S.pre}>{sql}</pre>
            </>
          )}

          {status === "idle" && (
            <div style={{
              ...S.panel,
              minHeight: 320,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              flexDirection:"column",
              gap:12,
              color:"#6e7681",
            }}>
              <span style={{ fontSize:40 }}>🗄</span>
              <span style={{ fontSize:13 }}>Choose a period, select sections, then click <strong style={{ color:"#58a6ff" }}>Generate SQL</strong>.</span>
              <span style={{ fontSize:11 }}>
                The generated file is safe to upload via <strong style={{ color:"#8b949e" }}>Admin → SQL Upload</strong>.
              </span>
            </div>
          )}

          {status === "loading" && (
            <div style={{
              ...S.panel,
              minHeight: 320,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              flexDirection:"column",
              gap:14,
              color:"#8b949e",
            }}>
              <div style={{
                width:40, height:40, border:"3px solid #21262d",
                borderTop:"3px solid #58a6ff", borderRadius:"50%",
                animation:"spin 0.8s linear infinite",
              }}/>
              <span style={{ fontSize:13 }}>Querying all epidemiology endpoints…</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
