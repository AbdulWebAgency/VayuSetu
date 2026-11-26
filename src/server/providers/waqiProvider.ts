import type { Coordinates, NormalizedAirQuality } from "@/types/airQuality";
import { haversineKm, normalizeWaqi } from "@/domain/normalizer";
import { fetchJson } from "./http";

/** Queries WAQI live (never cached, per WAQI terms). Returns null if no station within 25 km. */
export async function fetchWaqi(
  c: Coordinates,
  token: string,
  deadlineAt?: number,
): Promise<NormalizedAirQuality | null> {
  const url = `https://api.waqi.info/feed/geo:${c.lat.toFixed(4)};${c.lon.toFixed(4)}/?token=${encodeURIComponent(token)}`;
  const raw = await fetchJson(url, {
    timeoutMs: 6000,
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
  });
  const n = normalizeWaqi(raw, new Date());
  if (!n || haversineKm(c, n.dataCoordinates) > 25) return null;
  return n;
}
