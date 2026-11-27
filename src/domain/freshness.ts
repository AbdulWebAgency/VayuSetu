import type { Freshness, NormalizedAirQuality } from "@/types/airQuality";

export type { Freshness } from "@/types/airQuality";

/**
 * Freshness from the provider's measuredAt (never fetchedAt).
 * Ground stations: live ≤90 min, aging ≤3 h, else stale. Model: live ≤3 h, else stale.
 */
export function computeFreshness(
  measuredAt: string,
  measurementType: NormalizedAirQuality["measurementType"],
  now: Date = new Date(),
): Freshness {
  const ageMin = (now.getTime() - new Date(measuredAt).getTime()) / 60000;
  if (!Number.isFinite(ageMin) || ageMin < 0) return "stale";
  if (measurementType === "ground_station") {
    if (ageMin <= 90) return "live";
    if (ageMin <= 180) return "aging";
    return "stale";
  }
  return ageMin <= 180 ? "live" : "stale";
}

/** Minutes between measuredAt and now (rounded, floor 0). */
export function ageMinutes(measuredAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(measuredAt).getTime()) / 60000));
}
