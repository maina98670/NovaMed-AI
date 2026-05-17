/**
 * NovaMed AI — auth routes
 *
 *  Public flow (no admin self-registration):
 *    1. POST /api/auth/otp/request   → backend issues 6-digit OTP, returns it (dev) or stores it
 *    2. POST /api/auth/register      → caller submits OTP + details (role: nurse|doctor|clinician)
 *    3. POST /api/auth/login         → email + password → JWT
 *    4. POST /api/auth/reset/request → request OTP for reset
 *    5. POST /api/auth/reset/confirm → submit OTP + new password
 *    6. GET  /api/auth/me            → current user (JWT)
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { signToken, authRequired } = require('../middleware/auth');
const otp     = require('../services/otpService');

const router = express.Router();

const PUBLIC_ROLES = new Set(['doctor', 'nurse', 'clinician']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================== OTP REQUEST FOR REGISTER ================== */
// POST /api/auth/otp/request   body: { email }
router.post('/otp/request', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Invalid email' });

    // Don't reveal if the email is already taken — but DO actually issue an OTP
    // only when this is for registration AND the email is free.
    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }
    const { code, expiresAt } = await otp.issueOtp(email, 'register');

    // For dev/demo we return the code so the frontend can display it.
    // In production set OTP_VISIBLE=false and integrate email/SMS here.
    const visible = process.env.OTP_VISIBLE !== 'false';
    res.json({
      ok: true,
      message: visible
        ? `Verification code (valid for ${otp.OTP_TTL_MIN} minutes)`
        : 'A verification code has been sent.',
      ...(visible ? { code } : {}),
      expiresAt,
    });
  } catch (e) {
    console.error('otp/request', e);
    res.status(500).json({ ok: false, error: 'Could not issue code' });
  }
});

/* ================== REGISTER ================== */
// POST /api/auth/register   body: { full_name, email, password, role, specialty, otp }
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, role, specialty, otp: code } = req.body || {};
    const normEmail = String(email || '').trim().toLowerCase();

    if (!full_name || !normEmail || !password) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    if (!EMAIL_RE.test(normEmail)) return res.status(400).json({ ok: false, error: 'Invalid email' });
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }
    if (!PUBLIC_ROLES.has(role)) {
      return res.status(400).json({ ok: false, error: 'Please choose a role: nurse, doctor or clinician' });
    }

    // Verify OTP
    const v = await otp.verifyOtp(normEmail, 'register', code);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(`
      INSERT INTO users (full_name, email, password_hash, role, specialty, is_verified)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id, full_name, email, role, specialty
    `, [full_name.trim(), normEmail, hash, role, specialty || null]);

    res.json({ ok: true, user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Email already registered' });
    console.error('register', e);
    res.status(500).json({ ok: false, error: 'Registration failed' });
  }
});

/* ================== LOGIN ================== */
// POST /api/auth/login    body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required' });

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    if (user.is_active === false) {
      return res.status(403).json({ ok: false, error: 'Your account has been disabled. Please contact the administrator.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Audit-log every admin login + console alert
    if (user.role === 'admin') {
      const ip   = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
      const ua   = req.headers['user-agent'] || '';
      console.log(`\n  [admin-login]  ${user.email}  from ${ip}  at ${new Date().toISOString()}\n`);
      try {
        await db.query(
          `INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES ($1, 'admin.login', 'user', $2, $3)`,
          [user.id, user.id, JSON.stringify({ ip, ua, at: new Date() })]
        );
      } catch {}
    }

    const token = signToken(user);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id, full_name: user.full_name, email: user.email,
        role: user.role, specialty: user.specialty,
      },
    });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ ok: false, error: 'Login failed' });
  }
});

/* ================== PASSWORD RESET ================== */
// POST /api/auth/reset/request   body: { email }
router.post('/reset/request', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Invalid email' });

    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No account found for that email' });

    const { code, expiresAt } = await otp.issueOtp(email, 'reset');
    const visible = process.env.OTP_VISIBLE !== 'false';
    res.json({
      ok: true,
      message: visible ? `Reset code (valid for ${otp.OTP_TTL_MIN} minutes)` : 'Reset code sent.',
      ...(visible ? { code } : {}),
      expiresAt,
    });
  } catch (e) {
    console.error('reset/request', e);
    res.status(500).json({ ok: false, error: 'Could not issue code' });
  }
});

// POST /api/auth/reset/confirm   body: { email, otp, newPassword }
router.post('/reset/confirm', async (req, res) => {
  try {
    const { email, otp: code, newPassword } = req.body || {};
    const normEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(normEmail)) return res.status(400).json({ ok: false, error: 'Invalid email' });
    if (String(newPassword || '').length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }
    const v = await otp.verifyOtp(normEmail, 'reset', code);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    const hash = await bcrypt.hash(newPassword, 10);
    const r = await db.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id`,
      [hash, normEmail]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Account not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('reset/confirm', e);
    res.status(500).json({ ok: false, error: 'Reset failed' });
  }
});

/* ================== GOOGLE OAUTH ================== */

/**
 * GET /api/auth/google
 * Redirects user to Google's consent screen.
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL in .env
 */
router.get('/google', (req, res) => {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback';

  if (!clientId || clientId === 'your-google-client-id.apps.googleusercontent.com') {
    return res.status(503).json({
      ok: false,
      error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env',
    });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/**
 * GET /api/auth/google/callback
 * Google redirects here with ?code=...
 * We exchange the code for tokens, resolve the user, issue a NovaMed JWT,
 * then redirect the frontend to /dashboard with the token in the URL hash.
 */
router.get('/google/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const { code, error } = req.query;

    if (error || !code) {
      console.error('[google/callback] OAuth error:', error);
      return res.redirect(`${frontendUrl}/login?error=google_denied`);
    }

    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl  = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback';

    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  callbackUrl,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.id_token) {
      console.error('[google/callback] No id_token in response:', tokenData);
      return res.redirect(`${frontendUrl}/login?error=google_token_failed`);
    }

    // 2. Decode the id_token (Google signs it; for production verify with Google's public keys)
    const [, payloadB64] = tokenData.id_token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const { email, name, email_verified } = payload;

    if (!email_verified) {
      return res.redirect(`${frontendUrl}/login?error=google_email_unverified`);
    }

    // 3. Find or create the user in the DB
    let { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    let user = rows[0];

    if (!user) {
      // Auto-create: role defaults to 'doctor' — admin can change it later
      const { rows: created } = await db.query(`
        INSERT INTO users (full_name, email, password_hash, role, is_verified, google_id)
        VALUES ($1, $2, $3, 'doctor', TRUE, $4)
        RETURNING *
      `, [name || email, email.toLowerCase(), '', payload.sub]);
      user = created[0];
    } else if (!user.google_id) {
      // Link google_id if missing
      await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [payload.sub, user.id]);
    }

    if (user.is_active === false) {
      return res.redirect(`${frontendUrl}/login?error=account_disabled`);
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 4. Issue NovaMed JWT and redirect to frontend
    const token = signToken(user);
    res.redirect(`${frontendUrl}/auth/google/callback#token=${token}`);

  } catch (err) {
    console.error('[google/callback] Unexpected error:', err);
    res.redirect(`${frontendUrl}/login?error=google_server_error`);
  }
});

/* ================== ME ================== */
router.get('/me', authRequired, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, full_name, email, role, specialty FROM users WHERE id = $1',
    [req.user.sub]
  );
  res.json({ ok: true, user: rows[0] || null });
});

module.exports = router;
