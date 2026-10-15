// -----------------------------------------------------------------------------
// Keys shared with the manifest (frozen: users store them in their scenes and
// configuration), the Ondilo endpoints, and the tuning of the polling.
// -----------------------------------------------------------------------------

/** Manifest `actions` keys. */
export const ACTIONS = {
  REFRESH: 'refresh_now',
};

/** Manifest `scene_triggers` keys. */
export const SCENE_TRIGGERS = {
  NEW_RECOMMENDATION: 'new_recommendation',
};

/** The `oauth2` field of the manifest `config_schema`. */
export const OAUTH_FIELD = 'ondilo_account';

/** Config keys outside the `config_schema`: internal storage, never shown. */
export const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  EXPIRES_AT: 'token_expires_at',
};

/**
 * The Ondilo customer API (https://interop.ondilo.com/docs/api/customer/v1).
 * `customer_api` is the public client every customer application uses: no
 * secret, no application to register at Ondilo.
 */
export const ONDILO = {
  authorizeUrl: 'https://interop.ondilo.com/oauth2/authorize',
  tokenUrl: 'https://interop.ondilo.com/oauth2/token',
  apiUrl: 'https://interop.ondilo.com/api/customer/v1',
  clientId: 'customer_api',
  scope: 'api',
};

/** The measure types of `lastmeasures`, also the feature keys. */
export const MEASURES = ['temperature', 'ph', 'orp', 'salt', 'tds', 'battery', 'rssi'];

/** The feature key of the current recommendations. */
export const RECOMMENDATIONS_FEATURE = 'recommendations';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const LIMITS = {
  /** Ondilo allows 30 requests per hour and per user: keep a third free. */
  requestsPerHour: 20,
  /** Ondilo allows 5 requests per second: one every 500 ms is plenty. */
  requestGap: 500,
  /** Pools handled (one device each). */
  pools: 50,
  /** Text of the recommendations feature. */
  recommendationText: 1000,
  /** Scene event strings (the core caps them at 1000). */
  eventText: 1000,
  /** Recommendation ids remembered, to fire the trigger once per recommendation. */
  seenRecommendations: 500,
};

export const TIMINGS = {
  /** The scheduler looks for due work at this pace. */
  tick: MINUTE,
  /** The list of pools (names, new pools) is read again after this delay. */
  pools: 6 * HOUR,
  /** The ICO measures every hour: the next measure is read this long after the last one. */
  measureFollowUp: 65 * MINUTE,
  /** Never read the measures of a pool more often than this. */
  measureMin: 15 * MINUTE,
  /** No new measure: try again after this delay once, then hourly. */
  measureRetry: 20 * MINUTE,
  measureIdle: HOUR,
  /** The recommendations are read with a new measure, at most this often... */
  recommendationsMin: 55 * MINUTE,
  /** ...and at least this often. */
  recommendationsMax: 6 * HOUR,
  /** The "Refresh now" button reads Ondilo again only after this delay. */
  refreshCooldown: 5 * MINUTE,
  /** The access token (1 hour) is refreshed this long before it expires. */
  tokenMargin: 5 * MINUTE,
  /** An authorization started more than this long ago is refused. */
  authorizeTtl: 15 * MINUTE,
  /** Timeout of one HTTP request. */
  requestTimeout: 20_000,
  /** Delays before trying again after a failure (network, 5xx, quota). */
  backoff: [5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR],
  /** A measure older than this flags the device badge as degraded. */
  staleMeasure: 3 * HOUR,
};
