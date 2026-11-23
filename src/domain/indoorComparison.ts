import type { HouseholdProfile, NormalizedAirQuality } from "@/types/airQuality";

export const MAX_COMPARABLE_GAP_MIN = 120;

export type IndoorComparison =
  | { status: "no_indoor" }
  | { status: "no_outdoor_pm25"; indoorPm25: number }
  | { status: "not_comparable"; indoorPm25: number; outdoorPm25: number; gapMinutes: number }
  | { status: "comparable"; indoorPm25: number; outdoorPm25: number; gapMinutes: number; indoorHigher: boolean };

/**
 * Compares user-reported indoor PM2.5 with outdoor PM2.5 only when both exist and
 * timestamps are within 2 hours. Never produces an indoor AQI.
 */
export function compareIndoorOutdoor(
  profile: HouseholdProfile,
  air: NormalizedAirQuality | null,
  now: Date = new Date(),
): IndoorComparison {
  if (!profile.hasIndoorSensor || profile.indoorPm25 === null) return { status: "no_indoor" };
  const indoorPm25 = profile.indoorPm25;
  const outdoorPm25 = air?.pollutants.pm25 ?? null;
  if (!air || outdoorPm25 === null) return { status: "no_outdoor_pm25", indoorPm25 };
  const indoorAt = now.getTime() - (profile.indoorReadingAgeMinutes ?? 0) * 60000;
  const gapMinutes = Math.round(Math.abs(indoorAt - new Date(air.measuredAt).getTime()) / 60000);
  if (gapMinutes > MAX_COMPARABLE_GAP_MIN) return { status: "not_comparable", indoorPm25, outdoorPm25, gapMinutes };
  return { status: "comparable", indoorPm25, outdoorPm25, gapMinutes, indoorHigher: indoorPm25 > outdoorPm25 };
}
