import { Bus, Home, Leaf } from "lucide-react";
import type { Advisory, Pillar } from "@/types/airQuality";

export const PILLARS: Record<Pillar, { title: string; Icon: typeof Bus }> = {
  routines: { title: "Low-emission daily routines", Icon: Bus },
  indoor: { title: "Indoor air-quality guidance", Icon: Home },
  sustainable: { title: "Sustainable alternatives & impact", Icon: Leaf },
};

/** Recommendations grouped by the three pillars with the mandatory four-part structure and basis badge. */
export function RecommendationCards({ advisory }: { advisory: Advisory }) {
  return (
    <section aria-labelledby="rec-h" className="space-y-4">
      <h2 id="rec-h" className="text-2xl font-semibold">
        What to do today
      </h2>
      {(Object.keys(PILLARS) as Pillar[]).map((pl) => {
        const { title, Icon } = PILLARS[pl];
        const items = advisory.recommendations.filter((r) => r.pillar === pl);
        return (
          <section key={pl} aria-labelledby={`p-${pl}`} className="space-y-3">
            <h3 id={`p-${pl}`} className="flex items-center gap-2 text-lg font-semibold">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              {title}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((r) => (
                <article key={r.id} className="card-surface p-4 space-y-2" aria-label={r.title}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold">{r.title}</h4>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                      {r.basis}
                    </span>
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    <div>
                      <dt className="font-semibold">What to do</dt>
                      <dd>{r.what}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Why it is recommended</dt>
                      <dd className="text-muted-foreground">{r.why}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">How it helps</dt>
                      <dd className="text-muted-foreground">{r.how}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Limitation or trade-off</dt>
                      <dd className="text-muted-foreground">{r.limitation}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
