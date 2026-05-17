/**
 * Tests: auth middleware
 *
 * Run: node --test src/tests/auth.test.js
 * (Node 18+ built-in test runner — no extra deps needed)
 *
 * NOTE: requires `npm install` to have been run (jsonwebtoken must be present).
 * In the project root: cd backend && npm install && npm test
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal JWT setup so we can test without a real DB ──
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
const { authRequired, requireRole, signToken } = require('../middleware/auth');

function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body   = body; return this; },
  };
  return res;
}

describe('authRequired', () => {
  it('rejects request with no Authorization header', () => {
    const req  = { headers: {} };
    const res  = mockRes();
    let nextCalled = false;
    authRequired(req, res, () => { nextCalled = true; });
    assert.equal(res._status, 401);
    assert.equal(res._body.ok, false);
    assert.equal(nextCalled, false);
  });

  it('rejects request with malformed token', () => {
    const req  = { headers: { authorization: 'Bearer not-a-jwt' } };
    const res  = mockRes();
    let nextCalled = false;
    authRequired(req, res, () => { nextCalled = true; });
    assert.equal(res._status, 401);
    assert.equal(nextCalled, false);
  });

  it('accepts request with valid token and sets req.user', () => {
    const token = signToken({ id: 42, email: 'doc@test.com', role: 'doctor', full_name: 'Dr Test' });
    const req   = { headers: { authorization: `Bearer ${token}` } };
    const res   = mockRes();
    let nextCalled = false;
    authRequired(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.sub, 42);
    assert.equal(req.user.role, 'doctor');
  });
});

describe('requireRole', () => {
  it('blocks a doctor from an admin-only route', () => {
    const token = signToken({ id: 1, email: 'doc@test.com', role: 'doctor', full_name: 'Dr A' });
    const req   = { headers: { authorization: `Bearer ${token}` } };
    const res   = mockRes();

    // First pass through authRequired to populate req.user
    authRequired(req, res, () => {});

    const guardMiddleware = requireRole('admin');
    let nextCalled = false;
    guardMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 403);
    assert.equal(nextCalled, false);
  });

  it('allows an admin through an admin-only route', () => {
    const token = signToken({ id: 99, email: 'admin@test.com', role: 'admin', full_name: 'Admin' });
    const req   = { headers: { authorization: `Bearer ${token}` } };
    const res   = mockRes();

    authRequired(req, res, () => {});

    const guardMiddleware = requireRole('admin');
    let nextCalled = false;
    guardMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  it('allows multiple accepted roles', () => {
    const token = signToken({ id: 5, email: 'nurse@test.com', role: 'nurse', full_name: 'Nurse B' });
    const req   = { headers: { authorization: `Bearer ${token}` } };
    const res   = mockRes();

    authRequired(req, res, () => {});

    const guardMiddleware = requireRole('doctor', 'nurse', 'admin');
    let nextCalled = false;
    guardMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });
});
