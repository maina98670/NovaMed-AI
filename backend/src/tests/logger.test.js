/**
 * Tests: logger service
 *
 * Run: node --test src/tests/logger.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('logger', () => {
  let logger;

  before(() => {
    process.env.NODE_ENV = 'test';
    logger = require('../services/logger');
  });

  it('exports info, warn, error, wrap functions', () => {
    assert.equal(typeof logger.info,  'function');
    assert.equal(typeof logger.warn,  'function');
    assert.equal(typeof logger.error, 'function');
    assert.equal(typeof logger.wrap,  'function');
  });

  it('logger.info does not throw', () => {
    assert.doesNotThrow(() => logger.info('test.event', { key: 'value' }));
  });

  it('logger.warn does not throw', () => {
    assert.doesNotThrow(() => logger.warn('test.warning', { detail: 'x' }));
  });

  it('logger.error handles Error objects', () => {
    const err = new Error('something broke');
    assert.doesNotThrow(() => logger.error('test.failure', err, { userId: 1 }));
  });

  it('logger.error handles non-Error values gracefully', () => {
    assert.doesNotThrow(() => logger.error('test.failure', 'string error', {}));
    assert.doesNotThrow(() => logger.error('test.failure', null, {}));
  });

  it('logger.wrap returns a function', () => {
    const handler = async (req, res) => res.json({ ok: true });
    const wrapped = logger.wrap(handler);
    assert.equal(typeof wrapped, 'function');
  });

  it('logger.wrap calls next(err) on async throw', async () => {
    const err = new Error('async failure');
    const handler = async () => { throw err; };
    const wrapped = logger.wrap(handler);

    let caughtErr = null;
    await new Promise(resolve => {
      wrapped({}, {}, (e) => { caughtErr = e; resolve(); });
    });

    assert.equal(caughtErr, err);
  });

  it('logger.wrap passes through successful handler', async () => {
    let resCalled = false;
    const handler = async (req, res) => { resCalled = true; };
    const wrapped = logger.wrap(handler);

    await new Promise(resolve => {
      wrapped({}, { json: () => {} }, () => {});
      setTimeout(resolve, 10);
    });

    assert.equal(resCalled, true);
  });
});
