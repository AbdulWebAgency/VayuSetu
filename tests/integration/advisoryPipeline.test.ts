import { buildAdvisory } from "@/server/advisoryService";
import { normalizeOpenMeteo, normalizeGeocode } from "@/domain/normalizer";
import { fetchJson, UpstreamError } from "@/server/providers/http";
import { PROVIDER_DEADLINE_MS, resolveAirQuality } from "@/server/providers/providerHierarchy";
import { cacheClear } from "@/server/cache/fetchCache";
import type { AiAdvisoryResponse } from "@/types/airQuality";
import { DELHI, geocodeRaw, NOW, openMeteoRaw, profile } from "../fixtures/payloads";

const om = async () => normalizeOpenMeteo(openMeteoRaw, NOW);
const slot = { action: "Commute by metro", reason: "Lower exposure", pillar: "routines" as const };
const ai: AiAdvisoryResponse = {
  recommendations: [
    { id: "r", pillar: "routines", title: "Metro commute", what: "Take the metro", why: "High PM2.5", how: "Less exposure", limitation: "Crowding", basis: "Estimated" },
    { id: "i", pillar: "indoor", title: "Run purifier", what: "Run your purifier", why: "High PM2.5", how: "Filters air", limitation: "Cost", basis: "Estimated" },
    { id: "s", pillar: "sustainable", title: "Carpool", what: "Share rides", why: "Fewer trips", how: "Less emissions", limitation: "Coordination", basis: "Qualitative" },
  ],
  planner: { morning: slot, afternoon: slot, evening: slot },
};

describe("advisory pipeline", () => {
  const loc = normalizeGeocode(geocodeRaw)[0];
  if (!loc) throw new Error("Missing geocode fixture");
  it("geocode → provider → rules → Gemini mock → guard", async () => {
    const r = await buildAdvisory({ location: loc, profile: profile() }, { openMeteo: om, geminiKey: "k", gemini: async () => ai, now: () => NOW });
    expect(r.air.status).toBe("ok");
    expect(r.advisory.mode).toBe("ai_enriched");
    expect(r.advisory.rejectedAiItems).toBe(1);
    expect(r.advisory.recommendations.some((x) => x.pillar === "indoor")).toBe(true);
  });
  it("no Gemini key → rule-based", async () => {
    const r = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: om, now: () => NOW });
    expect(r.advisory.mode).toBe("rule_based");
  });
  it("Gemini 429 or invalid output → rule-based fallback", async () => {
    const r1 = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: om, geminiKey: "k", gemini: async () => { throw new UpstreamError("status 429", 429); }, now: () => NOW });
    expect(r1.advisory.mode).toBe("rule_based");
    expect(r1.advisory.modeReason).toMatch(/rate-limited/);
    const r2 = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: om, geminiKey: "k", gemini: async () => { throw new UpstreamError("schema"); }, now: () => NOW });
    expect(r2.advisory.modeReason).toMatch(/validation/);
  });
  it("prefers fresh ground station, falls back to model when stale, unavailable when all fail", async () => {
    const station = { ...normalizeOpenMeteo(openMeteoRaw, NOW), provider: "CPCB" as const, measurementType: "ground_station" as const };
    const fresh = await buildAdvisory({ location: DELHI, profile: profile() }, { cpcbKey: "x", cpcb: async () => station, openMeteo: om, now: () => NOW });
    expect(fresh.air.status === "ok" && fresh.air.data.provider).toBe("CPCB");
    const stale = await buildAdvisory({ location: DELHI, profile: profile() }, { cpcbKey: "x", cpcb: async () => ({ ...station, measuredAt: "2026-11-22T06:00:00.000Z" }), openMeteo: om, now: () => NOW });
    expect(stale.air.status === "ok" && stale.air.data.provider).toBe("OPEN_METEO");
    const none = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: async () => { throw new Error("down"); }, now: () => NOW });
    expect(none.air.status).toBe("unavailable");
    expect(none.advisory.liveDataAvailable).toBe(false);
  });
  it("rejects Open-Meteo older than 3 hours and returns qualitative fallback", async () => {
    const r = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: async () => ({ ...await om(), measuredAt: "2026-11-22T08:59:59.000Z" }), now: () => NOW });
    expect(r.air.status).toBe("unavailable");
    expect(r.air.attempted).toContain("Open-Meteo: stale");
    expect(r.advisory.liveDataAvailable).toBe(false);
    expect(r.advisory.recommendations.every((r) => r.basis === "Qualitative")).toBe(true);
  });
  it("accepts the exact 3-hour Open-Meteo boundary", async () => {
    const r = await resolveAirQuality(DELHI, { openMeteo: async () => ({ ...await om(), measuredAt: "2026-11-22T09:00:00.000Z" }), now: () => NOW });
    expect(r.status).toBe("ok");
  });
  it("rejects invented Gemini readings and overwrites accepted model basis in the complete pipeline", async () => {
    const generated: AiAdvisoryResponse = { ...ai, recommendations: ai.recommendations.map((r) => ({ ...r, basis: "Measured", what: r.id === "r" ? "Outdoor AQI is 5" : r.what })) };
    const r = await buildAdvisory({ location: DELHI, profile: profile() }, { openMeteo: om, geminiKey: "test", gemini: async () => generated, now: () => NOW });
    expect(r.advisory.rejectedAiItems).toBe(2);
    expect(r.advisory.recommendations.some((r) => r.id === "r")).toBe(false);
    expect(r.advisory.recommendations.find((r) => r.id === "s")?.basis).toBe("Estimated");
  });
  it("shares remaining time across CPCB and WAQI instead of restarting the budget", async () => {
    vi.useFakeTimers(); cacheClear();
    let count = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      count++;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response("down", { status: 500 })), 4000);
        init.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
      });
    }));
    try {
      const pending = resolveAirQuality(DELHI, { cpcbKey: "test", waqiToken: "test", now: () => NOW });
      await vi.advanceTimersByTimeAsync(12_000);
      const r = await pending;
      expect(count).toBe(3);
      expect(r.status).toBe("unavailable");
      expect(r.attempted).toContain("CPCB: failed");
      expect(r.attempted).toContain("WAQI: deadline exceeded");
      expect(r.attempted).toContain("Open-Meteo: deadline exceeded");
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); cacheClear(); }
  });
  it("bounds the sequential waterfall including retries to 12 seconds", async () => {
    vi.useFakeTimers();
    cacheClear();
    let count = 0;
    let aborted = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      count++;
      return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => { aborted++; reject(new Error("aborted")); }, { once: true }));
    }));
    try {
      const started = Date.now();
      const pending = resolveAirQuality(DELHI, { cpcbKey: "test", waqiToken: "test", now: () => NOW });
      await vi.advanceTimersByTimeAsync(12_000);
      const r = await pending;
      expect(PROVIDER_DEADLINE_MS).toBe(12_000);
      expect(Date.now() - started).toBe(12_000);
      expect(r.status).toBe("unavailable");
      expect(count).toBe(2);
      expect(aborted).toBe(2);
      expect(r.attempted).toContain("Open-Meteo: deadline exceeded");
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); cacheClear(); }
  });
  it("includes response JSON consumption in the upstream deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    try {
      const pending = fetchJson("https://upstream.test", { timeoutMs: 6000, deadlineAt: Date.now() + 1000 });
      const check = expect(pending).rejects.toMatchObject({ reason: "deadline" });
      await vi.advanceTimersByTimeAsync(1000);
      await check;
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
