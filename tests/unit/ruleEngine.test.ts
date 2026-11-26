import { pm25Band, runRuleEngine, sensitivityTier } from "@/domain/ruleEngine";
import { air, NOW, profile } from "../fixtures/payloads";

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
  it("model data → Estimated basis; stale data → Qualitative and not live", () => {
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
