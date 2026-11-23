/**
 * Best-effort, per-instance TTL cache. Correctness never depends on a hit:
 * isolates are ephemeral and not shared. Never used for WAQI responses.
 */
const store = new Map<string, { at: number; value: unknown }>();
const MAX = 200;

export function cacheGet<T>(key: string, ttlMs: number, now = Date.now()): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (now - hit.at > ttlMs) { store.delete(key); return undefined; }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, now = Date.now()): void {
  if (store.size >= MAX) { const first = store.keys().next().value; if (first !== undefined) store.delete(first); }
  store.set(key, { at: now, value });
}

export function cacheClear(): void { store.clear(); }
