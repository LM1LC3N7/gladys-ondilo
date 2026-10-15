// -----------------------------------------------------------------------------
// The answers of the Ondilo API, read (pure): dates, the last valid measure of
// each type, the recommendations, and when to read the next measure.
// -----------------------------------------------------------------------------

import { LIMITS, MEASURES, TIMINGS } from './constants.js';

/** "2020-03-23T16:08:51+0000" (Ondilo) -> epoch ms, undefined when unreadable. */
export function parseTime(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const iso = value.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * The newest valid measure of each known type.
 * @returns {Map<string, { value: number, at: number }>}
 */
export function latestMeasures(list) {
  const latest = new Map();
  for (const m of Array.isArray(list) ? list : []) {
    const type = m?.data_type;
    const value = typeof m?.value === 'string' ? Number(m.value) : m?.value;
    const at = parseTime(m?.value_time);
    if (
      !MEASURES.includes(type) ||
      m.is_valid === false ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      at === undefined
    ) {
      continue;
    }
    const previous = latest.get(type);
    if (!previous || at > previous.at) {
      latest.set(type, { value, at });
    }
  }
  return latest;
}

/** The time of the newest measure, undefined without any. */
export function newestTime(measures) {
  let newest;
  for (const { at } of measures.values()) {
    newest = newest === undefined ? at : Math.max(newest, at);
  }
  return newest;
}

/**
 * When to read the measures of a pool again. The ICO measures every hour:
 * right after a new measure, wait for the next one (65 min after it); without
 * a new one (the ICO is late, wintering, out of the water), try once more
 * soon, then hourly.
 * @param {{ newest?: number, fresh: boolean, misses: number, now: number }} input
 * @returns {number} the epoch ms of the next read.
 */
export function nextMeasureRead({ newest, fresh, misses, now }) {
  if (fresh && newest !== undefined) {
    const due = newest + TIMINGS.measureFollowUp;
    return Math.min(
      now + TIMINGS.measureIdle + TIMINGS.measureMin,
      Math.max(now + TIMINGS.measureMin, due),
    );
  }
  return now + (misses <= 1 ? TIMINGS.measureRetry : TIMINGS.measureIdle);
}

/**
 * The active recommendations, oldest first. The endpoint only lists the ones
 * not validated yet: every entry counts, whatever its status ("waiting"...).
 * @returns {Array<{ id: string, title: string, message: string, deadline: string, createdAt: number }>}
 */
export function readRecommendations(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (r?.id === undefined || r.id === null) {
      continue;
    }
    const title = String(r.title ?? '').trim();
    out.push({
      id: String(r.id),
      title: title || String(r.message ?? '').trim(),
      message: String(r.message ?? '').trim(),
      deadline: typeof r.deadline === 'string' ? r.deadline : '',
      createdAt: parseTime(r.created_at) ?? 0,
    });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** The text of the recommendations feature: the titles, or a dash. */
export function recommendationsText(recommendations) {
  const text = recommendations
    .map((r) => r.title)
    .filter(Boolean)
    .join(' · ');
  if (text === '') {
    return '—';
  }
  return text.length > LIMITS.recommendationText
    ? `${text.slice(0, LIMITS.recommendationText - 1)}…`
    : text;
}
