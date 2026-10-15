// -----------------------------------------------------------------------------
// The only network access: the Ondilo authentication service (OAuth2
// authorization code, refresh token) and the customer API, over `fetch`.
//
// Documented at https://interop.ondilo.com/docs/api/customer/v1/oauth and
// https://interop.ondilo.com/docs/api/customer/v1: access tokens live one hour,
// refresh tokens never expire, the refresh grant returns no new refresh token.
// -----------------------------------------------------------------------------

import { ONDILO, TIMINGS } from './constants.js';

/**
 * A failed Ondilo call. `kind`:
 * - `unauthorized`: the API refused the access token (401);
 * - `refused`: the token endpoint refused the code or the refresh token;
 * - `rate_limited`: quota exceeded (429);
 * - `unavailable`: Ondilo is down (5xx);
 * - `network`: no answer (DNS, timeout, connection);
 * - `bad_response`: an answer that is not the expected JSON;
 * - `http`: any other status;
 * - `budget`: our own request budget is spent (never sent);
 * - `no_token`: no authorization yet.
 */
export class OndiloError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'OndiloError';
    this.kind = kind;
    this.status = status;
  }
}

const HEADERS = {
  Accept: 'application/json',
  'Accept-Charset': 'utf-8',
};

/** A short, secret-free reason for a log or a status message. */
export function errorReason(err) {
  if (err instanceof OndiloError) {
    return err.status ? `${err.message} (HTTP ${err.status})` : err.message;
  }
  const cause = err?.cause?.code ?? err?.code;
  return cause ? `${err?.message ?? err} (${cause})` : String(err?.message ?? err);
}

function errorFor(status, text, tokenEndpoint) {
  const detail = text.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (tokenEndpoint && (status === 400 || status === 401)) {
    return new OndiloError('refused', detail || 'authorization refused', status);
  }
  if (status === 401) {
    return new OndiloError('unauthorized', 'access token refused', status);
  }
  if (status === 429) {
    return new OndiloError('rate_limited', 'Ondilo request quota exceeded', status);
  }
  if (status >= 500) {
    return new OndiloError('unavailable', detail || 'Ondilo is unavailable', status);
  }
  return new OndiloError('http', detail || 'request failed', status);
}

/** One HTTP request; resolves with the parsed JSON body (null when empty). */
export async function request(
  fetchImpl,
  { method = 'GET', url, headers = {}, body, tokenEndpoint = false },
) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { ...HEADERS, ...headers },
      body,
      signal: AbortSignal.timeout(TIMINGS.requestTimeout),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : errorReason(err);
    throw new OndiloError('network', `Ondilo unreachable: ${reason}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw errorFor(response.status, text, tokenEndpoint);
  }
  if (text.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new OndiloError('bad_response', 'Ondilo sent an answer that is not JSON');
  }
}

// --- OAuth2 ------------------------------------------------------------------

/** The authorization page the user is sent to by the "Connect" button. */
export function authorizeUrl({ redirectUri, state }) {
  const query = new URLSearchParams({
    client_id: ONDILO.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ONDILO.scope,
    state,
  });
  return `${ONDILO.authorizeUrl}?${query}`;
}

/**
 * The tokens of a token endpoint answer.
 * @returns {{ accessToken: string, refreshToken: string, expiresAt: number }}
 */
export function parseTokens(json, now, previousRefreshToken) {
  const accessToken = json?.access_token;
  const refreshToken = json?.refresh_token ?? previousRefreshToken;
  if (typeof accessToken !== 'string' || accessToken === '' || typeof refreshToken !== 'string') {
    throw new OndiloError('bad_response', 'Ondilo sent no token');
  }
  const lifetime = Number(json.expires_in);
  const seconds = Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600;
  return { accessToken, refreshToken, expiresAt: now + seconds * 1000 };
}

function tokenRequest(fetchImpl, form) {
  return request(fetchImpl, {
    method: 'POST',
    url: ONDILO.tokenUrl,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form, client_id: ONDILO.clientId }).toString(),
    tokenEndpoint: true,
  });
}

/** Exchanges the authorization code (same redirect URI as the authorization). */
export async function exchangeCode(fetchImpl, { code, redirectUri }, now) {
  const json = await tokenRequest(fetchImpl, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  return parseTokens(json, now);
}

/** A new access token; the refresh token stays the same. */
export async function refreshTokens(fetchImpl, refreshToken, now) {
  const json = await tokenRequest(fetchImpl, {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return parseTokens(json, now, refreshToken);
}

// --- Customer API --------------------------------------------------------------

/** The paths of the customer API, relative to ONDILO.apiUrl. */
export const PATHS = {
  pools: () => '/pools',
  device: (poolId) => `/pools/${encodeURIComponent(poolId)}/device`,
  lastMeasures: (poolId, types) =>
    `/pools/${encodeURIComponent(poolId)}/lastmeasures?${types
      .map((t) => `types[]=${encodeURIComponent(t)}`)
      .join('&')}`,
  recommendations: (poolId) => `/pools/${encodeURIComponent(poolId)}/recommendations`,
};
