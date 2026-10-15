// -----------------------------------------------------------------------------
// The account client: token refresh (ahead of expiry, once on a 401, one at a
// time) and the request budget, against the fake Ondilo.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestBudget } from '../src/budget.js';
import { OndiloClient } from '../src/client.js';
import { fakeOndilo } from './helpers/fakeOndilo.js';

const HOUR = 3_600_000;

function setup({ expiresAt = 10 * HOUR, perHour = 20 } = {}) {
  let now = 0;
  const server = fakeOndilo();
  const stored = [];
  const client = new OndiloClient({
    budget: new RequestBudget({ now: () => now, perHour }),
    fetch: server.fetch,
    now: () => now,
    sleep: async () => {},
    onTokens: async (tokens) => {
      stored.push(tokens);
    },
  });
  client.setTokens({ accessToken: 'access-0', refreshToken: 'refresh-1', expiresAt });
  return { client, server, stored, setNow: (ms) => (now = ms) };
}

test('no tokens: not authorized, every call refuses', async () => {
  const { client } = setup();
  client.setTokens(null);
  assert.equal(client.authorized, false);
  await assert.rejects(client.pools(), { kind: 'no_token' });
  await assert.rejects(client.refresh(), { kind: 'no_token' });
});

test('the access token is refreshed 5 minutes before it expires', async () => {
  const { client, server, stored, setNow } = setup({ expiresAt: HOUR });
  await client.pools();
  assert.deepEqual(server.grants(), []);
  setNow(HOUR - 5 * 60_000);
  await client.pools();
  assert.deepEqual(server.grants(), ['refresh_token']);
  assert.equal(server.api().at(-1).token, 'access-1');
  assert.equal(stored[0].refreshToken, 'refresh-1');
});

test('a refused access token is refreshed once, and the call made again', async () => {
  const { client, server } = setup();
  server.accessTokens.clear();
  assert.equal((await client.pools()).length, 2);
  assert.deepEqual(server.grants(), ['refresh_token']);
  assert.deepEqual(
    server.api().map((r) => r.token),
    ['access-0', 'access-1'],
  );
  // Still refused after a fresh token: the error goes up, no loop.
  server.queue.push({ match: (r) => r.path === '/pools', status: 401, body: '' });
  server.queue.push({ match: (r) => r.path === '/pools', status: 401, body: '' });
  await assert.rejects(client.pools(), { kind: 'unauthorized' });
  assert.equal(server.grants().length, 2);
});

test('concurrent calls share one refresh', async () => {
  const { client, server } = setup({ expiresAt: 0 });
  await Promise.all([client.pools(), client.lastMeasures(234), client.recommendations(234)]);
  assert.deepEqual(server.grants(), ['refresh_token']);
});

test('a refresh started with old tokens never overwrites newer ones', async () => {
  const { client } = setup({ expiresAt: 0 });
  const refreshing = client.refresh();
  client.setTokens({ accessToken: 'new', refreshToken: 'refresh-9', expiresAt: 10 * HOUR });
  await refreshing;
  assert.equal(client.tokens.refreshToken, 'refresh-9');
  assert.equal(client.tokens.accessToken, 'new');
});

test('the hourly budget is a hard stop', async () => {
  const { client, server, setNow } = setup({ perHour: 3 });
  await client.pools();
  await client.pools();
  await client.pools();
  await assert.rejects(client.pools(), { kind: 'budget' });
  assert.equal(server.api().length, 3, 'the refused call is never sent');
  setNow(HOUR);
  await client.pools();
  assert.equal(server.api().length, 4);
});

test('the answers must be lists where Ondilo sends lists', async () => {
  const { client, server } = setup();
  server.queue.push({ match: () => true, status: 200, body: { error: 'oops' } });
  await assert.rejects(client.pools(), { kind: 'bad_response' });
  server.queue.push({ match: () => true, status: 200, body: '' });
  assert.deepEqual(await client.device(234), {});
});

test('the authorization code gives the tokens, stored at once', async () => {
  const { client, stored } = setup();
  client.setTokens(null);
  await client.authorize({ code: 'good-code', redirectUri: 'https://g/cb' });
  assert.equal(client.authorized, true);
  assert.equal(stored.at(-1).refreshToken, 'refresh-1');
});
