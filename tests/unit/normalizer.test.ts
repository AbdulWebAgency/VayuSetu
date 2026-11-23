import { normalizeCpcb, normalizeGeocode, normalizeOpenMeteo, normalizeWaqi, parseCpcbTime } from "@/domain/normalizer";
import { cpcbRaw, geocodeRaw, NOW, openMeteoRaw, waqiRaw } from "../fixtures/payloads";

describe("normalizer", () => {
  it("labels Open-Meteo as model estimate with US EPA AQI from provider", () => {
    const n = normalizeOpenMeteo(openMeteoRaw, NOW);
    expect(n.measurementType).toBe("model_estimate");
    expect(n.aqi).toEqual({ value: 230, scale: "US_EPA" });
    expect(n.measuredAt).toBe("2026-11-22T11:00:00.000Z");
    expect(n.pollutants.pm25).toBe(180.4);
  });
  it("leaves AQI null when the provider omits it (never derived)", () => {
    const n = normalizeOpenMeteo({ ...openMeteoRaw, current: { ...openMeteoRaw.current, us_aqi: null } }, NOW);
    expect(n.aqi).toBeNull();
  });
  it("WAQI keeps sub-indices out of concentrations", () => {
    const n = normalizeWaqi(waqiRaw, NOW);
    if (!n) throw new Error("Expected WAQI reading");
    expect(n.aqi?.value).toBe(312);
    expect(n.pollutants.pm25).toBeNull();
    expect(n.measuredAt).toBe("2026-11-22T11:30:00.000Z");
  });
  it("CPCB picks the nearest station within 25 km and supplies no AQI", () => {
    const n = normalizeCpcb(cpcbRaw, { lat: 28.6139, lon: 77.209 }, NOW);
    if (!n) throw new Error("Expected CPCB reading");
    expect(n.stationName).toBe("ITO, Delhi - CPCB");
    expect(n.pollutants.pm25).toBe(201);
    expect(n.aqi).toBeNull();
  });
  it("parses CPCB IST timestamps", () => {
    expect(parseCpcbTime("22-11-2026 17:00:00")?.toISOString()).toBe("2026-11-22T11:30:00.000Z");
  });
  it("geocode keeps only Indian results inside Indian bounds", () => {
    expect(normalizeGeocode(geocodeRaw).map((r) => r.name)).toEqual(["Lucknow"]);
  });
  const row = cpcbRaw.records[0];
  if (!row) throw new Error("Missing fixture");
  it("retains pollutants within 90 minutes and uses oldest retained timestamp", () => {
    const n = normalizeCpcb({ records: [row, { ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:30:00", avg_value: "310" }] }, DELHI_COORDS, NOW);
    expect(n?.pollutants.pm10).toBe(310);
    expect(n?.measuredAt).toBe("2026-11-22T10:00:00.000Z");
  });
  it("excludes per-pollutant timestamps more than 90 minutes apart", () => {
    const n = normalizeCpcb({ records: [{ ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:29:59", avg_value: "310" }, row] }, DELHI_COORDS, NOW);
    expect(n?.pollutants.pm25).toBe(201);
    expect(n?.pollutants.pm10).toBeNull();
    expect(n?.measuredAt).toBe("2026-11-22T11:30:00.000Z");
  });
  it("excludes stale rows even when their timestamps are within the comparability window", () => {
    const n = normalizeCpcb({ records: [{ ...row, last_update: "22-11-2026 14:29:59" }, { ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:00:00" }] }, DELHI_COORDS, NOW);
    expect(n?.pollutants.pm25).toBeNull();
    expect(n?.pollutants.pm10).toBe(201);
    expect(n?.measuredAt).toBe("2026-11-22T09:30:00.000Z");
  });
  it("rejects stations with only stale or invalid particulate timestamps", () => {
    for (const last_update of ["22-11-2026 14:29:59", "invalid", "22-11-2026 18:00:00"]) expect(normalizeCpcb({ records: [{ ...row, last_update }] }, DELHI_COORDS, NOW)).toBeNull();
  });
});

const DELHI_COORDS = { lat: 28.6139, lon: 77.209 };
