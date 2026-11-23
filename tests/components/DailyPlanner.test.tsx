import { render, screen, within } from "@testing-library/react";
import { DailyPlanner } from "@/components/dashboard/DailyPlanner";
import { runRuleEngine } from "@/domain/ruleEngine";
import { air, NOW, profile } from "../fixtures/payloads";

describe("DailyPlanner", () => {
  it("renders morning, afternoon and evening with action, reason and pillar", () => {
    render(<DailyPlanner planner={runRuleEngine(air(), profile(), NOW).planner} />);
    for (const p of ["Morning", "Afternoon", "Evening"]) {
      const li = screen.getByRole("listitem", { name: p });
      expect(within(li).getByText(/Suggested action/)).toBeInTheDocument();
      expect(within(li).getByText(/Reason/)).toBeInTheDocument();
      expect(within(li).getByText(/Focus pillar/)).toBeInTheDocument();
    }
  });
});
