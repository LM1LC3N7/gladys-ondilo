// -----------------------------------------------------------------------------
// The integration: the Ondilo account linked through OAuth2, a polite
// scheduler (the ICO measures once an hour, Ondilo allows 30 requests an
// hour), the Gladys devices of the pools and spas, their states, the "new
// recommendation" scene trigger and the transport badges. index.js only wires
// the SDK handlers to it.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { RequestBudget } from './budget.js';
import { OndiloClient } from './client.js';
import { normalizeConfig, tokensConfig } from './config.js';
import { LIMITS, SCENE_TRIGGERS, TIMINGS } from './constants.js';
import {
  FEATURES,
  buildPoolDevice,
  measureStates,
  poolIds,
  poolName,
  recommendationsState,
} from './devices.js';
import { FEATURE_NAMES, T, age, word } from './i18n.js';
import { latestMeasures, newestTime, nextMeasureRead, readRecommendations } from './measures.js';
import { authorizeUrl, errorReason } from './ondilo.js';
import { fileStore, normalizeMemory } from './store.js';

const cut = (text, max) => (text.length > max ? text.slice(0, max) : text);

/** Errors after which only a new authorization helps. */
const REVOKED = new Set(['refused', 'no_token']);
/** Errors meaning Ondilo did not answer usefully: the devices are unreachable. */
const OFFLINE = new Set(['network', 'unavailable', 'bad_response', 'http']);

