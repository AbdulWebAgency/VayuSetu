/** Fixed-window per-key limiter. Per-instance only (best effort on serverless/edge). */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    /** Returns seconds to wait when limited, or 0 when allowed. */
    check(key: string, now = Date.now()): number {
      const h = hits.get(key);
      if (!h || now - h.start >= windowMs) {
        if (hits.size > 5000) hits.clear();
        hits.set(key, { start: now, count: 1 });
        return 0;
      }
      if (h.count >= limit) return Math.ceil((h.start + windowMs - now) / 1000);
      h.count++;
      return 0;
    },
  };
}
