/**
 * NovaMed AI — OTP service
 * =========================
 * - Generates 6-digit codes
 * - Stores bcrypt-hashed code in `otp_codes` with expiry
 * - Verifies the code presented by the user
 *
 * No external email/SMS; the code is returned to the frontend during dev/demo.
 * In production, set OTP_VISIBLE=false in .env and pipe it to your email
 * provider in `dispatchOtp()`.
 */
const bcrypt = require('bcryptjs');
const db = require('../db');

const OTP_TTL_MIN  = Number(process.env.OTP_TTL_MIN || 10);
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

/**
 * Issue a new OTP for the given email + purpose.
 * Returns { code } so the frontend can show it (since we don't email).
 * In production, replace this with email/SMS dispatch.
 */
async function issueOtp(email, purpose) {
  const normEmail = String(email).trim().toLowerCase();
  const code = generateCode();
  const hash = await bcrypt.hash(code, 8);
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  // Invalidate any earlier unconsumed codes for the same purpose
  await db.query(
    `UPDATE otp_codes SET consumed_at = NOW()
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [normEmail, purpose]
  );

  await db.query(
    `INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [normEmail, hash, purpose, expires]
  );

  return { code, expiresAt: expires };
}

/**
 * Verify a submitted OTP. Returns true on success and consumes it.
 * Increments attempt counter; locks out after MAX_ATTEMPTS.
 */
async function verifyOtp(email, purpose, code) {
  const normEmail = String(email).trim().toLowerCase();
  const submitted = String(code || '').trim();

  if (!/^\d{6}$/.test(submitted)) {
    return { ok: false, error: 'Code must be 6 digits' };
  }

  const { rows } = await db.query(
    `SELECT * FROM otp_codes
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`,
    [normEmail, purpose]
  );
  const otp = rows[0];
  if (!otp) return { ok: false, error: 'No active code. Please request a new one.' };

  if (new Date(otp.expires_at) < new Date()) {
    return { ok: false, error: 'Code has expired. Please request a new one.' };
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  const match = await bcrypt.compare(submitted, otp.code_hash);
  if (!match) {
    await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
    return { ok: false, error: 'Incorrect code' };
  }

  await db.query(`UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1`, [otp.id]);
  return { ok: true };
}

module.exports = { issueOtp, verifyOtp, OTP_TTL_MIN };
