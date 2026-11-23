import { render, screen, within } from "@testing-library/react";
import { RecommendationCards } from "@/components/dashboard/RecommendationCards";
import { runRuleEngine } from "@/domain/ruleEngine";
import { air, NOW, profile } from "../fixtures/payloads";

describe("RecommendationCards", () => {
  it("renders three pillars and four-part cards with basis", () => {
    const a = runRuleEngine(air(), profile(), NOW);
    render(<RecommendationCards advisory={a} />);
    expect(screen.getByText("Low-emission daily routines")).toBeInTheDocument();
    expect(screen.getByText("Indoor air-quality guidance")).toBeInTheDocument();
    expect(screen.getByText("Sustainable alternatives & impact")).toBeInTheDocument();
    const card = screen.getByRole("article", { name: a.recommendations[0]!.title });
    for (const l of ["What to do", "Why it is recommended", "How it helps", "Limitation or trade-off", "Estimated"]) expect(within(card).getByText(l)).toBeInTheDocument();
  });
});