export class OndiloApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'ondilo' }),
    fetch = globalThis.fetch,
    now = Date.now,
    timers = globalThis,
    store = fileStore(),
    randomId = randomUUID,
    sleep,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.randomId = randomId;
    this.budget = new RequestBudget({ now });
    this.client = new OndiloClient({
      budget: this.budget,
      fetch,
      now,
      sleep: sleep ?? ((ms) => new Promise((resolve) => timers.setTimeout(resolve, ms))),
      onTokens: (tokens) => this.saveTokens(tokens),
    });
    this.config = normalizeConfig();
    /** Ondilo pool id -> what is known of the pool */
    this.pools = new Map();
    this.poolsReadAt = undefined;
    this.published = undefined;
    this.timer = undefined;
    this.running = undefined;
    this.generation = 0;
    /** The authorization refused: wait for a new one. */
    this.revoked = false;
    /** The last call failed for lack of an answer. */
    this.offline = false;
    this.failures = 0;
    this.pausedUntil = 0;
    this.lastRefreshAt = -Infinity;
    /** { state, redirectUri, at } of the authorization in progress */
    this.authorization = undefined;
    this.memory = { seen: {} };
    this.started = false;
    this.lastStatus = undefined;
    /** deviceId -> badge last published (JSON) */
    this.transports = new Map();
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    await this.running;
    this.config = normalizeConfig(raw);
    this.client.language = this.config.language;
    this.client.setTokens(this.config.tokens);
    this.reset();
    this.memory = normalizeMemory(await this.store.load().catch(() => null));
    if (!this.client.authorized) {
      await this.setStatus(false, T.notConnected);
      return;
    }
    await this.setStatus(false, T.connecting);
    this.schedule();
    await this.tick();
  }

  stop() {
    this.generation += 1;
    if (this.timer) {
      this.timers.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Forgets the pools and the failures: a new account, or a restart. */
  reset() {
    this.pools.clear();
    this.poolsReadAt = undefined;
    this.published = undefined;
    this.revoked = false;
    this.offline = false;
    this.failures = 0;
    this.pausedUntil = 0;
  }

  schedule() {
    if (!this.timer) {
      this.timer = this.timers.setInterval(() => {
        this.tick().catch((err) => this.logger.error(`Ondilo refresh failed: ${err.message}`));
      }, TIMINGS.tick);
    }
  }

  /**
   * Connected to Gladys. The first time, start; after a reconnection (Gladys
   * restarted), resend what Gladys keeps in memory only (Discovery list,
   * status, badges) without reading Ondilo again.
   */
  async connected(raw = {}) {
    if (!this.started) {
      this.started = true;
      await this.start(raw);
      return;
    }
    await this.configUpdated(raw);
    this.published = undefined;
    this.transports.clear();
    const status = this.lastStatus;
    this.lastStatus = undefined;
    if (status) {
      const [connected, message] = JSON.parse(status);
      await this.setStatus(connected, message ?? undefined);
    }
    await this.publishDevices();
    await this.publishAllTransports();
  }

  /** The configuration changed: a new account restarts, a new language renames. */
  async configUpdated(raw = {}) {
    const next = normalizeConfig(raw);
    const newAccount =
      next.tokens !== null && next.tokens.refreshToken !== this.client.tokens?.refreshToken;
    if (newAccount || !this.client.authorized) {
      return this.start(raw);
    }
    // Our own token storage comes back here too: nothing to do then.
    if (next.language !== this.config.language) {
      this.config.language = next.language;
      this.client.language = next.language;
      await this.publishDevices();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async saveTokens(tokens) {
    await this.gladys
      .setConfig(tokensConfig(tokens))
      .catch((err) => this.logger.warn(`Storing the Ondilo tokens failed: ${err.message}`));
  }

  async saveMemory() {
    await this.store
      .save(this.memory)
      .catch((err) => this.logger.warn(`Saving ${err.path ?? 'the state'} failed: ${err.message}`));
  }

  // --- OAuth2 ----------------------------------------------------------------

  /** The "Connect" button: the Ondilo sign-in page, with an anti-forgery state. */
  oauthAuthorizeUrl(_key, redirectUri) {
    if (!redirectUri) {
      throw new Error('Gladys gave no redirect URI');
    }
    const state = this.randomId();
    this.authorization = { state, redirectUri, at: this.now() };
    return authorizeUrl({ redirectUri, state });
  }

  /** Ondilo sent the user back: exchange the code, store the tokens, read the pools. */
  async oauthCallback(_key, { code, state, redirectUri } = {}) {
    const pending = this.authorization;
    if (!pending || state !== pending.state || this.now() - pending.at > TIMINGS.authorizeTtl) {
      throw new Error('Unknown or expired authorization: click "Connect" again.');
    }
    this.authorization = undefined;
    if (!code) {
      throw new Error('Ondilo sent no authorization code (access denied?)');
    }
    await this.client.authorize({ code, redirectUri: redirectUri ?? pending.redirectUri });
    this.logger.info('Ondilo account linked');
    this.stop();
    await this.running;
    this.reset();
    await this.setStatus(true, T.connecting);
    this.schedule();
    // The callback is acked quickly; the pools are read in the background.
    this.tick().catch((err) => this.logger.error(`Ondilo refresh failed: ${err.message}`));
  }

  // --- Scheduler -------------------------------------------------------------

  /** One run at a time: a tick during a run joins it. */
  tick() {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  async run() {
    const generation = this.generation;
    if (!this.client.authorized || this.revoked || this.now() < this.pausedUntil) {
      return;
    }
    try {
      if (this.poolsDue()) {
        await this.readPools();
      }
      for (const pool of [...this.pools.values()]) {
        if (generation !== this.generation) {
          return;
        }
        if (this.now() >= pool.nextMeasureAt) {
          await this.readMeasures(pool);
        }
        if (this.recommendationsDue(pool)) {
          await this.readRecommendations(pool);
        }
      }
      this.failures = 0;
      this.offline = false;
      await this.setStatus(true, this.statusMessage());
    } catch (err) {
      await this.failed(err);
    }
    await this.publishAllTransports();
  }

  statusMessage() {
    return this.pools.size > 0 ? T.connected(this.pools.size) : T.noPool;
  }

  async failed(err) {
    if (err.kind === 'budget') {
      // Our own hourly budget: the rest waits for the next ticks.
      this.logger.debug('Ondilo request budget spent: the next reads wait');
      if (this.poolsReadAt !== undefined) {
        this.offline = false;
        await this.setStatus(true, this.statusMessage());
      }
      return;
    }
    if (REVOKED.has(err.kind)) {
      this.revoked = true;
      this.logger.warn(`Ondilo refused the authorization: ${errorReason(err)}`);
      await this.setStatus(false, T.refused);
      return;
    }
    const wait =
      err.kind === 'rate_limited'
        ? TIMINGS.backoff.at(-1)
        : TIMINGS.backoff[Math.min(this.failures, TIMINGS.backoff.length - 1)];
    this.failures += 1;
    this.pausedUntil = this.now() + wait;
    this.logger.warn(`Ondilo: ${errorReason(err)}; next try in ${Math.round(wait / 60_000)} min`);
    if (err.kind === 'rate_limited') {
      await this.setStatus(true, T.rateLimited(age(wait)));
    } else if (err.kind === 'unauthorized') {
      await this.setStatus(false, T.refused);
    } else {
      this.offline = OFFLINE.has(err.kind) || this.offline;
      await this.setStatus(false, T.unreachable(errorReason(err), age(wait)));
    }
  }

  poolsDue() {
    return this.poolsReadAt === undefined || this.now() - this.poolsReadAt >= TIMINGS.pools;
  }

  recommendationsDue(pool) {
    if (pool.recommendationsReadAt === undefined) {
      return true;
    }
    const elapsed = this.now() - pool.recommendationsReadAt;
    return (
      (pool.recommendationsWanted && elapsed >= TIMINGS.recommendationsMin) ||
      elapsed >= TIMINGS.recommendationsMax
    );
  }

  // --- Reads -----------------------------------------------------------------

  async readPools() {
    const list = (await this.client.pools())
      .filter((p) => p && typeof p === 'object' && p.id !== undefined && p.id !== null)
      .slice(0, LIMITS.pools);
    this.poolsReadAt = this.now();
    const ids = new Set();
    for (const raw of list) {
      const key = String(raw.id);
      ids.add(key);
      const known = this.pools.get(key);
      if (known) {
        known.pool = raw;
      } else {
        this.pools.set(key, {
          pool: raw,
          ids: poolIds(this.gladys, raw.id),
          info: undefined,
          seen: new Set(),
          measures: new Map(),
          newest: undefined,
          misses: 0,
          nextMeasureAt: 0,
          sent: new Map(),
          recommendations: [],
          recommendationsReadAt: undefined,
          recommendationsWanted: true,
        });
      }
    }
    for (const key of [...this.pools.keys()]) {
      if (!ids.has(key)) {
        this.pools.delete(key);
      }
    }
    // The ICO serial number and firmware, once per pool, if the budget leaves
    // room for the measures and recommendations of every pool.
    for (const pool of this.pools.values()) {
      if (pool.info === undefined && this.budget.remaining() > 2 * this.pools.size) {
        pool.info = await this.client.device(pool.pool.id).catch((err) => {
          if (REVOKED.has(err.kind) || err.kind === 'rate_limited') {
            throw err;
          }
          this.logger.debug(`ICO of pool ${pool.pool.id}: ${errorReason(err)}`);
          return null;
        });
      }
    }
    await this.publishDevices();
  }

  async readMeasures(pool) {
    const measures = latestMeasures(await this.client.lastMeasures(pool.pool.id));
    const newest = newestTime(measures);
    const fresh = newest !== undefined && (pool.newest === undefined || newest > pool.newest);
    pool.misses = fresh ? 0 : pool.misses + 1;
    if (fresh) {
      pool.newest = newest;
      pool.recommendationsWanted = true;
    }
    pool.nextMeasureAt = nextMeasureRead({
      newest: pool.newest,
      fresh,
      misses: pool.misses,
      now: this.now(),
    });
    let newType = false;
    for (const [type, measure] of measures) {
      if (!pool.seen.has(type)) {
        pool.seen.add(type);
        newType = true;
      }
      const previous = pool.measures.get(type);
      if (!previous || measure.at > previous.at) {
        pool.measures.set(type, measure);
      }
    }
    if (newType) {
      await this.publishDevices();
    }
    await this.publishMeasures(pool);
  }

  async readRecommendations(pool) {
    const list = readRecommendations(await this.client.recommendations(pool.pool.id));
    pool.recommendations = list;
    pool.recommendationsReadAt = this.now();
    pool.recommendationsWanted = false;
    await this.publishRecommendations(pool);
    await this.announce(pool, list);
  }

  // --- Gladys ----------------------------------------------------------------

  devices() {
    return [...this.pools.values()].map((pool) =>
      buildPoolDevice(this.gladys, {
        pool: pool.pool,
        info: pool.info,
        seen: pool.seen,
        language: this.config.language,
      }),
    );
  }

  async publishDevices() {
    const devices = this.devices();
    const json = JSON.stringify(devices);
    if (json === this.published) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = json;
    } catch (err) {
      this.logger.warn(`Publishing the discovered devices failed: ${err.message}`);
    }
  }

  createdFeatures() {
    return new Set(
      (this.gladys.devices ?? []).flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  /** The measures not sent yet, for the features the user created. */
  async publishMeasures(pool, created = this.createdFeatures()) {
    const states = measureStates(pool.ids, pool.measures, pool.sent, this.now()).filter((s) =>
      created.has(s.device_feature_external_id),
    );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states.map(({ at: _at, ...state }) => state));
      for (const { device_feature_external_id: id, at } of states) {
        pool.sent.set(id, at);
      }
    } catch (err) {
      this.logger.warn(`Sending the measures failed: ${err.message}`);
    }
  }

  async publishRecommendations(pool, created = this.createdFeatures()) {
    if (pool.recommendationsReadAt === undefined) {
      return;
    }
    const state = recommendationsState(pool.ids, pool.recommendations);
    if (
      !created.has(state.device_feature_external_id) ||
      pool.sent.get(state.device_feature_external_id) === state.text
    ) {
      return;
    }
    try {
      await this.gladys.publishStates([state]);
      pool.sent.set(state.device_feature_external_id, state.text);
    } catch (err) {
      this.logger.warn(`Sending the recommendations failed: ${err.message}`);
    }
  }

  /** Fires the scene trigger for the recommendations never announced before. */
  async announce(pool, list) {
    const key = String(pool.pool.id);
    const known = this.memory.seen[key];
    if (!known) {
      // First reading of this pool: what is there already is not news.
      this.memory.seen[key] = list.map((r) => r.id);
      await this.saveMemory();
      return;
    }
    const knownIds = new Set(known);
    const fresh = list.filter((r) => !knownIds.has(r.id));
    if (fresh.length === 0) {
      return;
    }
    this.memory.seen[key] = [...known, ...fresh.map((r) => r.id)].slice(
      -LIMITS.seenRecommendations,
    );
    await this.saveMemory();
    for (const r of fresh) {
      this.logger.info(`New recommendation for ${poolName(pool.pool)}: ${r.title}`);
      await this.gladys
        .publishSceneEvent(SCENE_TRIGGERS.NEW_RECOMMENDATION, {
          pool: pool.ids.device,
          pool_name: cut(poolName(pool.pool), LIMITS.eventText),
          title: cut(r.title, LIMITS.eventText),
          message: cut(r.message, LIMITS.eventText),
          deadline: cut(r.deadline, LIMITS.eventText),
        })
        .catch((err) => this.logger.warn(`Scene event failed: ${err.message}`));
    }
  }

  badge(pool) {
    if (this.revoked || this.offline) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    const since = pool.newest === undefined ? undefined : this.now() - pool.newest;
    if (since === undefined || since > TIMINGS.staleMeasure) {
      return {
        transport: DEVICE_TRANSPORTS.CLOUD,
        degraded: true,
        message: since === undefined ? T.noMeasure : T.stale(age(since)),
      };
    }
    return { transport: DEVICE_TRANSPORTS.CLOUD };
  }

  async publishAllTransports() {
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const entries = [];
    for (const pool of this.pools.values()) {
      const deviceId = pool.ids.device;
      if (!created.has(deviceId)) {
        continue;
      }
      const entry = { external_id: deviceId, ...this.badge(pool) };
      const json = JSON.stringify(entry);
      if (this.transports.get(deviceId) !== json) {
        this.transports.set(deviceId, json);
        entries.push(entry);
      }
    }
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  poolOfDevice(deviceId) {
    return [...this.pools.values()].find((pool) => pool.ids.device === deviceId);
  }

  /** A device was created (or updated): send its last values at once. */
  async deviceCreated(device) {
    const pool = this.poolOfDevice(device?.external_id);
    this.transports.delete(device?.external_id);
    if (!pool) {
      return;
    }
    pool.sent.clear();
    const created = new Set((device.features ?? []).map((f) => f.external_id));
    await this.publishMeasures(pool, created);
    await this.publishRecommendations(pool, created);
    await this.publishAllTransports();
  }

  async deviceDeleted(device) {
    this.transports.delete(device?.external_id);
    this.poolOfDevice(device?.external_id)?.sent.clear();
  }

  /** The Discovery tab asks for a scan: the cached list, or a fresh one if old enough. */
  async scan() {
    if (
      this.client.authorized &&
      !this.revoked &&
      this.poolsReadAt !== undefined &&
      this.now() - this.poolsReadAt >= TIMINGS.refreshCooldown
    ) {
      this.poolsReadAt = undefined;
      await this.tick();
      return;
    }
    await this.publishDevices();
  }

  // --- "Refresh now" button ----------------------------------------------------

  async refreshNow() {
    if (!this.client.authorized) {
      return T.notConnected;
    }
    const now = this.now();
    if (now - this.lastRefreshAt < TIMINGS.refreshCooldown) {
      const cooldown = T.refresh.cooldown(age(this.lastRefreshAt + TIMINGS.refreshCooldown - now));
      const summary = this.summary();
      return { en: `${cooldown.en} ${summary.en}`, fr: `${cooldown.fr} ${summary.fr}` };
    }
    if (this.budget.remaining() < 1 + 2 * this.pools.size) {
      return T.refresh.budget(age(this.budget.untilFree()));
    }
    this.lastRefreshAt = now;
    this.revoked = false;
    this.pausedUntil = 0;
    this.poolsReadAt = undefined;
    for (const pool of this.pools.values()) {
      pool.nextMeasureAt = 0;
      pool.recommendationsReadAt = undefined;
    }
    await this.running;
    await this.tick();
    const status = JSON.parse(this.lastStatus ?? '[false,null]');
    if (!status[0]) {
      return status[1] ?? T.notConnected;
    }
    return this.summary();
  }

  /** One sentence per pool: its last measures, their age, the recommendations. */
  summary() {
    if (this.pools.size === 0) {
      return T.noPool;
    }
    const parts = { en: [], fr: [] };
    for (const pool of this.pools.values()) {
      const at = pool.newest === undefined ? undefined : age(this.now() - pool.newest);
      for (const language of ['en', 'fr']) {
        const values = [...pool.measures]
          .filter(([type]) => FEATURES[type])
          .map(([type, { value }]) => formatMeasure(type, value, language))
          .join(', ');
        const line = T.refresh.pool(poolName(pool.pool), values, at)[language];
        const recommendations = T.refresh.recommendations(pool.recommendations.length)[language];
        parts[language].push(`${line}${recommendations}`);
      }
    }
    return { en: parts.en.join(' '), fr: parts.fr.join(' ') };
  }
}

const UNITS = { temperature: '°C', orp: 'mV', salt: 'ppm', tds: 'ppm', battery: '%', rssi: '%' };

function formatMeasure(type, value, language) {
  const rounded = Math.round(value * 10 ** FEATURES[type].decimals) / 10 ** FEATURES[type].decimals;
  if (type === 'ph') {
    return `pH ${rounded}`;
  }
  if (type === 'temperature' || type === 'orp') {
    return `${rounded} ${UNITS[type]}`;
  }
  return `${word(FEATURE_NAMES[type], language)} ${rounded} ${UNITS[type]}`;
}
