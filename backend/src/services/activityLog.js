const db = require('../db');

/**
 * Log a patient-related action and bump the patient.last_activity_at.
 * Failures are swallowed — activity logging must never break user flow.
 */
async function logActivity({ patient_id, encounter_id = null, user_id = null, action, detail = null }) {
  try {
    await db.query(
      `INSERT INTO patient_activity (patient_id, encounter_id, user_id, action, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [patient_id, encounter_id, user_id, action, detail]
    );
    await db.query(
      `UPDATE patients SET last_activity_at = NOW() WHERE id = $1`,
      [patient_id]
    );
  } catch (e) {
    console.warn('[activity] failed:', e.message);
  }
}

module.exports = { logActivity };
