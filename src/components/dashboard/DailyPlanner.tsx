import { Moon, Sun, Sunrise } from "lucide-react";
import type { Planner } from "@/types/airQuality";
import { PILLARS } from "./pillarMetadata";

const PERIODS = [
  { key: "morning", label: "Morning", Icon: Sunrise },
  { key: "afternoon", label: "Afternoon", Icon: Sun },
  { key: "evening", label: "Evening", Icon: Moon },
] as const;

/** Morning / Afternoon / Evening action plan. */
export function DailyPlanner({ planner }: { planner: Planner }) {
  return (
    <section aria-labelledby="plan-h" className="card-surface p-5">
      <h2 id="plan-h" className="mb-4 text-2xl font-semibold">
        Today's plan
      </h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {PERIODS.map(({ key, label, Icon }) => {
          const plannerSlot = planner[key];
          return (
            <li key={key} className="space-y-1.5 rounded-md bg-muted p-4" aria-label={label}>
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Suggested action: </span>
                {plannerSlot.action}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Reason: </span>
                {plannerSlot.reason}
              </p>
              <p className="text-xs">
                <span className="font-semibold">Focus pillar: </span>
                {PILLARS[plannerSlot.pillar].title}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
