import { SCENARIOS, type Scenario } from "@/domain/catalogues";

/** One-click evaluator scenarios (city + household profile). */
export function ScenarioSwitcher({ onSelect, activeId }: { onSelect: (s: Scenario) => void; activeId: string | null }) {
  return (
    <nav aria-label="Sample scenarios" className="flex flex-wrap gap-2">
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={activeId === s.id}
          onClick={() => onSelect(s)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          <span className="font-semibold">{s.id}</span> · {s.label}
        </button>
      ))}
    </nav>
  );
}
