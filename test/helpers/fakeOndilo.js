// -----------------------------------------------------------------------------
// A fake Ondilo, behind the `fetch` the integration is given: the token
// endpoint (authorization code, refresh token) and the customer API, with the
// documented status codes. Records every request. No network.
// -----------------------------------------------------------------------------

import { ONDILO } from '../../src/constants.js';
import { ondiloData } from '../fixtures/ondilo.js';

const answer = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

export function fakeOndilo(data = ondiloData()) {
  const server = {
    data,
    /** { method, path, query, form, token } */
    requests: [],
    codes: new Set(['good-code']),
    refreshToken: 'refresh-1',
    accessTokens: new Set(['access-0']),
    issued: 0,
    /** No answer at all (DNS, connection refused). */
    down: false,
    /** One-shot answers: { match(request), status, body } */
    queue: [],
    api() {
      return this.requests.filter((r) => r.path !== undefined);
    },
    grants() {
      return this.requests.filter((r) => r.form).map((r) => r.form.grant_type);
    },
    issue() {
      this.issued += 1;
      const token = `access-${this.issued}`;
      this.accessTokens.add(token);
      return { access_token: token, expires_in: 3600, token_type: 'Bearer', scope: 'api' };
    },
  };

  server.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const request = { method, url, at: Date.now() };
    if (url.startsWith(ONDILO.tokenUrl)) {
      request.form = Object.fromEntries(new URLSearchParams(init.body));
    } else {
      const u = new URL(url);
      request.path = u.pathname.replace(new URL(ONDILO.apiUrl).pathname, '');
      request.query = decodeURIComponent(u.search);
      request.token = String(init.headers?.Authorization ?? '').replace(/^Bearer /, '');
    }
    server.requests.push(request);
    if (server.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }
    const forced = server.queue.findIndex((q) => q.match(request));
    if (forced >= 0) {
      const [{ status, body }] = server.queue.splice(forced, 1);
      return answer(status, body);
    }

    if (request.form) {
      const { form } = request;
      if (form.client_id !== ONDILO.clientId) {
        return answer(400, 'unknown client');
      }
      if (form.grant_type === 'authorization_code') {
        if (!server.codes.has(form.code) || !form.redirect_uri) {
          return answer(400, 'invalid code');
        }
        server.codes.delete(form.code);
        return answer(200, { ...server.issue(), refresh_token: server.refreshToken });
      }
      if (form.grant_type === 'refresh_token' && form.refresh_token === server.refreshToken) {
        return answer(200, server.issue());
      }
      return answer(400, 'invalid refresh token');
    }

    if (!server.accessTokens.has(request.token)) {
      return answer(401, 'Invalid access token');
    }
    const parts = request.path.split('/').filter(Boolean);
    if (method !== 'GET' || parts[0] !== 'pools') {
      return answer(404, 'Not found');
    }
    if (parts.length === 1) {
      return answer(200, server.data.pools);
    }
    const [, poolId, what] = parts;
    if (!server.data.pools.some((p) => String(p.id) === poolId)) {
      return answer(404, 'Unknown pool');
    }
    switch (what) {
      case 'device':
        return answer(200, server.data.devices[poolId] ?? {});
      case 'lastmeasures':
        return answer(200, server.data.measures[poolId] ?? []);
      case 'recommendations':
        return answer(200, server.data.recommendations[poolId] ?? []);
      default:
        return answer(404, 'Not found');
    }
  };

  return server;
}

/** An in-memory store, in place of the /data file. */
export function memoryStore(initial = null) {
  return {
    data: initial,
    saves: 0,
    async load() {
      return this.data === null ? null : structuredClone(this.data);
    },
    async save(data) {
      this.saves += 1;
      this.data = structuredClone(data);
    },
  };
}

/** Lets the pending promises settle (no timer involved). */
export const settle = async (rounds = 10) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
