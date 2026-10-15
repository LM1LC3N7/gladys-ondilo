// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys and a fake Ondilo behind `fetch`. Timers and Date are mocked: the
// tests move the clock minute by minute, like the scheduler sees it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { OndiloApp } from '../src/app.js';
import { ACTIONS, LIMITS, OAUTH_FIELD, SCENE_TRIGGERS, TOKEN_KEYS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { NOW, PH_DOWN, POOLS, ondiloData, poolMeasures } from './fixtures/ondilo.js';
import { fakeOndilo, memoryStore, settle } from './helpers/fakeOndilo.js';

const MINUTE = 60_000;
const REDIRECT = 'https://oauth.gladysassistant.com/callback';
const LINKED = {
  [TOKEN_KEYS.ACCESS]: 'access-0',
  [TOKEN_KEYS.REFRESH]: 'refresh-1',
  [TOKEN_KEYS.EXPIRES_AT]: NOW + 50 * MINUTE,
};
const POOL = 'ext:test-integration:pool:234';
const SPA = 'ext:test-integration:pool:235';

async function setup(t, { config = LINKED, store = memoryStore(), server = fakeOndilo() } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOW });
  const gladys = createFakeGladys({ config });
  const app = new OndiloApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    fetch: server.fetch,
    now: () => Date.now(),
    store,
    randomId: () => 'state-1',
    sleep: async () => {},
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  await settle();
  t.after(() => app.stop());
  const advance = async (minutes) => {
    for (let i = 0; i < minutes; i += 1) {
      t.mock.timers.tick(MINUTE);
      await settle();
    }
  };
  return { gladys, app, server, store, advance };
}

const deviceOf = (gladys, id) => gladys.fake.discoveredDevices.find((d) => d.external_id === id);
const create = async (gladys, id) => {
  await gladys.fake.deviceCreated(deviceOf(gladys, id));
  await settle();
};
const badgeOf = (gladys, id) =>
  gladys.fake.transports.filter((b) => b.device_external_id === id).at(-1);
const reads = (server, path) => server.api().filter((r) => r.path === path).length;

test('without an Ondilo account, the status asks to connect and nothing is requested', async (t) => {
  const { gladys, server } = await setup(t, { config: {} });
  assert.equal(server.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Connecter/);
  const ack = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(ack.data.message.en, /Connect/);
});

test('the OAuth2 flow links the account, stores the tokens and reads the pools', async (t) => {
  const { gladys, server } = await setup(t, { config: {} });
  const ack = await gladys.fake.oauthAuthorizeUrl(OAUTH_FIELD, REDIRECT);
  assert.equal(ack.success, true);
  const url = new URL(ack.data.authorize_url);
  assert.equal(`${url.origin}${url.pathname}`, 'https://interop.ondilo.com/oauth2/authorize');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: 'customer_api',
    response_type: 'code',
    redirect_uri: REDIRECT,
    scope: 'api',
    state: 'state-1',
  });

  const forged = await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'good-code',
    state: 'forged',
    redirectUri: REDIRECT,
  });
  assert.equal(forged.success, false, 'a foreign state is refused');
  assert.equal(server.requests.length, 0);

  const linked = await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'good-code',
    state: 'state-1',
    redirectUri: REDIRECT,
  });
  assert.equal(linked.success, true);
  await settle();
  assert.deepEqual(server.requests[0].form, {
    code: 'good-code',
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT,
    client_id: 'customer_api',
  });
  assert.equal(gladys.fake.config[TOKEN_KEYS.ACCESS], 'access-1');
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], 'refresh-1');
  assert.equal(gladys.fake.config[TOKEN_KEYS.EXPIRES_AT], NOW + 3600_000);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /2 pools or spas/);
  // The pools, the ICO of each, their measures and recommendations.
  assert.equal(server.api().length, 7);

  const replay = await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'good-code',
    state: 'state-1',
    redirectUri: REDIRECT,
  });
  assert.equal(replay.success, false, 'an authorization is used once');
});

