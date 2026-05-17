/**
 * NovaMed AI — create / reset the super admin account.
 *
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env and ensures one
 * admin user exists in the database. Admin is invisible on the
 * frontend (registration form has no admin option).
 *
 * Run via:  node src/db/seedAdmin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');

(async () => {
  const email = (process.env.ADMIN_EMAIL || 'admin@novamed.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) { console.error('ADMIN_PASSWORD env var not set — skipping admin seed'); return; }
  const fullName = process.env.ADMIN_NAME || 'System Administrator';

  console.log(`Ensuring super admin: ${email}`);

  const hash = await bcrypt.hash(password, 10);

  await db.query(`
    INSERT INTO users (full_name, email, password_hash, role, is_verified)
    VALUES ($1, $2, $3, 'admin', TRUE)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role          = 'admin',
          is_verified   = TRUE,
          full_name     = EXCLUDED.full_name
  `, [fullName, email, hash]);

  console.log('✓ Admin ready.');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('  ⚠ Change ADMIN_PASSWORD in .env for production.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
