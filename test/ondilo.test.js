// -----------------------------------------------------------------------------
// The HTTP layer: the OAuth2 requests as Ondilo documents them, and the
// status codes turned into the error kinds the app reacts to.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONDILO } from '../src/constants.js';
import {
  OndiloError,
  PATHS,
  authorizeUrl,
  errorReason,
  exchangeCode,
  parseTokens,
  refreshTokens,
  request,
} from '../src/ondilo.js';

const NOW = 1_000_000;

/** A fetch answering `status` + `body`, recording what it was given. */
function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

test('the authorization URL carries the public client, the scope and the state', () => {
  const url = new URL(authorizeUrl({ redirectUri: 'https://gladys.example/cb?x=1', state: 'abc' }));
  assert.equal(url.href.split('?')[0], ONDILO.authorizeUrl);
  assert.equal(url.searchParams.get('client_id'), 'customer_api');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'api');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://gladys.example/cb?x=1');
  assert.equal(url.searchParams.get('state'), 'abc');
});

test('the code is exchanged with a form, the same redirect URI and no secret', async () => {
  const { fetch, calls } = fakeFetch(200, {
    access_token: 'a1',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'api',
    refresh_token: 'r1',
  });
  const tokens = await exchangeCode(fetch, { code: 'c0de', redirectUri: 'https://g/cb' }, NOW);
  assert.deepEqual(tokens, { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 3_600_000 });
  assert.equal(calls[0].url, ONDILO.tokenUrl);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), {
    code: 'c0de',
    grant_type: 'authorization_code',
    redirect_uri: 'https://g/cb',
    client_id: 'customer_api',
  });
});

test('a refresh keeps the refresh token (Ondilo returns none)', async () => {
  const { fetch, calls } = fakeFetch(200, { access_token: 'a2', expires_in: 3600 });
  const tokens = await refreshTokens(fetch, 'r1', NOW);
  assert.deepEqual(tokens, { accessToken: 'a2', refreshToken: 'r1', expiresAt: NOW + 3_600_000 });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), {
    refresh_token: 'r1',
    grant_type: 'refresh_token',
    client_id: 'customer_api',
  });
});

test('token answers: a missing token is an error, a missing lifetime is one hour', () => {
  assert.throws(() => parseTokens({ expires_in: 3600 }, NOW, 'r'), { kind: 'bad_response' });
  assert.throws(() => parseTokens({ access_token: 'a' }, NOW), { kind: 'bad_response' });
  assert.equal(parseTokens({ access_token: 'a' }, NOW, 'r').expiresAt, NOW + 3_600_000);
});

test('the token endpoint refusing a code or a refresh token means "authorize again"', async () => {
  for (const status of [400, 401]) {
    const { fetch } = fakeFetch(status, 'invalid_grant');
    await assert.rejects(refreshTokens(fetch, 'old', NOW), { kind: 'refused', status });
  }
});

test('the status codes of the API become error kinds', async () => {
  const cases = [
    [401, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [404, 'http'],
  ];
  for (const [status, kind] of cases) {
    const { fetch } = fakeFetch(status, 'nope');
    await assert.rejects(request(fetch, { url: 'https://x/y' }), { kind, status });
  }
  const notJson = fakeFetch(200, '<html>maintenance</html>');
  await assert.rejects(request(notJson.fetch, { url: 'https://x/y' }), { kind: 'bad_response' });
  const empty = fakeFetch(200, '');
  assert.equal(await request(empty.fetch, { url: 'https://x/y' }), null);
});

test('no answer at all is a network error with its cause', async () => {
  const fetch = async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  const err = await request(fetch, { url: 'https://x/y' }).catch((e) => e);
  assert.ok(err instanceof OndiloError);
  assert.equal(err.kind, 'network');
  assert.equal(errorReason(err), 'Ondilo unreachable: fetch failed (ECONNREFUSED)');
  const timeout = async () => {
    throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
  };
  await assert.rejects(request(timeout, { url: 'https://x/y' }), {
    message: 'Ondilo unreachable: timeout',
  });
});

test('every request asks for JSON in UTF-8', async () => {
  const { fetch, calls } = fakeFetch(200, []);
  await request(fetch, { url: 'https://x/y', headers: { Authorization: 'Bearer t' } });
  assert.equal(calls[0].headers.Accept, 'application/json');
  assert.equal(calls[0].headers['Accept-Charset'], 'utf-8');
  assert.equal(calls[0].headers.Authorization, 'Bearer t');
  assert.ok(calls[0].signal instanceof AbortSignal, 'requests time out');
});

test('the paths of the customer API', () => {
  assert.equal(PATHS.pools(), '/pools');
  assert.equal(PATHS.device(234), '/pools/234/device');
  assert.equal(PATHS.recommendations(234), '/pools/234/recommendations');
  assert.equal(
    PATHS.lastMeasures(234, ['temperature', 'orp']),
    '/pools/234/lastmeasures?types[]=temperature&types[]=orp',
  );
});
