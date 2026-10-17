// -----------------------------------------------------------------------------
// Ondilo pools and spas -> Gladys devices, measures -> states (pure).
//
// One device per pool or spa, keyed by the Ondilo pool id: the measures belong
// to the pool, so the history goes on when the ICO itself is replaced.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { MEASURES, RECOMMENDATIONS_FEATURE } from './constants.js';
import { FEATURE_NAMES, word } from './i18n.js';
import { recommendationsText } from './measures.js';

/**
 * The features of the measures. Gladys has no salt nor TDS category: both are
 * generic sensors in ppm (Ondilo gives the salt in mg/L, the same value in
 * water: 4000 ppm = 4 g/L). A deliberate exception, see TODO.md "Decisions"
 * (2026-10-17): never change their category, unit or external id key.
 */
export const FEATURES = {
  temperature: {
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -20,
    max: 60,
    decimals: 2,
  },
  ph: {
    category: C.PH_SENSOR,
    type: T.PH_SENSOR.DECIMAL,
    unit: U.PH,
    min: 0,
    max: 14,
    decimals: 2,
  },
  orp: {
    category: C.ORP_SENSOR,
    type: T.ORP_SENSOR.DECIMAL,
    unit: U.MILLI_VOLT,
    min: 0,
    max: 2000,
    decimals: 0,
  },
  salt: {
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    unit: U.PPM,
    min: 0,
    max: 50000,
    decimals: 0,
  },
  tds: {
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    unit: U.PPM,
    min: 0,
    max: 10000,
    decimals: 0,
  },
  battery: {
    category: C.BATTERY,
    type: T.BATTERY.INTEGER,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    decimals: 0,
  },
  rssi: {
    category: C.SIGNAL,
    type: T.SIGNAL.QUALITY,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    decimals: 0,
  },
};

/** The external ids of a pool: `ext:<selector>:pool:<Ondilo pool id>`. */
export const poolIds = (gladys, poolId) => gladys.externalIds('pool', String(poolId));

export const poolName = (pool) => String(pool?.name ?? '').trim() || `Ondilo ${pool?.id}`;

/**
 * The measure types of a pool: salt for a salt pool, TDS for the others (what
 * the ICO measures), plus any type Ondilo actually returned.
 */
export function measureTypesOf(pool, seen = new Set()) {
  const salt = pool?.disinfection?.primary === 'salt';
  return MEASURES.filter((type) => {
    if (type === 'salt') {
      return salt || seen.has(type);
    }
    if (type === 'tds') {
      return !salt || seen.has(type);
    }
    return true;
  });
}

function params(pool, info) {
  const entries = [
    ['pool_id', pool.id],
    ['pool_type', pool.type],
    ['disinfection', pool.disinfection?.primary],
    ['ico_serial_number', info?.serial_number],
    ['ico_firmware', info?.sw_version],
  ];
  return entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([name, value]) => ({ name, value: String(value) }));
}

/** The Gladys device of an Ondilo pool or spa. */
export function buildPoolDevice(gladys, { pool, info, seen, language }) {
  const ids = poolIds(gladys, pool.id);
  const features = measureTypesOf(pool, seen).map((key) => {
    const { decimals: _decimals, ...feature } = FEATURES[key];
    return {
      name: word(FEATURE_NAMES[key], language),
      external_id: ids.feature(key),
      ...feature,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    };
  });
  features.push({
    name: word(FEATURE_NAMES[RECOMMENDATIONS_FEATURE], language),
    external_id: ids.feature(RECOMMENDATIONS_FEATURE),
    category: C.TEXT,
    type: T.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  });
  return {
    name: poolName(pool),
    external_id: ids.device,
    features,
    params: params(pool, info),
  };
}

const round = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * The states of the measures newer than the ones already sent, dated when the
 * ICO measured them (never in the future).
 * @param {Map<string, { value: number, at: number }>} measures
 * @param {Map<string, number>} sent featureId -> time of the measure last sent
 */
export function measureStates(ids, measures, sent, now) {
  const states = [];
  for (const [type, { value, at }] of measures) {
    const featureId = ids.feature(type);
    if ((sent.get(featureId) ?? -Infinity) >= at) {
      continue;
    }
    states.push({
      device_feature_external_id: featureId,
      state: round(value, FEATURES[type].decimals),
      created_at: new Date(Math.min(at, now)).toISOString(),
      at,
    });
  }
  return states;
}

/** The state of the recommendations feature. */
export const recommendationsState = (ids, recommendations) => ({
  device_feature_external_id: ids.feature(RECOMMENDATIONS_FEATURE),
  text: recommendationsText(recommendations),
});
