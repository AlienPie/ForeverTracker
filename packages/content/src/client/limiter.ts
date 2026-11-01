export interface Limiter {
  /** Resolves when a request may be sent, recording it in the window. */
  acquire(): Promise<void>;
}

/** Sliding-window limiter: at most `limit` acquisitions in any `windowMs`. */
export function createLimiter(opts: {
  limit: number;
  windowMs?: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}): Limiter {
  const windowMs = opts.windowMs ?? 60_000;
  const stamps: number[] = [];
  return {
    async acquire() {
      for (;;) {
        const t = opts.now();
        while (stamps.length > 0 && stamps[0]! <= t - windowMs) stamps.shift();
        if (stamps.length < opts.limit) {
          stamps.push(t);
          return;
        }
        await opts.sleep(stamps[0]! + windowMs - t);
      }
    },
  };
}
