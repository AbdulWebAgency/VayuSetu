import { guardAiAdvisory, rejectReason, unsupportedEnvironmentalClaim } from "@/domain/outputGuard";
import { runRuleEngine } from "@/domain/ruleEngine";
import type { AiAdvisoryResponse } from "@/types/airQuality";
import { air, NOW, profile } from "../fixtures/payloads";

const item = (id: string, pillar: "routines" | "indoor" | "sustainable", what: string) => ({ id, pillar, title: "Title here", what, why: "Because of conditions", how: "Reduces exposure", limitation: "Costs effort", basis: "Estimated" as const });
const slot = { action: "Stay indoors", reason: "High levels", pillar: "routines" as const };

describe("output guard", () => {
  const p = profile({ hasAirPurifier: false });
  const base = runRuleEngine(air(), p, NOW);
  it("rejects purifier assumptions, indoor AQI, percentages and medical claims", () => {
    expect(rejectReason("Run your purifier all night", p)).toBe("assumes purifier");
    expect(rejectReason("Your indoor AQI is 150", p)).toBe("indoor AQI claim");
    expect(rejectReason("This cuts exposure by 60%", p)).toBe("unverified percentage");
    expect(rejectReason("This prevents asthma", p)).toBe("medical claim");
    expect(rejectReason("Close windows during peaks", p)).toBeNull();
  });
  it("fills missing pillars from the baseline and counts rejections", () => {
    const ai: AiAdvisoryResponse = {
      recommendations: [item("a", "routines", "Carpool on Monday"), item("b", "indoor", "Run your purifier"), item("c", "routines", "Take the metro")],
      planner: { morning: slot, afternoon: slot, evening: { ...slot, action: "Turn on the purifier" } },
    };
    const g = guardAiAdvisory(ai, p, base);
    expect(g.mode).toBe("ai_enriched");
    expect(g.rejectedAiItems).toBe(2);
    expect(new Set(g.recommendations.map((r) => r.pillar))).toEqual(new Set(["routines", "indoor", "sustainable"]));
    expect(g.planner.evening).toEqual(base.planner.evening);
  });
  const guidance = (what: string, basis: "Measured" | "Estimated" | "Qualitative" = "Measured"): AiAdvisoryResponse => ({ recommendations: [{ ...item("verified", "routines", what), basis }], planner: { morning: slot, afternoon: slot, evening: slot } });
  it("overwrites Gemini basis to Estimated for fresh Open-Meteo", () => {
    const g = guardAiAdvisory(guidance("Outdoor PM2.5 is 180 µg/m³"), p, base, air(), NOW);
    expect(g.recommendations.find((r) => r.id === "verified")?.basis).toBe("Estimated");
  });
  it.each(["CPCB", "WAQI"] as const)("overwrites Gemini basis to Measured for %s ground observations", (provider) => {
    const source = air({ provider, measurementType: "ground_station" });
    const g = guardAiAdvisory(guidance("Choose quieter roads", "Estimated"), p, runRuleEngine(source, p, NOW), source, NOW);
    expect(g.recommendations.find((r) => r.id === "verified")?.basis).toBe("Measured");
  });
  it.each([null, air({ measuredAt: "2026-11-22T08:59:00.000Z" })])("uses Qualitative when source is absent or stale", (source) => {
    const g = guardAiAdvisory(guidance("Choose quieter roads"), p, runRuleEngine(source, p, NOW), source, NOW);
    expect(g.recommendations.find((r) => r.id === "verified")?.basis).toBe("Qualitative");
    expect(unsupportedEnvironmentalClaim("AQI is 230", p, null)).toBe(true);
  });
  it.each(["AQI is 5", "PM2.5 is 65 µg/m³", "PM10 is 999", "NO2 is 40", "SO2 is 12", "O3 is 30", "CO is 900"])("rejects unsupported environmental claims: %s", (text) => {
    const g = guardAiAdvisory(guidance(text), p, base, air(), NOW);
    expect(g.recommendations.some((r) => r.id === "verified")).toBe(false);
    expect(g.rejectedAiItems).toBe(1);
  });
  it("accepts only verified values for each pollutant, including full names and user-reported indoor PM2.5", () => {
    const source = air({ pollutants: { pm25: 180, pm10: 260, no2: 40, so2: 12, o3: 30, co: 900 } });
    for (const text of ["AQI is 230", "PM₂.₅ is 180 µg/m³", "PM10 is 260", "NO2 is 40", "Sulfur dioxide is 12", "Ozone is 30", "Carbon monoxide is 900"]) expect(unsupportedEnvironmentalClaim(text, p, source)).toBe(false);
    expect(unsupportedEnvironmentalClaim("PM2.5 is 260", p, source)).toBe(true);
    const indoor = profile({ hasIndoorSensor: true, indoorPm25: 65 });
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 65 µg/m³", indoor, source)).toBe(false);
    expect(unsupportedEnvironmentalClaim("Outdoor PM2.5 is 65 µg/m³", indoor, source)).toBe(true);
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 180 µg/m³", indoor, source)).toBe(true);
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 65 µg/m³", p, source)).toBe(true);
  });
  it("applies numerical integrity to planner slots too", () => {
    const ai = guidance("Choose quieter roads");
    ai.planner.morning = { ...slot, reason: "AQI is 5" };
    const g = guardAiAdvisory(ai, p, base, air(), NOW);
    expect(g.planner.morning).toEqual(base.planner.morning);
    expect(g.rejectedAiItems).toBe(1);
  });
  it("rejects numerical claims spread across recommendation fields", () => {
    const ai = guidance("It is 65 µg/m³");
    const first = ai.recommendations[0];
    if (!first) throw new Error("Missing recommendation");
    first.title = "Outdoor PM2.5";
    const g = guardAiAdvisory(ai, p, base, air(), NOW);
    expect(g.recommendations.some((r) => r.id === "verified")).toBe(false);
  });
  it.each(["Air quality index is 5", "Outdoor PM2.5 is 65 and indoor PM2.5 is 180", "PM2.5 will drop by 180", "PM2.5 is 180 ppm", "PM2.5 tomorrow will be 180"])("rejects unsupported attribution, unit or forecast claims: %s", (text) => {
    expect(unsupportedEnvironmentalClaim(text, profile({ hasIndoorSensor: true, indoorPm25: 65 }), air())).toBe(true);
  });
  it.each(["Keep the HEPA unit running", "Use an air cleaner", "AQI inside your home is 150", "This reduces exposure by 20 percent", "This reduces exposure by fifty percent", "Treat asthma with this routine", "Prescribe an inhaler"])("rejects strengthened household and medical claims: %s", (text) => {
    expect(rejectReason(text, p)).not.toBeNull();
  });
});
