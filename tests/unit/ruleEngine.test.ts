import { SCENARIOS } from "@/domain/catalogues";
import { compareIndoorOutdoor } from "@/domain/indoorComparison";
import { normalizeWaqi } from "@/domain/normalizer";
import { buildContext, pm25Band, runRuleEngine, sensitivityTier } from "@/domain/ruleEngine";
import { air, NOW, profile, waqiRaw } from "../fixtures/payloads";

describe("rule engine", () => {
  it("bands PM2.5 using CPCB breakpoints", () => {
    expect(pm25Band(30)).toBe("good");
    expect(pm25Band(61)).toBe("moderate");
    expect(pm25Band(251)).toBe("severe");
    expect(pm25Band(null)).toBe("unknown");
  });
  it("sensitivity tier rises with vulnerable members", () => {
    expect(sensitivityTier(profile())).toBe("standard");
    expect(sensitivityTier(profile({ elderly: true }))).toBe("elevated");
    expect(sensitivityTier(profile({ respiratorySensitivity: true }))).toBe("high");
  });
  it("covers all three pillars and three planner periods", () => {
    const a = runRuleEngine(air(), profile(), NOW);
    expect(new Set(a.recommendations.map((r) => r.pillar))).toEqual(
      new Set(["routines", "indoor", "sustainable"]),
    );
    expect(a.planner.morning.action.length).toBeGreaterThan(3);
  });
  it("never recommends running a purifier the household does not own", () => {
    const a = runRuleEngine(air(), profile({ hasAirPurifier: false }), NOW);
    expect(a.recommendations.some((r) => r.id === "indoor-purifier")).toBe(false);
    expect(a.planner.evening.action).not.toMatch(/purifier/i);
  });
  it("model data â†’ Estimated basis; stale data â†’ Qualitative and not live", () => {
    expect(runRuleEngine(air(), profile(), NOW).recommendations[0]?.basis).toBe("Estimated");
    const stale = runRuleEngine(air({ measuredAt: "2026-11-22T07:00:00.000Z" }), profile(), NOW);
    expect(stale.liveDataAvailable).toBe(false);
    expect(stale.recommendations[0]?.basis).toBe("Qualitative");
  });
  it("moves outdoor exercise indoors when PM2.5 is poor or worse", () => {
    const a = runRuleEngine(air(), profile({ exerciseRoutine: "morning_outdoor" }), NOW);
    expect(a.planner.morning.action).toMatch(/indoors/i);
  });
});

describe("outdoor evidence decisions", () => {
  it("keeps high outdoor precautions when indoor PM2.5 is higher", () => {
    const advisory = runRuleEngine(
      air(),
      profile({ hasIndoorSensor: true, indoorPm25: 250, indoorReadingAgeMinutes: 60 }),
      NOW,
    );
    expect(advisory.ventilation).toMatch(/outdoor.*high/i);
    expect(advisory.ventilation).toMatch(/indoor.*higher/i);
    expect(advisory.recommendations.find((r) => r.id === "indoor-ventilation")?.what).toBe(
      advisory.ventilation,
    );
  });

  it("distinguishes partial evidence from unavailable data", () => {
    const partial = runRuleEngine(
      air({
        aqi: null,
        pollutants: { pm25: null, pm10: 0, no2: null, so2: null, o3: null, co: null },
      }),
      profile(),
      NOW,
    );
    expect(partial.liveDataAvailable).toBe(true);
    expect(partial.pm25Band).toBe("unknown");
    expect(partial.ventilation).toMatch(/insufficient/i);
    expect(runRuleEngine(null, profile(), NOW).ventilation).toMatch(/unavailable/i);
  });

  it("uses the high-activity decision throughout the Hyderabad advisory", async () => {
    const { SCENARIOS } = await import("@/domain/catalogues");
    const household = SCENARIOS.find((s) => s.cityName === "Hyderabad");
    if (!household) throw new Error("Missing Hyderabad preset");
    const advisory = runRuleEngine(air(), household.profile, NOW);
    expect(advisory.recommendations.find((r) => r.id === "routine-exercise")?.what).toMatch(
      /indoor/i,
    );
    expect(advisory.planner.afternoon.action).toMatch(/indoor/i);
  });
});

