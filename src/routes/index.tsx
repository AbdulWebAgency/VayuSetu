import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Bot, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ScenarioSwitcher } from "@/components/dashboard/ScenarioSwitcher";
import { LocationSelector } from "@/components/dashboard/LocationSelector";
import { HouseholdProfileForm } from "@/components/dashboard/HouseholdProfileForm";
import { AirQualityOverview } from "@/components/dashboard/AirQualityOverview";
import { RecommendationCards } from "@/components/dashboard/RecommendationCards";
import { DailyPlanner } from "@/components/dashboard/DailyPlanner";
import { CITY_PRESETS, type Scenario } from "@/domain/catalogues";
import { runRuleEngine } from "@/domain/ruleEngine";
import { useHouseholdProfile } from "@/hooks/useHouseholdProfile";
import { ApiError, fetchAdvisory, fetchAirQuality } from "@/lib/api";
import type {
  Advisory,
  AirQualityResponse,
  HouseholdProfile,
  ResolvedLocation,
} from "@/types/airQuality";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VayuSetu — Winter Smog Assistant for Indian Households" },
      {
        name: "description",
        content:
          "Verified outdoor air data turned into daily routines, indoor air and low-emission actions for Indian urban families.",
      },
      { property: "og:title", content: "VayuSetu — Winter Smog Assistant" },
      {
        property: "og:description",
        content:
          "Practical daily decisions for Indian households during winter smog, based on verified air-quality data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [profile, setProfile] = useHouseholdProfile();
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [air, setAir] = useState<AirQualityResponse | null>(null);
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenario, setScenario] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const reqId = useRef(0);

  const run = useCallback(async (loc: ResolvedLocation, prof: HouseholdProfile) => {
    const id = ++reqId.current;
    setLoading(true);
    setStatus(`Loading guidance for ${loc.name}…`);
    try {
      const r = await fetchAdvisory(loc, prof);
      if (id !== reqId.current) return;
      setAir(r.air);
      setAdvisory(r.advisory);
      setStatus(
        `${r.advisory.mode === "ai_enriched" ? "AI-enriched" : "Rule-based"} guidance ready for ${loc.name}.`,
      );
    } catch (e) {
      if (id !== reqId.current) return;
      // Deterministic client fallback (e.g. 429 on advisory): fetch data only, run rules locally.
      let a: AirQualityResponse;
      try {
        a = await fetchAirQuality(loc);
      } catch {
        a = {
          status: "unavailable",
          message: "Live Environmental Data Unavailable",
          attempted: [],
        };
      }
      if (id !== reqId.current) return;
      const fallbackReason =
        e instanceof ApiError && e.status === 429 ? e.message : "Advisory service unavailable";
      setAir(a);
      setAdvisory(
        runRuleEngine(
          a.status === "ok" ? a.data : null,
          prof,
          new Date(),
          `${fallbackReason} — rule-based guidance`,
        ),
      );
      setStatus(`Rule-based guidance ready for ${loc.name}.`);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const confirmLocation = (l: ResolvedLocation) => {
    setScenario(null);
    setLocation(l);
    setAir(null);
    setAdvisory(null);
    void run(l, profile);
  };
  const pickScenario = (s: Scenario) => {
    const city = CITY_PRESETS.find((c) => c.name === s.cityName)!;
    setScenario(s.id);
    setProfile(s.profile);
    setLocation(city);
    setAir(null);
    setAdvisory(null);
    void run(city, s.profile);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-3xl font-semibold">VayuSetu</h1>
            <p className="text-sm text-muted-foreground">
              Winter smog assistant for Indian urban households
            </p>
          </div>
          <ScenarioSwitcher onSelect={pickScenario} activeId={scenario} />
        </div>
      </header>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <LocationSelector selected={location} onConfirm={confirmLocation} />
          <HouseholdProfileForm
            profile={profile}
            onChange={(p) => {
              setScenario(null);
              setProfile(p);
            }}
          />
          <Button
            className="w-full"
            disabled={!location || loading}
            onClick={() => location && run(location, profile)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Updating…" : "Update my guidance"}
          </Button>
        </div>
        <div className="space-y-6">
          <ErrorBoundary label="Air quality overview">
            <AirQualityOverview
              air={air}
              loading={loading}
              locationName={location?.name ?? null}
              profile={profile}
            />
          </ErrorBoundary>
          {advisory && (
            <ErrorBoundary label="Recommendations">
              <p
                className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground"
                data-testid="mode"
              >
                {advisory.mode === "ai_enriched" ? (
                  <Bot className="h-4 w-4" aria-hidden />
                ) : (
                  <ListChecks className="h-4 w-4" aria-hidden />
                )}
                {advisory.mode === "ai_enriched"
                  ? "AI-Enriched Guidance Active"
                  : "Rule-Based Guidance Active"}
                <span className="font-normal">· {advisory.modeReason}</span>
              </p>
              {!advisory.liveDataAvailable && (
                <p className="mt-2 text-sm text-muted-foreground">
                  No fresh live reading is available, so the guidance below is general precaution,
                  not live-data advice.
                </p>
              )}
              <DailyPlanner planner={advisory.planner} />
              <RecommendationCards advisory={advisory} />
              <p className="text-xs text-muted-foreground">
                VayuSetu offers general lifestyle guidance, not medical advice. Consult a doctor for
                health concerns.
              </p>
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}