test('the pools and spas become devices; their measures flow once created', async (t) => {
  const { gladys } = await setup(t);
  const pool = deviceOf(gladys, POOL);
  assert.equal(pool.name, 'Piscine');
  const keys = (device) => device.features.map((f) => f.external_id.split(':').at(-1));
  assert.deepEqual(keys(pool), [
    'temperature',
    'ph',
    'orp',
    'salt',
    'battery',
    'rssi',
    'recommendations',
  ]);
  assert.deepEqual(keys(deviceOf(gladys, SPA)), [
    'temperature',
    'ph',
    'orp',
    'tds',
    'battery',
    'rssi',
    'recommendations',
  ]);
  assert.equal(pool.features[0].name, "Température de l'eau");
  assert.deepEqual(pool.params, [
    { name: 'pool_id', value: '234' },
    { name: 'pool_type', value: 'outdoor_inground_pool' },
    { name: 'disinfection', value: 'salt' },
    { name: 'ico_serial_number', value: 'SN00001' },
    { name: 'ico_firmware', value: '1.5.1-stable' },
  ]);
  assert.equal(gladys.fake.states.length, 0, 'nothing is sent before the user creates the device');

  await create(gladys, POOL);
  const last = (key) => gladys.fake.lastState(`${POOL}:${key}`);
  assert.equal(last('temperature'), 26.53);
  assert.equal(last('ph'), 7.42);
  assert.equal(last('orp'), 712);
  assert.equal(last('salt'), 4210);
  assert.equal(last('battery'), 87);
  assert.equal(last('rssi'), 64);
  assert.equal(last('recommendations'), 'Clean your filter');
  const temperature = gladys.fake.states.find(
    (s) => s.device_feature_external_id === `${POOL}:temperature`,
  );
  assert.equal(temperature.created_at, '2026-07-14T09:49:00.000Z', 'dated when the ICO measured');
  assert.equal(badgeOf(gladys, POOL).transport, DEVICE_TRANSPORTS.CLOUD);

  await create(gladys, SPA);
  assert.equal(gladys.fake.lastState(`${SPA}:tds`), 1250);
  assert.equal(gladys.fake.lastState(`${SPA}:orp`), undefined, 'an excluded measure is not sent');
  assert.equal(gladys.fake.lastState(`${SPA}:recommendations`), '—');
});

test('the measures are read once an hour, right after the ICO measured', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await create(gladys, POOL);
  const poolReads = () => reads(server, '/pools/234/lastmeasures');
  assert.equal(poolReads(), 1);
  assert.equal(
    server.api().find((r) => r.path === '/pools/234/lastmeasures').query,
    '?types[]=temperature&types[]=ph&types[]=orp&types[]=salt&types[]=tds&types[]=battery&types[]=rssi',
  );

  // Measured at 09:49: the next measure is read at 10:54.
  server.data.measures[234] = poolMeasures('2026-07-14T10:49:00+0000', 27.1);
  await advance(53);
  assert.equal(poolReads(), 1);
  await advance(1);
  assert.equal(poolReads(), 2);
  assert.equal(gladys.fake.lastState(`${POOL}:temperature`), 27.1);

  // No new measure at 11:54: once more 20 minutes later, then hourly.
  await advance(60);
  assert.equal(poolReads(), 3);
  await advance(20);
  assert.equal(poolReads(), 4);
  await advance(59);
  assert.equal(poolReads(), 4);
  await advance(1);
  assert.equal(poolReads(), 5);

  const temperatures = gladys.fake.states.filter(
    (s) => s.device_feature_external_id === `${POOL}:temperature`,
  );
  assert.equal(temperatures.length, 2, 'a measure already sent is not sent again');
});

