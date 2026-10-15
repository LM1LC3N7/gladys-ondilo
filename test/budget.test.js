// -----------------------------------------------------------------------------
// The request budget: a sliding hour and a gap between two requests.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestBudget } from '../src/budget.js';
import { LIMITS } from '../src/constants.js';

const HOUR = 3_600_000;

test('the default budget keeps a third of the Ondilo quota (30/h) free', () => {
  assert.equal(new RequestBudget().remaining(), LIMITS.requestsPerHour);
  assert.ok(LIMITS.requestsPerHour <= 20);
  assert.ok(LIMITS.requestGap >= 200, 'Ondilo allows 5 requests per second');
});

test('a sliding hour', () => {
  let now = 0;
  const budget = new RequestBudget({ now: () => now, perHour: 3, gap: 500 });
  assert.equal(budget.spend(), true);
  now = 10 * 60_000;
  assert.equal(budget.spend(), true);
  assert.equal(budget.spend(), true);
  assert.equal(budget.remaining(), 0);
  assert.equal(budget.spend(), false);
  assert.equal(budget.untilFree(), HOUR - 10 * 60_000, 'the first request leaves the window');
  now = HOUR;
  assert.equal(budget.remaining(), 1);
  assert.equal(budget.untilFree(), 0);
});

test('a gap between two requests', () => {
  let now = 0;
  const budget = new RequestBudget({ now: () => now, perHour: 10, gap: 500 });
  assert.equal(budget.wait(), 0);
  budget.spend();
  assert.equal(budget.wait(), 500);
  now = 200;
  assert.equal(budget.wait(), 300);
  now = 900;
  assert.equal(budget.wait(), 0);
});
