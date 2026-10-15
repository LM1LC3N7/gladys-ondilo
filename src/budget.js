// -----------------------------------------------------------------------------
// The request budget: Ondilo allows 30 requests per hour and 5 per second per
// user. Every API call spends one slot of a sliding hour (20 slots, a third
// kept free for the user's other apps) and waits for a gap after the previous
// one. Pure: the clock is injected.
// -----------------------------------------------------------------------------

import { LIMITS } from './constants.js';

const HOUR = 3_600_000;

export class RequestBudget {
  constructor({ now = Date.now, perHour = LIMITS.requestsPerHour, gap = LIMITS.requestGap } = {}) {
    this.now = now;
    this.perHour = perHour;
    this.gap = gap;
    /** send times of the last hour, oldest first */
    this.sent = [];
  }

  prune() {
    const now = this.now();
    while (this.sent.length > 0 && now - this.sent[0] >= HOUR) {
      this.sent.shift();
    }
  }

  /** Requests still allowed in the current hour. */
  remaining() {
    this.prune();
    return Math.max(0, this.perHour - this.sent.length);
  }

  /** Milliseconds until a slot frees up (0 when one is free). */
  untilFree() {
    if (this.remaining() > 0) {
      return 0;
    }
    return this.sent[0] + HOUR - this.now();
  }

  /** Milliseconds to wait before the next request, to respect the gap. */
  wait() {
    const last = this.sent.at(-1);
    return last === undefined ? 0 : Math.max(0, last + this.gap - this.now());
  }

  /** Records a request; false when the hour is already spent. */
  spend() {
    if (this.remaining() === 0) {
      return false;
    }
    this.sent.push(this.now());
    return true;
  }
}
