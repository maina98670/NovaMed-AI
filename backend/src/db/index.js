// PostgreSQL connection pool — used everywhere via `db.query(...)`
const { Pool } = require('pg');

// Use internal Render DB URL (no SSL needed on private network)
// If DATABASE_URL is not set, fall back to individual env vars
const DATABASE_URL = process.env.DATABASE_URL;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: false,   // Internal Render URL — private network, no SSL
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : new Pool({
      host:     process.env.PGHOST     || 'localhost',
      port:     parseInt(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'novamed',
      user:     process.env.PGUSER     || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
    });

pool.on('error', (err) => console.error('PG pool error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
