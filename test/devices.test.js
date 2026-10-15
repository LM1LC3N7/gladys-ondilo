// -----------------------------------------------------------------------------
// Pools -> Gladys devices, measures -> states. The devices go through the
// SDK's fake Gladys, which refuses an unknown category, type or unit like the
// Gladys core does.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildPoolDevice,
  measureStates,
  measureTypesOf,
  poolIds,
  poolName,
  recommendationsState,
} from '../src/devices.js';
import { latestMeasures } from '../src/measures.js';
import { POOLS, poolMeasures } from './fixtures/ondilo.js';

const [SALT_POOL, SPA] = POOLS;

test('a salt pool measures the salt, the others the dissolved solids', () => {
  assert.deepEqual(measureTypesOf(SALT_POOL), [
    'temperature',
    'ph',
    'orp',
    'salt',
    'battery',
    'rssi',
  ]);
  assert.deepEqual(measureTypesOf(SPA), ['temperature', 'ph', 'orp', 'tds', 'battery', 'rssi']);
  assert.ok(measureTypesOf(SPA, new Set(['salt'])).includes('salt'), 'whatever Ondilo returns');
});

test('the devices are accepted by Gladys, with the SDK categories and units', async () => {
  const gladys = createFakeGladys();
  const devices = POOLS.map((pool) =>
    buildPoolDevice(gladys, { pool, info: undefined, seen: new Set(), language: 'en' }),
  );
  await gladys.publishDiscoveredDevices(devices);
  const [pool] = gladys.fake.discoveredDevices;
  const byKey = Object.fromEntries(pool.features.map((f) => [f.external_id.split(':').at(-1), f]));
  assert.equal(pool.external_id, 'ext:test-integration:pool:234');
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(byKey).map(([key, f]) => [key, [f.category, f.type, f.unit ?? null]]),
    ),
    {
      temperature: ['temperature-sensor', 'decimal', 'celsius'],
      ph: ['ph-sensor', 'decimal', 'ph'],
      orp: ['orp-sensor', 'decimal', 'millivolt'],
      salt: ['unknown', 'unknown', 'ppm'],
      battery: ['battery', 'integer', 'percent'],
      rssi: ['signal', 'integer', 'percent'],
      recommendations: ['text', 'text', null],
    },
  );
  assert.ok(pool.features.every((f) => f.read_only === true && f.has_feedback === false));
  assert.equal(byKey.recommendations.keep_history, false);
  assert.equal(byKey.temperature.keep_history, true);
  assert.equal(byKey.temperature.name, 'Water temperature');
  assert.equal(pool.should_poll, undefined, 'the integration paces the reads itself');
});

test('a pool without a name is named after its id', () => {
  assert.equal(poolName({ id: 7, name: '  ' }), 'Ondilo 7');
  assert.equal(poolName({ id: 7, name: 'Bassin' }), 'Bassin');
});

test('the measures newer than the ones sent, dated, rounded, never in the future', () => {
  const gladys = createFakeGladys();
  const ids = poolIds(gladys, 234);
  const measured = Date.parse('2026-07-14T09:49:00Z');
  const measures = latestMeasures(poolMeasures('2026-07-14T09:49:00+0000', 26.537));
  const sent = new Map();
  const states = measureStates(ids, measures, sent, measured + 60_000);
  assert.equal(states.length, 6);
  assert.deepEqual(states[0], {
    device_feature_external_id: `${ids.device}:temperature`,
    state: 26.54,
    created_at: '2026-07-14T09:49:00.000Z',
    at: measured,
  });
  for (const s of states) {
    sent.set(s.device_feature_external_id, s.at);
  }
  assert.deepEqual(measureStates(ids, measures, sent, measured + 60_000), []);
  const ahead = measureStates(ids, measures, new Map(), measured - 60_000);
  assert.equal(ahead[0].created_at, '2026-07-14T09:48:00.000Z', 'a clock behind Ondilo');
});

test('the state of the recommendations feature', () => {
  const ids = poolIds(createFakeGladys(), 234);
  assert.deepEqual(recommendationsState(ids, [{ title: 'Clean your filter' }]), {
    device_feature_external_id: `${ids.device}:recommendations`,
    text: 'Clean your filter',
  });
});
