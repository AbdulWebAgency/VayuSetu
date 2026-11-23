import type { ResolvedLocation } from "@/types/airQuality";
import { normalizeGeocode } from "@/domain/normalizer";
import { cacheGet, cacheSet } from "../cache/fetchCache";
import { fetchJson } from "./http";

/** Resolves a place name to Indian locations only via Open-Meteo Geocoding. */
export async function geocodeIndia(query: string): Promise<ResolvedLocation[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json&countryCode=IN`;
  const hit = cacheGet<ResolvedLocation[]>(url, 24 * 3600_000);
  if (hit) return hit;
  const results = normalizeGeocode(await fetchJson(url, { timeoutMs: 6000 }));
  cacheSet(url, results);
  return results;
}
