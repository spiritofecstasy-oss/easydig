const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TIERS = ['search', 'list', 'resolve'];

// Token-bucket-ish limiter using a sliding window: allows at most `max` calls
// started within any rolling `windowMs` period, and runs queued calls one at
// a time. Priority tiers so a human typing a search query is never stuck
// behind bulk background work:
//   'search'  — interactive search-as-you-type. Always serviced first — it's
//               rare and human-triggered, so it should never wait at all.
//   'list'    — loading an entity's profile/release list.
//   'resolve' — bulk per-release video lookups.
// 'list' and 'resolve' round-robin against each other rather than 'list'
// strictly winning: a still-paginating 9,000-release artist continuously
// re-queues itself in 'list', and if that tier always won outright, video
// resolution (the thing that actually produces playable tracks) would never
// get a turn until pagination fully finished — sometimes minutes away.
export class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.timestamps = [];
    this.queues = { search: [], list: [], resolve: [] };
    this.lastRoundRobinTier = 'resolve';
    this.processing = false;
  }

  schedule(fn, tier = 'resolve') {
    return new Promise((resolve, reject) => {
      const queue = this.queues[tier] || this.queues.resolve;
      queue.push({ fn, resolve, reject });
      this._process();
    });
  }

  _nextItem() {
    if (this.queues.search.length > 0) return this.queues.search.shift();

    const order =
      this.lastRoundRobinTier === 'list' ? ['resolve', 'list'] : ['list', 'resolve'];
    for (const tier of order) {
      if (this.queues[tier].length > 0) {
        this.lastRoundRobinTier = tier;
        return this.queues[tier].shift();
      }
    }
    return null;
  }

  _hasWork() {
    return TIERS.some((tier) => this.queues[tier].length > 0);
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;
    while (this._hasWork()) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length >= this.max) {
        const oldest = this.timestamps[0];
        const waitMs = this.windowMs - (now - oldest) + 50;
        await sleep(Math.max(waitMs, 50));
        continue;
      }
      const item = this._nextItem();
      this.timestamps.push(Date.now());
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
    this.processing = false;
  }
}