describe("outdoor classification and evidence", () => {
  const pollutants = { pm25: null, pm10: null, no2: null, so2: null, o3: null, co: null };

  it.each([
    [150, "lower"],
    [151, "high"],
  ] as const)("classifies WAQI %i as %s and cites its scale", (value, expected) => {
    const reading = normalizeWaqi({ ...waqiRaw, data: { ...waqiRaw.data, aqi: value } }, NOW);
    expect(buildContext(reading, profile(), NOW).outdoorCondition).toBe(expected);
    const advisory = runRuleEngine(reading, profile(), NOW);
    const why = advisory.recommendations.find((r) => r.id === "routine-commute")?.why;
    expect(why).toContain(`US EPA AQI ${value}`);
    expect(why).not.toMatch(/PM2.5|no verified live outdoor reading/i);
  });

  it.each([
    [90, "moderate", "lower"],
    [90.1, "poor", "high"],
  ] as const)("classifies PM2.5 %i at the high boundary", (pm25, band, condition) => {
    const reading = air({ aqi: null, pollutants: { ...pollutants, pm25 } });
    expect(pm25Band(pm25)).toBe(band);
    expect(buildContext(reading, profile(), NOW)).toMatchObject({
      band,
      outdoorCondition: condition,
    });
  });

  it.each([
    [151, 30],
    [150, 91],
  ])("gives high evidence precedence for AQI %i and PM2.5 %i", (value, pm25) => {
    const reading = air({ aqi: { value, scale: "US_EPA" }, pollutants: { ...pollutants, pm25 } });
    expect(buildContext(reading, profile(), NOW).outdoorCondition).toBe("high");
    const why = runRuleEngine(reading, profile(), NOW).recommendations.find(
      (r) => r.id === "routine-commute",
    )?.why;
    expect(why).toContain(`US EPA AQI ${value}`);
    expect(why).toContain(`PM2.5 ${pm25} µg/m³ (${pm25Band(pm25)})`);
  });

  it.each([
    [30, "lower"],
    [null, "unknown"],
  ] as const)("aligns Hyderabad activities for PM2.5 %s", (pm25, condition) => {
    const household = SCENARIOS.find((s) => s.cityName === "Hyderabad");
    if (!household) throw new Error("Missing Hyderabad preset");
    const reading = air({ aqi: null, pollutants: { ...pollutants, pm25, pm10: 50 } });
    expect(buildContext(reading, household.profile, NOW).outdoorCondition).toBe(condition);
    const advisory = runRuleEngine(reading, household.profile, NOW);
    const afternoon = advisory.planner.afternoon;
    expect(afternoon.action).toBe(
      advisory.recommendations.find((r) => r.id === "routine-exercise")?.what,
    );
    expect(afternoon.action).toMatch(
      condition === "lower" ? /if local conditions allow/i : /indoor.*until a current reading/i,
    );
    expect(afternoon.reason).toMatch(/recheck/i);
  });

  it("avoids predicting a local evening rise from an unknown current condition", () => {
    const advisory = runRuleEngine(null, profile(), NOW);
    expect(advisory.planner.evening.reason).not.toContain(
      "Evening traffic and cooling air raise outdoor particles",
    );
  });

  it("excludes stale outdoor evidence even when the indoor observation was contemporaneous", () => {
    const reading = air({ measuredAt: new Date(NOW.getTime() - 181 * 60000).toISOString() });
    const household = profile({
      hasIndoorSensor: true,
      indoorPm25: 250,
      indoorReadingAgeMinutes: 181,
    });
    expect(compareIndoorOutdoor(household, reading, NOW).status).toBe("comparable");
    expect(buildContext(reading, household, NOW)).toMatchObject({
      outdoorCondition: "unknown",
      usable: false,
      indoor: { status: "no_outdoor_pm25" },
    });
    expect(runRuleEngine(reading, household, NOW).ventilation).toMatch(/unavailable/i);
  });
});
