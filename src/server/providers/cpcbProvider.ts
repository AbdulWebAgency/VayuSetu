import type { NormalizedAirQuality, ResolvedLocation } from "@/types/airQuality";
import { normalizeCpcb } from "@/domain/normalizer";
import { cacheGet, cacheSet } from "../cache/fetchCache";
import { fetchJson } from "./http";

const RESOURCE = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";

/** Queries the CPCB real-time OGD feed on data.gov.in by city, then picks the nearest station. */
export async function fetchCpcb(
  loc: ResolvedLocation,
  apiKey: string,
  deadlineAt?: number,
): Promise<NormalizedAirQuality | null> {
  const qs = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: "1000",
    "filters[city]": loc.name,
  });
  const url = `https://api.data.gov.in/resource/${RESOURCE}?${qs}`;
  const key = `cpcb:${loc.name.toLowerCase()}`;
  let entry = cacheGet<{ raw: unknown; at: number }>(key, 10 * 60_000);
  if (!entry) {
    entry = {
      raw: await fetchJson(url, {
        timeoutMs: 6000,
        ...(deadlineAt === undefined ? {} : { deadlineAt }),
      }),
      at: Date.now(),
    };
    cacheSet(key, entry);
  }
  return normalizeCpcb(entry.raw, loc.coordinates, new Date(entry.at), 25, new Date());
}
