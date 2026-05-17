/**
 * NovaMed — Structured Logger
 *
 * In production, errors are written as JSON so log aggregators
 * (Render log drains, Papertrail, Datadog, etc.) can parse them.
 * In development, pretty-prints to the console.
 *
 * Usage:
 *   const logger = require('./services/logger');
 *   logger.info('encounter.created', { encounterId: 123 });
 *   logger.warn('ai.slow_response', { ms: 4200 });
 *   logger.error('claims.submit_failed', error, { claimId: 99 });
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const SVC     = process.env.SERVICE_NAME || 'novamed-backend';

function _write(level, event, meta = {}) {
  if (IS_PROD) {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, svc: SVC, event, ...meta }) + '\n'
    );
  } else {
    const prefix = { info: '🔵', warn: '🟡', error: '🔴' }[level] || '⚪';
    const extra  = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    console.log(`${prefix} [${level.toUpperCase()}] ${event}${extra}`);
  }
}

const logger = {
  info(event, meta = {}) {
    _write('info', event, meta);
  },

  warn(event, meta = {}) {
    _write('warn', event, meta);
  },

  /**
   * @param {string}  event  - dot-namespaced label, e.g. 'claims.submit_failed'
   * @param {Error}   err    - the thrown error
   * @param {object}  meta   - extra context (route, ids, user, etc.)
   */
  error(event, err, meta = {}) {
    _write('error', event, {
      message : err?.message || String(err),
      stack   : IS_PROD ? undefined : err?.stack,
      code    : err?.code,        // pg error codes, etc.
      status  : err?.status,
      ...meta,
    });
  },

  /** Wraps an async Express handler; catches unhandled throws and forwards to next(err) */
  wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  },
};

module.exports = logger;
