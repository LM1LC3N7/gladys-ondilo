// -----------------------------------------------------------------------------
// Reading the Ondilo answers: dates, measures, recommendations, and the pace
// of the next read.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, TIMINGS } from '../src/constants.js';
import {
  latestMeasures,
  newestTime,
  nextMeasureRead,
  parseTime,
  readRecommendations,
  recommendationsText,
} from '../src/measures.js';
import { FILTER, PH_DOWN, poolMeasures, spaMeasures } from './fixtures/ondilo.js';

const MINUTE = 60_000;

test('the Ondilo dates (+0000) are read', () => {
  assert.equal(parseTime('2020-03-23T16:08:51+0000'), Date.parse('2020-03-23T16:08:51Z'));
  assert.equal(parseTime('2020-03-23T18:08:51+0200'), Date.parse('2020-03-23T16:08:51Z'));
  assert.equal(parseTime('2020-03-23T16:08:51Z'), Date.parse('2020-03-23T16:08:51Z'));
  assert.equal(parseTime('yesterday'), undefined);
  assert.equal(parseTime(null), undefined);
});

test('the newest valid measure of each type', () => {
  const measures = latestMeasures([
    ...poolMeasures('2026-07-14T08:49:00+0000', 25),
    ...poolMeasures('2026-07-14T09:49:00+0000', 26),
    { data_type: 'conductivity', value: 3, value_time: '2026-07-14T09:49:00+0000' },
    { data_type: 'ph', value: null, value_time: '2026-07-14T10:49:00+0000', is_valid: true },
    { data_type: 'orp', value: '700', value_time: 'garbage', is_valid: true },
  ]);
  assert.deepEqual([...measures.keys()], ['temperature', 'ph', 'orp', 'salt', 'battery', 'rssi']);
  assert.deepEqual(measures.get('temperature'), {
    value: 26,
    at: Date.parse('2026-07-14T09:49:00Z'),
  });
  assert.equal(newestTime(measures), Date.parse('2026-07-14T09:49:00Z'));
  assert.equal(newestTime(new Map()), undefined);
});

test('the excluded measures are left out', () => {
  const measures = latestMeasures(spaMeasures());
  assert.equal(measures.has('orp'), false);
  assert.equal(measures.get('tds').value, 1250);
  assert.deepEqual(latestMeasures('nope'), new Map());
});

test('the next read: 65 minutes after the last measure, bounded', () => {
  const now = Date.parse('2026-07-14T10:00:00Z');
  const at = (minutes) => now + minutes * MINUTE;
  // Measured 11 minutes ago: read again 65 minutes after it.
  assert.equal(nextMeasureRead({ newest: at(-11), fresh: true, misses: 0, now }), at(54));
  // Measured long ago (the ICO caught up late): not before 15 minutes.
  assert.equal(nextMeasureRead({ newest: at(-300), fresh: true, misses: 0, now }), at(15));
  // A clock ahead: never more than 75 minutes.
  assert.equal(nextMeasureRead({ newest: at(30), fresh: true, misses: 0, now }), at(75));
  // Nothing new: 20 minutes, then hourly.
  assert.equal(nextMeasureRead({ newest: at(-70), fresh: false, misses: 1, now }), at(20));
  assert.equal(nextMeasureRead({ newest: at(-90), fresh: false, misses: 2, now }), at(60));
  assert.equal(nextMeasureRead({ fresh: false, misses: 5, now }), now + TIMINGS.measureIdle);
});

test('the recommendations, oldest first', () => {
  const list = readRecommendations([PH_DOWN, FILTER, { title: 'no id' }, null]);
  assert.deepEqual(
    list.map((r) => [r.id, r.title]),
    [
      ['10251', 'Clean your filter'],
      ['10260', 'Lower the pH'],
    ],
  );
  assert.equal(list[1].deadline, '2026-07-15T00:00:00+0000');
  const untitled = readRecommendations([{ id: 1, message: 'Only a message' }]);
  assert.equal(untitled[0].title, 'Only a message');
});

test('the recommendations text: the titles, a dash when there is none, bounded', () => {
  assert.equal(recommendationsText([]), '—');
  assert.equal(
    recommendationsText(readRecommendations([FILTER, PH_DOWN])),
    'Clean your filter · Lower the pH',
  );
  const long = recommendationsText(
    Array.from({ length: 100 }, (_, i) => ({ title: `Recommendation number ${i}` })),
  );
  assert.equal(long.length, LIMITS.recommendationText);
  assert.ok(long.endsWith('…'));
});
