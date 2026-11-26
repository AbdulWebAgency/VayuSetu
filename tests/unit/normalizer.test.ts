import {
  haversineKm,
  normalizeCpcb,
  normalizeGeocode,
  normalizeOpenMeteo,
  normalizeWaqi,
  parseCpcbTime,
} from "@/domain/normalizer";
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
    const n = normalizeOpenMeteo(
      { ...openMeteoRaw, current: { ...openMeteoRaw.current, us_aqi: null } },
      NOW,
    );
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
    const n = normalizeCpcb(
      {
        records: [
          row,
          { ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:30:00", avg_value: "310" },
        ],
      },
      DELHI_COORDS,
      NOW,
    );
    expect(n?.pollutants.pm10).toBe(310);
    expect(n?.measuredAt).toBe("2026-11-22T10:00:00.000Z");
  });
  it("excludes per-pollutant timestamps more than 90 minutes apart", () => {
    const n = normalizeCpcb(
      {
        records: [
          { ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:29:59", avg_value: "310" },
          row,
        ],
      },
      DELHI_COORDS,
      NOW,
    );
    expect(n?.pollutants.pm25).toBe(201);
    expect(n?.pollutants.pm10).toBeNull();
    expect(n?.measuredAt).toBe("2026-11-22T11:30:00.000Z");
  });
  it("excludes stale rows even when their timestamps are within the comparability window", () => {
    const n = normalizeCpcb(
      {
        records: [
          { ...row, last_update: "22-11-2026 14:29:59" },
          { ...row, pollutant_id: "PM10", last_update: "22-11-2026 15:00:00" },
        ],
      },
      DELHI_COORDS,
      NOW,
    );
    expect(n?.pollutants.pm25).toBeNull();
    expect(n?.pollutants.pm10).toBe(201);
    expect(n?.measuredAt).toBe("2026-11-22T09:30:00.000Z");
  });
  it("rejects stations with only stale or invalid particulate timestamps", () => {
    for (const last_update of ["22-11-2026 14:29:59", "invalid", "22-11-2026 18:00:00"])
      expect(normalizeCpcb({ records: [{ ...row, last_update }] }, DELHI_COORDS, NOW)).toBeNull();
  });
  it("includes a station exactly 25 km away and rejects one just outside", () => {
    const origin = { lat: 0, lon: 0 };
    const latitude = (25 / 6371) * (180 / Math.PI);
    const outside = latitude + 0.000001;
    expect(haversineKm(origin, { lat: latitude, lon: 0 })).toBe(25);
    expect(haversineKm(origin, { lat: outside, lon: 0 })).toBeGreaterThan(25);
    const station = { ...row, latitude, longitude: 0 };
    expect(normalizeCpcb({ records: [station] }, origin, NOW)?.stationId).toBe(row.station);
    expect(normalizeCpcb({ records: [{ ...station, latitude: outside }] }, origin, NOW)).toBeNull();
  });
  it("uses the eligibility clock for the inclusive 180-minute row limit", () => {
    const raw = { records: [{ ...row, last_update: "22-11-2026 14:30:00" }] };
    const fetchedAt = new Date("2026-11-22T11:50:00Z");
    expect(normalizeCpcb(raw, DELHI_COORDS, fetchedAt, 25, NOW)).toMatchObject({
      measuredAt: "2026-11-22T09:00:00.000Z",
      fetchedAt: fetchedAt.toISOString(),
    });
    const later = new Date(NOW.getTime() + 1000);
    expect(normalizeCpcb(raw, DELHI_COORDS, fetchedAt, 25, later)).toBeNull();
  });
  it("replaces a farther eligible station and keeps the first station at equal distance", () => {
    const near = {
      ...row,
      station: "Near",
      latitude: DELHI_COORDS.lat,
      longitude: DELHI_COORDS.lon,
    };
    const records = [
      row,
      { ...row, pollutant_id: "SO2" },
      { ...near, avg_value: "17.125" },
      { ...near, station: "Tied", avg_value: "99" },
    ];
    expect(normalizeCpcb({ records }, DELHI_COORDS, NOW)).toMatchObject({
      stationId: "Near",
      dataCoordinates: DELHI_COORDS,
      pollutants: { pm25: 17.125, so2: null },
    });
  });
  it("requires a valid particulate and preserves a zero PM10 reading", () => {
    const gas = { ...row, pollutant_id: "NO2" };
    expect(normalizeCpcb({ records: [gas] }, DELHI_COORDS, NOW)).toBeNull();
    for (const avg_value of ["", "  ", "invalid", "-1"]) {
      expect(
        normalizeCpcb({ records: [gas, { ...row, avg_value }] }, DELHI_COORDS, NOW),
      ).toBeNull();
    }
    const zero = { ...row, pollutant_id: "PM10", avg_value: "0" };
    expect(normalizeCpcb({ records: [gas, zero] }, DELHI_COORDS, NOW)?.pollutants).toMatchObject({
      pm25: null,
      pm10: 0,
    });
  });
  it("keeps the first tied reading per pollutant and dates only the retained readings", () => {
    const records = [
      { ...row, last_update: "22-11-2026 16:00:00", avg_value: "90" },
      { ...row, pollutant_id: "pm2.5", avg_value: "15" },
      row,
      { ...row, pollutant_id: "NO2", last_update: "22-11-2026 16:30:00", avg_value: "33" },
    ];
    expect(normalizeCpcb({ records }, DELHI_COORDS, NOW)).toMatchObject({
      pollutants: { pm25: 15, no2: 33 },
      measuredAt: "2026-11-22T11:00:00.000Z",
    });
  });
  it("anchors the station window to its newest usable gas reading before requiring PM", () => {
    const near = {
      ...row,
      station: "Near",
      latitude: DELHI_COORDS.lat,
      longitude: DELHI_COORDS.lon,
    };
    const records = [
      { ...near, pollutant_id: "NO2" },
      { ...near, last_update: "22-11-2026 15:29:59" },
      row,
    ];
    expect(normalizeCpcb({ records }, DELHI_COORDS, NOW)).toMatchObject({
      stationId: row.station,
      pollutants: { no2: null, pm25: 201 },
    });
  });
});

const DELHI_COORDS = { lat: 28.6139, lon: 77.209 };
