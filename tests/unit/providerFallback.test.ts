import { describe, expect, it, vi } from "vitest";
import { resolveAirQuality } from "@/server/providers/providerHierarchy";
import { UpstreamError } from "@/server/providers/http";
import { air, DELHI, NOW } from "../fixtures/payloads";

describe("provider fallback waterfall (CPCB -> WAQI -> Open-Meteo)", () => {
  it("uses fresh CPCB observation first and skips lower-priority providers", async () => {
    const cpcb = vi.fn().mockResolvedValue(
      air({
        provider: "CPCB",
        providerName: "CPCB",
        measurementType: "ground_station",
        measuredAt: "2026-11-22T11:30:00.000Z",
      }),
    );
    const waqi = vi.fn();
    const openMeteo = vi.fn();

    const res = await resolveAirQuality(DELHI, {
      cpcbKey: "cpcb-test-key",
      waqiToken: "waqi-test-token",
      cpcb,
      waqi,
      openMeteo,
      now: () => NOW,
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.data.provider).toBe("CPCB");
    expect(res.attempted).toEqual(["CPCB: used"]);
    expect(waqi).not.toHaveBeenCalled();
    expect(openMeteo).not.toHaveBeenCalled();
  });

  it("falls back cleanly to WAQI when DATA_GOV_IN_API_KEY is unconfigured", async () => {
    const waqi = vi.fn().mockResolvedValue(
      air({
        provider: "WAQI",
        providerName: "WAQI",
        measurementType: "ground_station",
        measuredAt: "2026-11-22T11:15:00.000Z",
      }),
    );
    const openMeteo = vi.fn();

    const res = await resolveAirQuality(DELHI, {
      cpcbKey: undefined,
      waqiToken: "waqi-test-token",
      waqi,
      openMeteo,
      now: () => NOW,
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.data.provider).toBe("WAQI");
    expect(res.attempted).toEqual(["CPCB: not configured", "WAQI: used"]);
    expect(openMeteo).not.toHaveBeenCalled();
  });

  it("skips stale CPCB and failed WAQI to serve Open-Meteo CAMS model estimate", async () => {
    const cpcb = vi.fn().mockResolvedValue(
      air({
        provider: "CPCB",
        measurementType: "ground_station",
        measuredAt: "2026-11-22T07:00:00.000Z",
      }), // > 3h stale
    );
    const waqi = vi.fn().mockRejectedValue(new UpstreamError("status 503", 503));
    const openMeteo = vi.fn().mockResolvedValue(
      air({
        provider: "OPEN_METEO",
        measurementType: "model_estimate",
        measuredAt: "2026-11-22T11:00:00.000Z",
      }),
    );

    const res = await resolveAirQuality(DELHI, {
      cpcbKey: "cpcb-test-key",
      waqiToken: "waqi-test-token",
      cpcb,
      waqi,
      openMeteo,
      now: () => NOW,
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.data.provider).toBe("OPEN_METEO");
    expect(res.attempted).toEqual(["CPCB: stale", "WAQI: failed", "Open-Meteo: used"]);
  });

  it("returns explicit unavailable state with full audit trail when all providers fail", async () => {
    const res = await resolveAirQuality(DELHI, {
      cpcbKey: undefined,
      waqiToken: undefined,
      openMeteo: vi.fn().mockRejectedValue(new UpstreamError("network")),
      now: () => NOW,
    });

    expect(res.status).toBe("unavailable");
    if (res.status === "unavailable") {
      expect(res.message).toBe("Live Environmental Data Unavailable");
    }
    expect(res.attempted).toEqual([
      "CPCB: not configured",
      "WAQI: not configured",
      "Open-Meteo: failed",
    ]);
  });
});

describe("environmental values", () => {
  it("continues past an empty WAQI response", async () => {
    const { normalizeWaqi } = await import("@/domain/normalizer");
    const { waqiRaw } = await import("../fixtures/payloads");
    const empty = normalizeWaqi({ ...waqiRaw, data: { ...waqiRaw.data, aqi: "-" } }, NOW);
    const model = air();
    const result = await resolveAirQuality(DELHI, {
      waqiToken: "fixture",
      waqi: async () => empty,
      openMeteo: async () => model,
      now: () => NOW,
    });
    expect(result).toMatchObject({
      status: "ok",
      data: model,
      attempted: [
        "CPCB: not configured",
        "WAQI: no usable environmental values",
        "Open-Meteo: used",
      ],
    });
  });

  it("retains AQI-only WAQI with a genuine zero", async () => {
    const { normalizeWaqi } = await import("@/domain/normalizer");
    const { waqiRaw } = await import("../fixtures/payloads");
    const data = normalizeWaqi({ ...waqiRaw, data: { ...waqiRaw.data, aqi: 0 } }, NOW);
    const openMeteo = vi.fn();
    const result = await resolveAirQuality(DELHI, {
      waqiToken: "fixture",
      waqi: async () => data,
      openMeteo,
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "ok", data: { provider: "WAQI", aqi: { value: 0 } } });
    expect(openMeteo).not.toHaveBeenCalled();
  });

  it("rejects an empty final model", async () => {
    const { normalizeOpenMeteo } = await import("@/domain/normalizer");
    const { openMeteoRaw } = await import("../fixtures/payloads");
    const data = normalizeOpenMeteo(
      { ...openMeteoRaw, current: { time: openMeteoRaw.current.time } },
      NOW,
    );
    const result = await resolveAirQuality(DELHI, { openMeteo: async () => data, now: () => NOW });
    expect(result.status).toBe("unavailable");
    expect(result.attempted.at(-1)).toBe("Open-Meteo: no usable environmental values");
  });
});
