import type { Coordinates, NormalizedAirQuality } from "@/types/airQuality";
import { normalizeOpenMeteo } from "@/domain/normalizer";
import { cacheGet, cacheSet } from "../cache/fetchCache";
import { fetchJson } from "./http";

const CURRENT = "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi";

/** Fetches Open-Meteo CAMS current air quality (no key). Raw payload cached ≤10 min; fetchedAt reflects the real fetch. */
export async function fetchOpenMeteo(c: Coordinates, deadlineAt?: number): Promise<NormalizedAirQuality> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat.toFixed(4)}&longitude=${c.lon.toFixed(4)}&current=${CURRENT}&timezone=GMT`;
  const cached = cacheGet<{ raw: unknown; at: number }>(url, 10 * 60_000);
  if (cached) return normalizeOpenMeteo(cached.raw, new Date(cached.at));
  const raw = await fetchJson(url, { timeoutMs: 6000, ...(deadlineAt === undefined ? {} : { deadlineAt }) });
  const at = Date.now();
  cacheSet(url, { raw, at });
  return normalizeOpenMeteo(raw, new Date(at));
}
