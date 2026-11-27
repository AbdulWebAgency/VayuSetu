import { compareIndoorOutdoor } from "@/domain/indoorComparison";
import { air, NOW, profile } from "../fixtures/payloads";

describe("indoor comparison", () => {
  it("no indoor reading → no_indoor", () => {
    expect(compareIndoorOutdoor(profile(), air(), NOW).status).toBe("no_indoor");
  });
  it("comparable when within 2 h of outdoor measuredAt; never returns an AQI", () => {
    const r = compareIndoorOutdoor(
      profile({ hasIndoorSensor: true, indoorPm25: 220, indoorReadingAgeMinutes: 10 }),
      air(),
      NOW,
    );
    expect(r).toEqual({
      status: "comparable",
      indoorPm25: 220,
      outdoorPm25: 180,
      gapMinutes: 50,
      indoorHigher: true,
    });
    expect(JSON.stringify(r)).not.toMatch(/aqi/i);
  });
  it("not comparable when more than 2 h apart", () => {
    const r = compareIndoorOutdoor(
      profile({ hasIndoorSensor: true, indoorPm25: 50, indoorReadingAgeMinutes: 0 }),
      air({ measuredAt: "2026-11-22T09:30:00.000Z" }),
      NOW,
    );
    expect(r.status).toBe("not_comparable");
  });
  it("no outdoor PM2.5 → cannot compare", () => {
    const r = compareIndoorOutdoor(
      profile({ hasIndoorSensor: true, indoorPm25: 50, indoorReadingAgeMinutes: 0 }),
      air({ pollutants: { pm25: null, pm10: null, no2: null, so2: null, o3: null, co: null } }),
      NOW,
    );
    expect(r.status).toBe("no_outdoor_pm25");
  });
});

it("uses the absolute observation time and compares milliseconds before rounding", () => {
  const outdoor = air({ measuredAt: NOW.toISOString() });
  for (const [gap, expected] of [
    [7200000, "comparable"],
    [7200001, "not_comparable"],
  ] as const) {
    const p = profile({
      hasIndoorSensor: true,
      indoorPm25: 45,
      indoorReadingAgeMinutes: 0,
      indoorMeasuredAt: new Date(NOW.getTime() - gap).toISOString(),
    });
    expect(compareIndoorOutdoor(p, outdoor, NOW).status).toBe(expected);
  }
  expect(
    compareIndoorOutdoor(profile({ hasIndoorSensor: true, indoorPm25: 45 }), outdoor, NOW).status,
  ).toBe("unknown_time");
});
