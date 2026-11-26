/** Upstream fetch with a bounded timeout and at most one retry on network errors / 5xx (never on 4xx or 429). */
export async function fetchJson(
  url: string,
  opts: { timeoutMs: number; init?: RequestInit; retries?: number; deadlineAt?: number },
): Promise<unknown> {
  const retries = opts.retries ?? 1;
  for (let attempt = 0; ; attempt++) {
    const remaining = (opts.deadlineAt ?? Infinity) - Date.now();
    if (remaining <= 0) throw new UpstreamError("deadline");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(
            new UpstreamError(Date.now() >= (opts.deadlineAt ?? Infinity) ? "deadline" : "timeout"),
          );
        },
        Math.min(opts.timeoutMs, remaining),
      );
    });
    try {
      const signal = opts.init?.signal
        ? AbortSignal.any([opts.init.signal, controller.signal])
        : controller.signal;
      return await Promise.race([
        (async () => {
          const res = await fetch(url, { ...opts.init, signal, redirect: "manual" });
          if (!res.ok) {
            void res.body?.cancel().catch(() => {});
            throw new UpstreamError(`status ${res.status}`, res.status);
          }
          // Timeout includes reading the response body, not just receipt of headers.
          return await res.json();
        })(),
        timeout,
      ]);
    } catch (e) {
      if (Date.now() >= (opts.deadlineAt ?? Infinity)) throw new UpstreamError("deadline");
      if (e instanceof UpstreamError && e.status !== undefined && e.status < 500) throw e;
      if (opts.init?.signal?.aborted) throw new UpstreamError("network");
      if (attempt >= retries) throw e instanceof UpstreamError ? e : new UpstreamError("network");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export class UpstreamError extends Error {
  constructor(
    public readonly reason: string,
    public readonly status?: number,
  ) {
    super(`Upstream failure: ${reason}`);
  }
}
