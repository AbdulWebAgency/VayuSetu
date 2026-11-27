import { guardAiAdvisory, rejectReason, unsupportedEnvironmentalClaim } from "@/domain/outputGuard";
import { runRuleEngine } from "@/domain/ruleEngine";
import { GeminiChoicesSchema } from "@/types/airQuality";
import { eligibleChoices } from "@/domain/advisoryPersonalization";
import { air, NOW, profile } from "../fixtures/payloads";

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
  const choices = eligibleChoices(base, p);
  it.each([
    [null, null, "rule_based", 0],
    ["sustain-transport", null, "rule_based", 0],
    [null, "car-trips", "rule_based", 1],
    ["sustain-energy", "car-trips", "ai_enriched", 1],
  ] as const)(
    "reflects only visible choices %s / %s",
    (priorityId, explanationId, mode, rejected) => {
      const result = guardAiAdvisory({ priorityId, explanationId }, p, base, choices, air());
      expect(result.mode).toBe(mode);
      expect(result.rejectedAiItems).toBe(rejected);
      expect(result.planner).toEqual(base.planner);
      expect(result.ventilation).toBe(base.ventilation);
      expect(result.modeReason).not.toContain("selected the explanation");
      if (mode === "rule_based") expect(result.recommendations).toEqual(base.recommendations);
      else {
        expect(result.modeReason).toContain("prioritized household energy");
        expect(result.recommendations).toEqual([
          ...base.recommendations.slice(0, -2),
          ...base.recommendations.slice(-2).reverse(),
        ]);
      }
    },
  );
  it("requires the target card and both sustainable cards for eligibility", () => {
    const missing = { ...base, recommendations: [] };
    expect(eligibleChoices(missing, profile({ youngChildren: true }))).toEqual({
      priorities: [],
      explanations: [],
    });
    const result = guardAiAdvisory(
      { priorityId: "sustain-energy", explanationId: "child-play" },
      p,
      missing,
      eligibleChoices(missing, p),
      air(),
    );
    expect(result).toMatchObject({ mode: "rule_based", rejectedAiItems: 2, recommendations: [] });
  });
  it.each(["CPCB", "WAQI", "OPEN_METEO"] as const)(
    "preserves every baseline evidence label for %s",
    (provider) => {
      const source = air({
        provider,
        measurementType: provider === "OPEN_METEO" ? "model_estimate" : "ground_station",
      });
      const baseline = runRuleEngine(source, p, NOW);
      const result = guardAiAdvisory(
        { priorityId: "sustain-energy", explanationId: null },
        p,
        baseline,
        eligibleChoices(baseline, p),
        source,
      );
      for (const card of baseline.recommendations)
        expect(result.recommendations.find((r) => r.id === card.id)).toEqual(card);
    },
  );
  it.each([null, air({ measuredAt: "2026-11-22T08:59:00.000Z" })])(
    "preserves qualitative provenance for absent or stale evidence",
    (source) => {
      const baseline = runRuleEngine(source, p, NOW);
      const result = guardAiAdvisory(
        { priorityId: "sustain-energy", explanationId: null },
        p,
        baseline,
        eligibleChoices(baseline, p),
        source,
      );
      expect(result.recommendations.every((card) => card.basis === "Qualitative")).toBe(true);
      expect(unsupportedEnvironmentalClaim("AQI is 230", p, null)).toBe(true);
    },
  );
  it.each([
    "AQI is 5",
    "PM2.5 is 65 µg/m³",
    "PM10 is 999",
    "NO2 is 40",
    "SO2 is 12",
    "O3 is 30",
    "CO is 900",
  ])("rejects unsupported environmental claims: %s", (text) => {
    expect(unsupportedEnvironmentalClaim(text, p, air())).toBe(true);
  });
  it("accepts only verified values for each pollutant, including full names and user-reported indoor PM2.5", () => {
    const source = air({ pollutants: { pm25: 180, pm10: 260, no2: 40, so2: 12, o3: 30, co: 900 } });
    for (const text of [
      "AQI is 230",
      "PM₂.₅ is 180 µg/m³",
      "PM10 is 260",
      "NO2 is 40",
      "Sulfur dioxide is 12",
      "Ozone is 30",
      "Carbon monoxide is 900",
    ])
      expect(unsupportedEnvironmentalClaim(text, p, source)).toBe(false);
    expect(unsupportedEnvironmentalClaim("PM2.5 is 260", p, source)).toBe(true);
    const indoor = profile({ hasIndoorSensor: true, indoorPm25: 65 });
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 65 µg/m³", indoor, source)).toBe(false);
    expect(unsupportedEnvironmentalClaim("Outdoor PM2.5 is 65 µg/m³", indoor, source)).toBe(true);
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 180 µg/m³", indoor, source)).toBe(true);
    expect(unsupportedEnvironmentalClaim("Indoor PM2.5 is 65 µg/m³", p, source)).toBe(true);
  });
  it.each([
    { planner: { morning: { reason: "AQI is 5" } } },
    { recommendations: [{ title: "Outdoor PM2.5", what: "It is 65 µg/m³" }] },
    { priorityId: "invented" },
    { explanationId: "invented" },
  ])("rejects unauthorized model content %#", (extra) => {
    const raw = { priorityId: null, explanationId: null, ...extra };
    expect(GeminiChoicesSchema.safeParse(raw).success).toBe(false);
    const result = guardAiAdvisory(raw, p, base, choices, air());
    expect(result.recommendations).toEqual(base.recommendations);
    expect(result.planner).toEqual(base.planner);
    expect(result.mode).toBe("rule_based");
  });
  it.each([
    "Air quality index is 5",
    "Outdoor PM2.5 is 65 and indoor PM2.5 is 180",
    "PM2.5 will drop by 180",
    "PM2.5 is 180 ppm",
    "PM2.5 tomorrow will be 180",
  ])("rejects unsupported attribution, unit or forecast claims: %s", (text) => {
    expect(
      unsupportedEnvironmentalClaim(
        text,
        profile({ hasIndoorSensor: true, indoorPm25: 65 }),
        air(),
      ),
    ).toBe(true);
  });
  it.each([
    "Keep the HEPA unit running",
    "Use an air cleaner",
    "AQI inside your home is 150",
    "This reduces exposure by 20 percent",
    "This reduces exposure by fifty percent",
    "Treat asthma with this routine",
    "Prescribe an inhaler",
  ])("rejects strengthened household and medical claims: %s", (text) => {
    expect(rejectReason(text, p)).not.toBeNull();
  });
});

it("blocks a contradictory Gemini afternoon action under high outdoor pollution", () => {
  const household = profile({ youngChildren: true });
  const baseline = runRuleEngine(air(), household, NOW);
  const afternoon = {
    action: "Play outdoors this afternoon.",
    reason: "Enjoy the afternoon.",
    pillar: "routines" as const,
  };
  const result = guardAiAdvisory(
    { recommendations: baseline.recommendations, planner: { ...baseline.planner, afternoon } },
    household,
    baseline,
    eligibleChoices(baseline, household),
    air(),
  );
  expect(result.planner.afternoon).toEqual(baseline.planner.afternoon);
});
