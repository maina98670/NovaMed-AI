-- ============================================================
-- NovaMed AI — PostgreSQL schema (v2 — secure & dynamic)
-- Run with:  node src/db/init.js
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- USERS  (clinicians: doctor / nurse / clinician / admin)
-- ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(30) NOT NULL DEFAULT 'doctor',
    specialty       VARCHAR(100),
    is_verified     BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v3 upgrade: add columns / constraints to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('doctor','nurse','clinician','admin'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- OTP CODES  (6-digit codes for register / password reset)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(150) NOT NULL,
    code_hash       TEXT NOT NULL,           -- bcrypt hash of the 6-digit code
    purpose         VARCHAR(30) NOT NULL,    -- 'register' | 'reset'
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_codes (email, purpose, consumed_at);

-- ─────────────────────────────────────────────────────────
-- PATIENTS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id                 SERIAL PRIMARY KEY,
    patient_id         VARCHAR(20) UNIQUE NOT NULL,
    full_name          VARCHAR(150) NOT NULL,
    date_of_birth      DATE,
    sex                VARCHAR(10),
    phone              VARCHAR(40),
    email              VARCHAR(150),
    national_id        VARCHAR(60),
    address            TEXT,
    blood_group        VARCHAR(10),
    allergies          TEXT,
    chronic_conditions TEXT,
    next_of_kin        VARCHAR(150),
    next_of_kin_phone  VARCHAR(40),
    created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (full_name);
CREATE INDEX IF NOT EXISTS idx_patients_pid  ON patients (patient_id);

-- v3 upgrade: add new columns to an existing patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_patients_creator ON patients (created_by);
CREATE INDEX IF NOT EXISTS idx_patients_activity ON patients (last_activity_at DESC);

-- ─────────────────────────────────────────────────────────
-- ENCOUNTERS  (one clinical episode)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encounters (
    id              SERIAL PRIMARY KEY,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    chief_complaint TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'history',
    case_category   VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (case_category IN ('pending','completed','emergency')),
    history_type    VARCHAR(50),
    input_mode      VARCHAR(20) DEFAULT 'form',
    history_summary TEXT,
    examination     JSONB,
    diagnoses       JSONB,
    investigations  JSONB,
    results         JSONB,
    warnings        JSONB,
    treatment_plan  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_encounters_patient  ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_status   ON encounters (status);

-- v3 upgrade: add case_category to existing encounters table
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS case_category VARCHAR(20) NOT NULL DEFAULT 'pending';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'encounters_case_category_check') THEN
    ALTER TABLE encounters ADD CONSTRAINT encounters_case_category_check
      CHECK (case_category IN ('pending','completed','emergency'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_encounters_category ON encounters (case_category);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor   ON encounters (doctor_id);

-- ─────────────────────────────────────────────────────────
-- HISTORY TURNS (adaptive Q&A)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS history_turns (
    id              SERIAL PRIMARY KEY,
    encounter_id    INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    role            VARCHAR(15) NOT NULL,
    section         VARCHAR(60),
    question        TEXT,
    answer          TEXT,
    meta            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_turns_enc ON history_turns (encounter_id);

-- ─────────────────────────────────────────────────────────
-- UPLOADS (X-rays, lab PDFs etc.)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
    id              SERIAL PRIMARY KEY,
    encounter_id    INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id      INTEGER REFERENCES patients(id)   ON DELETE CASCADE,
    kind            VARCHAR(40) NOT NULL,
    original_name   VARCHAR(300),
    stored_path     VARCHAR(400) NOT NULL,
    mime_type       VARCHAR(120),
    size_bytes      INTEGER,
    interpretation  TEXT,
    abnormal        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploads_enc ON uploads (encounter_id);

-- ─────────────────────────────────────────────────────────
-- PATIENT ACTIVITY LOG  (timestamped audit trail)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_activity (
    id              SERIAL PRIMARY KEY,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(80) NOT NULL,
    detail          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pa_patient ON patient_activity (patient_id, created_at DESC);

-- ─────────────────────────────────────────────────────────
-- AUDIT LOG (system-wide)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(80) NOT NULL,
    entity          VARCHAR(60),
    entity_id       INTEGER,
    detail          JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═════════════════════════════════════════════════════════
-- MEDICAL KNOWLEDGE TABLES (DB-driven; no hardcoded logic)
-- ═════════════════════════════════════════════════════════

-- Diseases / conditions
CREATE TABLE IF NOT EXISTS diseases (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200) UNIQUE NOT NULL,
    icd10               VARCHAR(20),
    category            VARCHAR(80),       -- e.g. 'Cardiovascular'
    age_group           VARCHAR(40),       -- 'adult','pediatric','any'
    sex                 VARCHAR(10) DEFAULT 'any',
    description         TEXT,
    reasoning           TEXT,              -- one-line clinical reasoning
    red_flags           TEXT[],            -- features that must not be missed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diseases_name ON diseases (LOWER(name));

-- Symptoms
CREATE TABLE IF NOT EXISTS symptoms (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) UNIQUE NOT NULL,
    body_system     VARCHAR(80),
    description     TEXT
);

-- Disease ↔ Symptom (with weight for scoring)
CREATE TABLE IF NOT EXISTS disease_symptoms (
    disease_id      INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
    symptom_id      INTEGER NOT NULL REFERENCES symptoms(id) ON DELETE CASCADE,
    weight          NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    PRIMARY KEY (disease_id, symptom_id)
);
CREATE INDEX IF NOT EXISTS idx_ds_disease ON disease_symptoms (disease_id);
CREATE INDEX IF NOT EXISTS idx_ds_symptom ON disease_symptoms (symptom_id);

-- Disease keywords (for matching free-text history/exam)
CREATE TABLE IF NOT EXISTS disease_keywords (
    id              SERIAL PRIMARY KEY,
    disease_id      INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
    keyword         VARCHAR(150) NOT NULL,
    weight          NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    against         BOOLEAN NOT NULL DEFAULT FALSE  -- TRUE = subtract weight
);
CREATE INDEX IF NOT EXISTS idx_dk_disease  ON disease_keywords (disease_id);
CREATE INDEX IF NOT EXISTS idx_dk_keyword  ON disease_keywords (LOWER(keyword));

-- Investigations linked to diseases
CREATE TABLE IF NOT EXISTS disease_investigations (
    id              SERIAL PRIMARY KEY,
    disease_id      INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
    category        VARCHAR(30) NOT NULL,    -- 'lab' | 'imaging' | 'bedside' | 'specialist'
    test            VARCHAR(200) NOT NULL,
    reason          TEXT
);
CREATE INDEX IF NOT EXISTS idx_di_disease ON disease_investigations (disease_id);

-- Treatments linked to diseases
CREATE TABLE IF NOT EXISTS disease_treatments (
    id              SERIAL PRIMARY KEY,
    disease_id      INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL,   -- 'immediate'|'medication'|'non_pharm'|'monitoring'|'advice'|'red_flag'|'referral'
    item            TEXT NOT NULL,
    dose            VARCHAR(120),
    route           VARCHAR(60),
    frequency       VARCHAR(80),
    duration        VARCHAR(80),
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_dt_disease ON disease_treatments (disease_id);

-- Adaptive question bank
CREATE TABLE IF NOT EXISTS history_questions (
    id              SERIAL PRIMARY KEY,
    section         VARCHAR(60) NOT NULL,   -- HPC / PMH / DH / FH / SH / ROS
    question        TEXT NOT NULL,
    triggers        TEXT[],                 -- prior keywords/answers that should trigger this
    importance      INTEGER NOT NULL DEFAULT 5,
    follow_up_for   VARCHAR(200)            -- optional: "chest pain"
);
CREATE INDEX IF NOT EXISTS idx_qb_section ON history_questions (section);

-- ─────────────────────────────────────────────────────────
-- AUTO updated_at TRIGGER
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_encounters_updated ON encounters;
CREATE TRIGGER trg_encounters_updated BEFORE UPDATE ON encounters
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────────────────
-- Patient ID generator (NM-2026-000001)
-- ─────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS patient_id_seq START 1;
CREATE OR REPLACE FUNCTION generate_patient_id() RETURNS TEXT AS $$
DECLARE
    n INTEGER;
BEGIN
    n := nextval('patient_id_seq');
    RETURN 'NM-' || to_char(NOW(), 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────
-- SYMPTOM SYNONYMS
-- Canonical terms map to alternate spellings / abbreviations
-- so the DB scoring engine recognises any way a doctor writes
-- a symptom (e.g. "sob" = "shortness of breath")
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptom_synonyms (
    id          SERIAL PRIMARY KEY,
    canonical   VARCHAR(150) NOT NULL,   -- must match disease_keywords exactly
    synonym     VARCHAR(150) NOT NULL,   -- alternate spelling / abbreviation
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (canonical, synonym)
);
CREATE INDEX IF NOT EXISTS idx_ss_canonical ON symptom_synonyms (LOWER(canonical));
CREATE INDEX IF NOT EXISTS idx_ss_synonym   ON symptom_synonyms (LOWER(synonym));

-- ─────────────────────────────────────────────────────────
-- FACILITY CONFIG  (hospital / clinic details, set via admin panel)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facility_config (
    id                 SERIAL PRIMARY KEY,
    facility_name      VARCHAR(200) NOT NULL DEFAULT 'NovaMed Health Facility',
    sha_number         VARCHAR(80),           -- SHA facility registration number
    sha_facility_code  VARCHAR(40),           -- SHA short billing code
    facility_level     VARCHAR(10) DEFAULT '4', -- 2, 3, 4, 5, 6
    address            TEXT,
    phone              VARCHAR(40),
    email              VARCHAR(150),
    county             VARCHAR(80),
    sub_county         VARCHAR(80),
    logo_path          TEXT,                  -- relative path to uploaded logo
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure exactly one row always exists
INSERT INTO facility_config (facility_name)
  SELECT 'NovaMed Health Facility' WHERE NOT EXISTS (SELECT 1 FROM facility_config);

-- ─────────────────────────────────────────────────────────
-- SHA TARIFF OVERRIDES  (admin-editable per-keyword tariffs)
-- Overrides the hardcoded SHA_TARIFFS in claimsService.js
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sha_tariff_overrides (
    id          SERIAL PRIMARY KEY,
    keyword     VARCHAR(150) NOT NULL UNIQUE, -- lowercase match keyword
    sha_code    VARCHAR(30)  NOT NULL,        -- e.g. LAB-010
    description VARCHAR(200),                 -- human-readable label
    amount_kes  NUMERIC(10,2) NOT NULL,       -- tariff amount in KES
    category    VARCHAR(30) DEFAULT 'lab',    -- lab | imaging | drug | procedure | consultation
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sha_tariff_keyword ON sha_tariff_overrides (LOWER(keyword));

-- Seed default overrides for common electrolyte / lab tests
INSERT INTO sha_tariff_overrides (keyword, sha_code, description, amount_kes, category) VALUES
  ('u&e',                    'LAB-010', 'Urea & Electrolytes',           500,  'lab'),
  ('rft',                    'LAB-010', 'Renal Function Tests',          500,  'lab'),
  ('renal function',         'LAB-010', 'Renal Function Panel',          500,  'lab'),
  ('electrolytes',           'LAB-010', 'Serum Electrolytes',            500,  'lab'),
  ('sodium',                 'LAB-010', 'Serum Sodium',                  500,  'lab'),
  ('potassium',              'LAB-010', 'Serum Potassium',               500,  'lab'),
  ('chloride',               'LAB-010', 'Serum Chloride',                500,  'lab'),
  ('bicarbonate',            'LAB-010', 'Serum Bicarbonate',             500,  'lab'),
  ('fbc',                    'LAB-002', 'Full Blood Count',              500,  'lab'),
  ('cbc',                    'LAB-002', 'Complete Blood Count',          500,  'lab'),
  ('haemoglobin',            'LAB-002', 'Haemoglobin Level',             500,  'lab'),
  ('lft',                    'LAB-006', 'Liver Function Tests',          600,  'lab'),
  ('tsh',                    'LAB-014', 'Thyroid Stimulating Hormone',   800,  'lab'),
  ('hba1c',                  'LAB-012', 'Glycated Haemoglobin (HbA1c)', 700,  'lab'),
  ('genexpert',              'LAB-019', 'GeneXpert MTB/RIF',            1500, 'lab'),
  ('viral load',             'LAB-017', 'HIV Viral Load',               3500, 'lab'),
  ('cd4',                    'LAB-016', 'CD4 Count',                     900,  'lab'),
  ('echo',                   'IMG-006', 'Echocardiogram',               5000, 'imaging'),
  ('echocardiogram',         'IMG-006', 'Echocardiogram',               5000, 'imaging')
ON CONFLICT (keyword) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- SHA TARIFF SCHEDULE TABLES
-- Populated by uploading sha_tariffs.sql via Admin → SHA Tariffs
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benefit_packages (
    id         SERIAL PRIMARY KEY,
    fund       VARCHAR(100) NOT NULL,
    package    VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tariff_items (
    id            SERIAL PRIMARY KEY,
    package_id    INT REFERENCES benefit_packages(id),
    service_name  VARCHAR(300) NOT NULL,
    access_point  VARCHAR(200),
    tariff_amount NUMERIC(12,2),
    tariff_unit   VARCHAR(100),
    ppm           VARCHAR(100),
    limit_notes   TEXT,
    access_rules  TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surgical_procedures (
    id             SERIAL PRIMARY KEY,
    specialty      VARCHAR(100) NOT NULL,
    procedure_name VARCHAR(300) NOT NULL,
    tariff_kes     NUMERIC(12,2) NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Google OAuth support
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
