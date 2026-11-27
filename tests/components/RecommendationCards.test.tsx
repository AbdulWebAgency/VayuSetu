import { render, screen, within } from "@testing-library/react";
import { RecommendationCards } from "@/components/dashboard/RecommendationCards";
import { runRuleEngine } from "@/domain/ruleEngine";
import { buildAdvisory } from "@/server/advisoryService";
import { SCENARIOS } from "@/domain/catalogues";
import { DELHI, air, NOW, profile } from "../fixtures/payloads";

describe("RecommendationCards", () => {
  it("renders three pillars and four-part cards with basis", () => {
    const a = runRuleEngine(air(), profile(), NOW);
    render(<RecommendationCards advisory={a} />);
    expect(screen.getByText("Low-emission daily routines")).toBeInTheDocument();
    expect(screen.getByText("Indoor air-quality guidance")).toBeInTheDocument();
    expect(screen.getByText("Sustainable alternatives & impact")).toBeInTheDocument();
    const card = screen.getByRole("article", { name: a.recommendations[0]!.title });
    for (const l of [
      "What to do",
      "Why it is recommended",
      "How it helps",
      "Limitation or trade-off",
      "Estimated",
    ])
      expect(within(card).getByText(l)).toBeInTheDocument();
  });
});

describe("household personalization from service to dashboard", () => {
  const hyderabad = SCENARIOS.find((s) => s.cityName === "Hyderabad");
  if (!hyderabad) throw new Error("Missing Hyderabad household");
  const high = air();
  const lower = air({ aqi: null, pollutants: { ...high.pollutants, pm25: 30 } });
  const unknown = air({
    aqi: null,
    provider: "CPCB",
    measurementType: "ground_station",
    pollutants: { ...high.pollutants, pm25: null },
  });
  it.each([
    {
      label: "high",
      household: hyderabad.profile,
      source: high,
      choice: "child-play",
      target: "routine-exercise",
      text: "ordinary games",
      priority: null,
    },
    {
      label: "lower",
      household: profile({ commuteMode: "private_car" }),
      source: lower,
      choice: "car-trips",
      target: "sustain-transport",
      text: "separate round trip",
      priority: "sustain-transport",
    },
    {
      label: "unknown",
      household: profile({ commuteMode: "work_from_home" }),
      source: unknown,
      choice: "home-source-control",
      target: "indoor-sources",
      text: "beyond mealtimes",
      priority: "sustain-energy",
    },
  ] as const)(
    "renders only the approved changes for $label conditions",
    async ({ household, source, choice, target, text, priority }) => {
      const baseline = runRuleEngine(source, household, NOW);
      const { advisory } = await buildAdvisory(
        { location: DELHI, profile: household },
        {
          ...(source.provider === "CPCB"
            ? { cpcbKey: "fixture", cpcb: async () => source }
            : { openMeteo: async () => source }),
          geminiKey: "fixture",
          now: () => NOW,
          gemini: async () => ({ priorityId: priority, explanationId: choice }),
        },
      );
      expect(advisory.mode).toBe("ai_enriched");
      expect(advisory.modeReason).toContain("selected the explanation");
      expect(advisory.modeReason.includes("prioritized")).toBe(priority === "sustain-energy");
      expect(advisory.planner).toEqual(baseline.planner);
      expect(advisory.ventilation).toBe(baseline.ventilation);
      const expected = baseline.recommendations.map((card) => card.id);
      if (priority === "sustain-energy")
        expected.splice(-2, 2, "sustain-energy", "sustain-transport");
      expect(advisory.recommendations.map((card) => card.id)).toEqual(expected);
      for (const card of baseline.recommendations) {
        const result = advisory.recommendations.find((r) => r.id === card.id);
        if (card.id === target) {
          expect({ ...result, how: card.how }).toEqual(card);
          expect(result?.how.startsWith(card.how + " ")).toBe(true);
        } else expect(result).toEqual(card);
      }
      render(<RecommendationCards advisory={advisory} />);
      const card = baseline.recommendations.find((r) => r.id === target);
      if (!card) throw new Error("Missing expected card");
      expect(
        within(screen.getByRole("article", { name: card.title })).getByText(new RegExp(text)),
      ).toBeInTheDocument();
      const region = screen.getByRole("region", { name: "Sustainable alternatives & impact" });
      expect(within(region).getAllByRole("article")[0]).toHaveAccessibleName(
        priority === "sustain-energy"
          ? "Cleaner household energy habits"
          : "Choose lower-emission trips",
      );
    },
  );
});
