/**
 * Tests: claims logic — pure/extractable functions
 *
 * We test the parts of claims that don't need a live DB:
 * - SHA claim number generation format
 * - claim status transition validity
 * - line-item total calculation
 *
 * Run: node --test src/tests/claims.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/* ── Inline the pure logic we want to test ──────────────────
   These mirror what claimsService.js does. If you extract
   them to a shared util, import from there instead.
──────────────────────────────────────────────────────────── */

/** Generates a SHA claim reference number */
function generateClaimRef(facilityCode, date = new Date()) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SHA-${facilityCode}-${y}${m}${d}-${rnd}`;
}

/** Valid status transitions for a claim */
const VALID_TRANSITIONS = {
  draft:     ['submitted'],
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'queried', 'rejected'],
  queried:   ['submitted', 'rejected'],
  approved:  ['paid'],
  rejected:  [],
  paid:      [],
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

/** Calculate total from line items */
function calcLineItemTotal(items = []) {
  return items.reduce((sum, item) => {
    const qty  = Number(item.quantity)  || 0;
    const rate = Number(item.unit_rate) || 0;
    return sum + qty * rate;
  }, 0);
}

/* ── Tests ───────────────────────────────────────────────── */

describe('generateClaimRef', () => {
  it('starts with SHA- prefix', () => {
    const ref = generateClaimRef('KNY001');
    assert.ok(ref.startsWith('SHA-KNY001-'));
  });

  it('contains the facility code', () => {
    const ref = generateClaimRef('NRB042');
    assert.ok(ref.includes('NRB042'));
  });

  it('contains a date segment in YYYYMMDD format', () => {
    const date = new Date('2026-03-15');
    const ref  = generateClaimRef('FAC01', date);
    assert.ok(ref.includes('20260315'));
  });

  it('produces unique refs on consecutive calls', () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateClaimRef('FAC01')));
    // With 100 calls and 5-char random suffix, collisions should be essentially impossible
    assert.ok(refs.size > 95);
  });
});

describe('canTransition (claim status)', () => {
  it('draft → submitted is valid', () => {
    assert.ok(canTransition('draft', 'submitted'));
  });

  it('draft → approved is invalid (must go via submitted)', () => {
    assert.ok(!canTransition('draft', 'approved'));
  });

  it('approved → paid is valid', () => {
    assert.ok(canTransition('approved', 'paid'));
  });

  it('paid → anything is invalid (terminal state)', () => {
    assert.ok(!canTransition('paid', 'approved'));
    assert.ok(!canTransition('paid', 'submitted'));
    assert.ok(!canTransition('paid', 'draft'));
  });

  it('rejected → anything is invalid (terminal state)', () => {
    assert.ok(!canTransition('rejected', 'submitted'));
    assert.ok(!canTransition('rejected', 'approved'));
  });

  it('queried → submitted allows resubmission', () => {
    assert.ok(canTransition('queried', 'submitted'));
  });

  it('unknown status → anything returns false safely', () => {
    assert.ok(!canTransition('ghost_status', 'approved'));
  });
});

describe('calcLineItemTotal', () => {
  it('returns 0 for empty items', () => {
    assert.equal(calcLineItemTotal([]), 0);
  });

  it('calculates single item correctly', () => {
    const items = [{ quantity: 3, unit_rate: 500 }];
    assert.equal(calcLineItemTotal(items), 1500);
  });

  it('sums multiple items', () => {
    const items = [
      { quantity: 2, unit_rate: 1000 },
      { quantity: 5, unit_rate: 200 },
      { quantity: 1, unit_rate: 750 },
    ];
    assert.equal(calcLineItemTotal(items), 2000 + 1000 + 750);
  });

  it('handles string numbers from form inputs', () => {
    const items = [{ quantity: '4', unit_rate: '250' }];
    assert.equal(calcLineItemTotal(items), 1000);
  });

  it('treats missing/null values as 0', () => {
    const items = [{ quantity: null, unit_rate: 500 }, { quantity: 2, unit_rate: null }];
    assert.equal(calcLineItemTotal(items), 0);
  });

  it('handles floating point amounts (KES with cents)', () => {
    const items = [{ quantity: 2, unit_rate: 1250.50 }];
    assert.ok(Math.abs(calcLineItemTotal(items) - 2501) < 0.01);
  });
});