test('a day of polling stays far below the Ondilo quota', async (t) => {
  const { server, advance } = await setup(t);
  // The ICO of the pool measures every hour, the spa's stays silent.
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(NOW + hour * 3_600_000 + 49 * MINUTE).toISOString();
    server.data.measures[234] = poolMeasures(at.replace(/\.000Z$/, '+0000'));
    await advance(60);
  }
  const api = server.api();
  // About 3.7 requests an hour for a pool and a spa: one measure read per
  // pool and hour, the recommendations with each new measure (hourly at most).
  assert.ok(api.length <= 90, `${api.length} requests in 24 h`);
  const poolReads = reads(server, '/pools/234/lastmeasures');
  assert.ok(poolReads >= 24 && poolReads <= 26, `${poolReads} measure reads of the pool`);
  assert.ok(reads(server, '/pools/234/recommendations') <= 26);
  assert.ok(reads(server, '/pools/235/recommendations') <= 6, 'a silent ICO: every 6 hours');
  const times = api.map((r) => r.at);
  for (const [i, at] of times.entries()) {
    const inHour = times.filter((other, j) => j <= i && at - other < 3_600_000).length;
    assert.ok(inHour <= LIMITS.requestsPerHour, `${inHour} requests in an hour`);
  }
});

test('the request budget holds with many pools', async (t) => {
  const data = ondiloData();
  data.pools = Array.from({ length: 12 }, (_, i) => ({ ...POOLS[0], id: 300 + i, name: `P${i}` }));
  data.measures = Object.fromEntries(data.pools.map((p) => [p.id, poolMeasures()]));
  data.recommendations = {};
  const { gladys, server, advance } = await setup(t, { server: fakeOndilo(data) });
  assert.equal(gladys.fake.discoveredDevices.length, 12);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  await advance(180);
  const times = server.api().map((r) => r.at);
  for (const [i, at] of times.entries()) {
    const inHour = times.filter((other, j) => j <= i && at - other < 3_600_000).length;
    assert.ok(inHour <= LIMITS.requestsPerHour, `${inHour} requests in an hour`);
  }
  assert.ok(
    data.pools.every((p) => reads(server, `/pools/${p.id}/lastmeasures`) >= 2),
    'every pool is read, spread over the hours',
  );
});

test('the access token is refreshed before it expires, and once when Ondilo refuses it', async (t) => {
  const { gladys, server, advance } = await setup(t);
  assert.deepEqual(server.grants(), [], 'the stored access token is still valid');
  server.data.measures[234] = poolMeasures('2026-07-14T10:49:00+0000');
  await advance(54);
  assert.deepEqual(server.grants(), ['refresh_token']);
  assert.equal(gladys.fake.config[TOKEN_KEYS.ACCESS], 'access-1');
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], 'refresh-1', 'the refresh token stays');

  // Revoked before its time: one refresh, then the call again.
  server.accessTokens.clear();
  const ack = await gladys.fake.action(ACTIONS.REFRESH);
  assert.equal(ack.success, true);
  assert.deepEqual(server.grants(), ['refresh_token', 'refresh_token']);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(ack.data.message.en, /Piscine: 26\.53 °C/);
});

