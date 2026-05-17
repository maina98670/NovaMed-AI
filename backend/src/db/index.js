// PostgreSQL connection pool — used everywhere via `db.query(...)`
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host:     process.env.PGHOST     || 'localhost',
  port:     process.env.PGPORT     || 5432,
  database: process.env.PGDATABASE || 'novamed',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  // Render Postgres requires SSL in production
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => console.error('PG pool error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
