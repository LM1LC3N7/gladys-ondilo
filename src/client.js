// -----------------------------------------------------------------------------
// The Ondilo account of the user: its tokens (refreshed before they expire, or
// once when the API refuses one), the request budget, and the four calls the
// integration needs. Every request goes through ondilo.js.
// -----------------------------------------------------------------------------

import { MEASURES, ONDILO, TIMINGS } from './constants.js';
import { OndiloError, PATHS, exchangeCode, refreshTokens, request } from './ondilo.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function expectArray(value, what) {
  if (!Array.isArray(value)) {
    throw new OndiloError('bad_response', `Ondilo sent no ${what} list`);
  }
  return value;
}

export class OndiloClient {
  constructor({ budget, fetch = globalThis.fetch, now = Date.now, sleep = delay, onTokens }) {
    this.budget = budget;
    this.fetch = fetch;
    this.now = now;
    this.sleep = sleep;
    /** Called with the new tokens, to store them (never throws). */
    this.onTokens = onTokens;
    this.language = 'fr';
    /** { accessToken, refreshToken, expiresAt } | null */
    this.tokens = null;
    this.refreshing = undefined;
  }

  setTokens(tokens) {
    this.tokens = tokens?.refreshToken ? tokens : null;
  }

  get authorized() {
    return this.tokens !== null;
  }

  async store(tokens) {
    this.tokens = tokens;
    await this.onTokens?.(tokens);
  }

  /** Exchanges the code of the OAuth callback and keeps the tokens. */
  async authorize({ code, redirectUri }) {
    const tokens = await exchangeCode(this.fetch, { code, redirectUri }, this.now());
    await this.store(tokens);
    return tokens;
  }

  /** One refresh at a time; a refresh started with old tokens never overwrites new ones. */
  refresh() {
    if (!this.tokens) {
      return Promise.reject(new OndiloError('no_token', 'not connected to Ondilo'));
    }
    if (!this.refreshing) {
      const { refreshToken } = this.tokens;
      this.refreshing = refreshTokens(this.fetch, refreshToken, this.now())
        .then((tokens) =>
          this.tokens?.refreshToken === refreshToken ? this.store(tokens) : undefined,
        )
        .finally(() => {
          this.refreshing = undefined;
        });
    }
    return this.refreshing;
  }

  async accessToken() {
    if (!this.tokens) {
      throw new OndiloError('no_token', 'not connected to Ondilo');
    }
    if (this.now() >= this.tokens.expiresAt - TIMINGS.tokenMargin) {
      await this.refresh();
    }
    return this.tokens.accessToken;
  }

  async send(path, token) {
    const wait = this.budget.wait();
    if (wait > 0) {
      await this.sleep(wait);
    }
    if (!this.budget.spend()) {
      throw new OndiloError('budget', 'request budget of the hour spent');
    }
    return request(this.fetch, {
      url: `${ONDILO.apiUrl}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': this.language },
    });
  }

  async get(path) {
    const token = await this.accessToken();
    try {
      return await this.send(path, token);
    } catch (err) {
      if (err.kind !== 'unauthorized') {
        throw err;
      }
      // Revoked or expired early: one refresh, one retry.
      await this.refresh();
      return this.send(path, this.tokens.accessToken);
    }
  }

  async pools() {
    return expectArray(await this.get(PATHS.pools()), 'pool');
  }

  async device(poolId) {
    const device = await this.get(PATHS.device(poolId));
    return device && typeof device === 'object' ? device : {};
  }

  async lastMeasures(poolId) {
    return expectArray(await this.get(PATHS.lastMeasures(poolId, MEASURES)), 'measure');
  }

  async recommendations(poolId) {
    return expectArray(await this.get(PATHS.recommendations(poolId)), 'recommendation');
  }
}
