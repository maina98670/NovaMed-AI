// PostgreSQL connection pool — used everywhere via `db.query(...)`
const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';

// Render appends ?sslmode=require to DATABASE_URL which causes pg to set
// ssl = "require" (a string). The 'in' operator then throws on Node 22+.
// Strip it and let pg handle SSL via the ssl option below.
let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
}

const pool = new Pool({
  connectionString,
  host:     process.env.PGHOST     || 'localhost',
  port:     process.env.PGPORT     || 5432,
  database: process.env.PGDATABASE || 'novamed',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  // Render Postgres requires SSL in production
  ssl: isProd ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('PG pool error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
