import type { ZodType } from "zod";
import { createRateLimiter } from "./rateLimiter";

export const MAX_BODY_BYTES = 16 * 1024;
export const limiters = {
  standard: createRateLimiter(30, 60_000),
  advisory: createRateLimiter(6, 60_000),
};

export type GuardResult<T> = { ok: true; data: T; headers: Headers } | { ok: false; response: Response };

const json = (body: unknown, status: number, headers: Headers): Response => {
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
};
export { json as jsonResponse };

/** Origin check against ALLOWED_ORIGINS (comma list) with same-origin fallback. */
export function originAllowed(
  request: Request,
  allowedEnv: string | undefined,
): { ok: boolean; origin: string | null } {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true, origin: null };
  const self = new URL(request.url);
  const allowed = (allowedEnv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return { ok: false, origin };
  }
  if (parsedOrigin.origin !== origin || !["https:", "http:"].includes(parsedOrigin.protocol)) return { ok: false, origin };
  return { ok: origin === self.origin || allowed.includes(origin), origin };
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon"
  );
}

/**
 * Enforces CORS origin, rate limit, 16 KB body limit and Zod validation.
 * Error bodies never contain stack traces or upstream details.
 */
export async function guardRequest<T>(
  request: Request,
  opts: {
    schema: ZodType<T>;
    limiter: keyof typeof limiters;
    allowedOrigins: string | undefined;
    readInput: (body: string, url: URL) => unknown;
  },
): Promise<GuardResult<T>> {
  const headers = new Headers();
  const o = originAllowed(request, opts.allowedOrigins);
  if (!o.ok) return { ok: false, response: json({ error: "Origin not allowed" }, 403, headers) };
  if (o.origin) {
    headers.set("access-control-allow-origin", o.origin);
    headers.set("vary", "Origin");
  }
  const wait = limiters[opts.limiter].check(`${opts.limiter}:${clientKey(request)}`);
  if (wait > 0) {
    headers.set("retry-after", String(wait));
    return {
      ok: false,
      response: json({ error: `Too many requests. Try again in ${wait}s.`, retryAfter: wait }, 429, headers),
    };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, response: json({ error: "Payload too large" }, 413, headers) };
  let body = "";
  const reader = request.method === "GET" ? undefined : request.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          // Do not wait for an untrusted producer's cancellation promise.
          void reader.cancel().catch(() => {});
          return { ok: false, response: json({ error: "Payload too large" }, 413, headers) };
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } catch {
      return { ok: false, response: json({ error: "Malformed request" }, 400, headers) };
    } finally {
      reader.releaseLock();
    }
  }
  let input: unknown;
  try {
    input = opts.readInput(body, new URL(request.url));
  } catch {
    return { ok: false, response: json({ error: "Malformed request" }, 400, headers) };
  }
  const parsed = opts.schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      response: json(
        { error: "Invalid input", issues: parsed.error.issues.map((i) => i.message).slice(0, 5) },
        400,
        headers,
      ),
    };
  return { ok: true, data: parsed.data, headers };
}