test('a refused authorization asks to reconnect and stops the requests', async (t) => {
  const server = fakeOndilo();
  server.refreshToken = 'refresh-2'; // the stored refresh-1 was revoked
  const { gladys, advance } = await setup(t, {
    server,
    config: { ...LINKED, [TOKEN_KEYS.EXPIRES_AT]: NOW - 1000 },
  });
  assert.deepEqual(server.grants(), ['refresh_token']);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the saved authorization/);
  const count = server.requests.length;
  await advance(120);
  assert.equal(server.requests.length, count, 'no request until a new authorization');

  await gladys.fake.oauthAuthorizeUrl(OAUTH_FIELD, REDIRECT);
  await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'good-code',
    state: 'state-1',
    redirectUri: REDIRECT,
  });
  await settle();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], 'refresh-2');
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('a new recommendation fires the scene trigger once, even across a restart', async (t) => {
  const store = memoryStore();
  const { gladys, app, server, advance } = await setup(t, { store });
  await create(gladys, POOL);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the recommendations already there are no news');
  assert.deepEqual(store.data.seen, { 234: ['10251'], 235: [] });

  server.data.recommendations[234].push(structuredClone(PH_DOWN));
  server.data.measures[234] = poolMeasures('2026-07-14T10:49:00+0000');
  await advance(55);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.NEW_RECOMMENDATION,
      data: {
        pool: POOL,
        pool_name: 'Piscine',
        title: 'Lower the pH',
        message: PH_DOWN.message,
        deadline: PH_DOWN.deadline,
      },
    },
  ]);
  assert.equal(
    gladys.fake.lastState(`${POOL}:recommendations`),
    'Clean your filter · Lower the pH',
  );

  // The container restarts: what was announced stays announced.
  await app.start(gladys.fake.config);
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('Ondilo unreachable: the status says so, the integration waits, then recovers', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await create(gladys, POOL);
  server.down = true;
  const ack = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(ack.data.message.en, /cannot be reached \(Ondilo unreachable: fetch failed/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(badgeOf(gladys, POOL).transport, DEVICE_TRANSPORTS.UNREACHABLE);

  const count = server.requests.length;
  await advance(4);
  assert.equal(server.requests.length, count, 'it waits 5 minutes');
  server.down = false;
  await advance(1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(badgeOf(gladys, POOL).transport, DEVICE_TRANSPORTS.CLOUD);
});

test('Ondilo says the quota is reached: one hour of pause', async (t) => {
  const { gladys, server, advance } = await setup(t);
  server.queue.push({ match: (r) => r.path === '/pools', status: 429, body: 'Too many requests' });
  await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(gladys.fake.connectionStatus.message.en, /quota is reached/);
  const count = server.requests.length;
  await advance(59);
  assert.equal(server.requests.length, count);
  await advance(1);
  assert.ok(server.requests.length > count);
});

test('Refresh now: a summary of every pool, then a cooldown', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.action(ACTIONS.REFRESH);
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.fr,
    /^Piscine : 26\.53 °C, pH 7\.42, 712 mV, Sel 4210 ppm, Batterie 87 %, Signal 64 % \(mesuré il y a 11 min\)\. 1 recommandation en cours\./,
  );
  assert.match(ack.data.message.en, /Spa: 36\.2 °C, pH 7\.61, Dissolved solids \(TDS\) 1250 ppm/);
  const again = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(again.data.message.en, /^Already read less than 5 minutes ago/);
});

test('a measure older than 3 hours flags the badge as degraded', async (t) => {
  const { gladys, advance } = await setup(t);
  await create(gladys, POOL);
  assert.equal(badgeOf(gladys, POOL).degraded, undefined);
  await advance(181);
  const badge = badgeOf(gladys, POOL);
  assert.equal(badge.transport, DEVICE_TRANSPORTS.CLOUD);
  assert.equal(badge.degraded, true);
  assert.match(badge.message.fr, /Aucune mesure depuis 3 h/);
});

test('the language of the configuration names the features', async (t) => {
  const { gladys, server } = await setup(t, { config: { ...LINKED, language: 'en' } });
  assert.equal(deviceOf(gladys, POOL).features[0].name, 'Water temperature');
  const count = server.requests.length;
  await gladys.fake.configUpdated({ ...gladys.fake.config, language: 'fr' });
  assert.equal(deviceOf(gladys, POOL).features[0].name, "Température de l'eau");
  await gladys.fake.configUpdated({ ...gladys.fake.config });
  assert.equal(server.requests.length, count, 'a configuration echo reads nothing');
});

test('the Discovery scan reads the pools again, at most every 5 minutes', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await gladys.fake.scanRequest();
  assert.equal(reads(server, '/pools'), 1);
  server.data.pools.pop();
  await advance(5);
  await gladys.fake.scanRequest();
  await settle();
  assert.equal(reads(server, '/pools'), 2);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [POOL],
    'a pool removed from the account leaves Discovery',
  );
});

test('a reconnection to Gladys resends the devices without reading Ondilo', async (t) => {
  const { gladys, server } = await setup(t);
  const count = server.requests.length;
  await gladys.disconnect();
  await gladys.connect();
  await settle();
  assert.equal(server.requests.length, count);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});
