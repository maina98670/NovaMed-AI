-- ============================================================
-- NovaMed AI — SHA / NHIF Claims Schema (v1)
-- Run with: psql -d novamed -f schema_claims.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- FACILITY CONFIG  (one row per deployment)
-- Stores your SHA facility code, name, bank details etc.
-- Admin sets this once via the settings page.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facility_config (
    id                  SERIAL PRIMARY KEY,
    facility_name       VARCHAR(200) NOT NULL,
    sha_facility_code   VARCHAR(30),          -- e.g. 15003456
    nhif_facility_code  VARCHAR(30),
    county              VARCHAR(80),
    sub_county          VARCHAR(80),
    facility_level      VARCHAR(10),          -- 2 | 3 | 4 | 5 | 6
    bank_name           VARCHAR(100),
    bank_branch         VARCHAR(100),
    bank_account        VARCHAR(60),
    contact_phone       VARCHAR(40),
    contact_email       VARCHAR(150),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- ICD-10 QUICK LOOKUP  (loaded from WHO CSV seed)
-- Maps plain-text diagnosis names to ICD-10 codes.
-- AI fallback is used when no direct match exists.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS icd10_codes (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(10) UNIQUE NOT NULL,  -- e.g. J18.9
    description TEXT NOT NULL,               -- Pneumonia, unspecified
    block       VARCHAR(20),                 -- chapter block e.g. J00-J99
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_icd10_code ON icd10_codes (code);
CREATE INDEX IF NOT EXISTS idx_icd10_desc ON icd10_codes USING gin(to_tsvector('english', description));

-- ─────────────────────────────────────────────────────────
-- SHA BENEFIT PACKAGES
-- Kenya's SHA defines 5 packages — store tariff limits here
-- so cost validation can flag over-billing automatically.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sha_benefit_packages (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(10) UNIQUE NOT NULL, -- PCB | CIB | CICB | ECMB | MSB
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    max_amount_kes  NUMERIC(12,2),               -- per episode cap
    requires_preauth BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE
);

-- Seed SHA packages (2024 schedule)
INSERT INTO sha_benefit_packages (code, name, description, max_amount_kes, requires_preauth)
VALUES
  ('PCB',  'Primary Care Benefit',                 'Outpatient at PHC level — consultations, basic labs, essential drugs', 12000,  FALSE),
  ('CIB',  'Common Illness Benefit',               'Specialist outpatient, diagnostic imaging, referrals',                 25000,  FALSE),
  ('CICB', 'Chronic Illness and Cancer Benefit',   'Chronic disease management — diabetes, hypertension, HIV, cancer',    60000,  TRUE),
  ('ECMB', 'Emergency, Critical and Maternal Benefit', 'Emergency care, ANC/PNC, delivery, ICU',                         150000, FALSE),
  ('MSB',  'Major Surgery Benefit',                'Elective and emergency surgery, implants, orthopaedics',              250000, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- CLAIMS  (one per encounter)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
    id                  SERIAL PRIMARY KEY,
    encounter_id        INTEGER UNIQUE NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id          INTEGER NOT NULL REFERENCES patients(id),
    created_by          INTEGER REFERENCES users(id),

    -- SHA / NHIF membership
    sha_member_no       VARCHAR(40),          -- auto-filled from patients.sha_member_no
    nhif_no             VARCHAR(40),          -- legacy NHIF number
    scheme_type         VARCHAR(20) DEFAULT 'SHA'
                        CHECK (scheme_type IN ('SHA','NHIF','PRIVATE','CASH')),

    -- Benefit package (auto-detected from diagnoses)
    benefit_package     VARCHAR(10) REFERENCES sha_benefit_packages(code),
    preauth_code        VARCHAR(40),

    -- Claim amounts (KES)
    consultation_fee    NUMERIC(10,2) DEFAULT 0,
    drugs_total         NUMERIC(10,2) DEFAULT 0,
    labs_total          NUMERIC(10,2) DEFAULT 0,
    imaging_total       NUMERIC(10,2) DEFAULT 0,
    procedures_total    NUMERIC(10,2) DEFAULT 0,
    bed_charges         NUMERIC(10,2) DEFAULT 0,
    other_charges       NUMERIC(10,2) DEFAULT 0,
    grand_total         NUMERIC(10,2) GENERATED ALWAYS AS (
                          consultation_fee + drugs_total + labs_total +
                          imaging_total + procedures_total + bed_charges + other_charges
                        ) STORED,
    sha_payable         NUMERIC(10,2),        -- amount SHA will pay (calc'd from tariff)
    patient_copay       NUMERIC(10,2),        -- remainder owed by patient

    -- Diagnosis codes (auto-mapped)
    primary_icd10       VARCHAR(10),          -- e.g. J18.9
    secondary_icd10     JSONB,                -- ["A09", "E11.9"]

    -- Line items (drugs, labs, procedures) — full detail as JSONB array
    line_items          JSONB NOT NULL DEFAULT '[]',
    /*
      Line item shape:
      {
        type: "drug"|"lab"|"imaging"|"procedure"|"consultation"|"other",
        description: "Amoxicillin 500mg x 21",
        quantity: 21,
        unit_cost: 15,
        total: 315,
        icd10_ref: "J18.9",       -- optional link to diagnosis
        sha_code: "00456"         -- SHA tariff code if known
      }
    */

    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','paid','rejected','cancelled')),
    submission_ref      VARCHAR(60),          -- SHA portal reference on submission
    submitted_at        TIMESTAMPTZ,
    rejection_reason    TEXT,
    notes               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_encounter ON claims (encounter_id);
CREATE INDEX IF NOT EXISTS idx_claims_patient   ON claims (patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_status    ON claims (status);
CREATE INDEX IF NOT EXISTS idx_claims_created   ON claims (created_at DESC);

-- ─────────────────────────────────────────────────────────
-- Extend patients table with insurance fields
-- ─────────────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sha_member_no   VARCHAR(40);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS nhif_no         VARCHAR(40);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS scheme_type     VARCHAR(20) DEFAULT 'SHA';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS employer        VARCHAR(150);

-- ─────────────────────────────────────────────────────────
-- Audit trigger — keep updated_at fresh on claims
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'claims_updated_at'
  ) THEN
    CREATE TRIGGER claims_updated_at
      BEFORE UPDATE ON claims
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

-- Insurance provider fields for PRIVATE scheme claims
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insurance_provider     VARCHAR(80);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insurance_policy_no    VARCHAR(80);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insurance_member_name  VARCHAR(150);

-- Insurance fields on patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_provider     VARCHAR(80);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_policy_no    VARCHAR(80);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_member_name  VARCHAR(150);
