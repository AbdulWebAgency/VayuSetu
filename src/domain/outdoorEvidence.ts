import type { NormalizedAirQuality } from "@/types/airQuality";

export function hasEnvironmentalValue(air: NormalizedAirQuality): boolean {
  return air.aqi !== null || Object.values(air.pollutants).some((value) => value !== null);
}
