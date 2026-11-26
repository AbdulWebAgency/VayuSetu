import { z } from "zod";
import {
  AdvisorySchema,
  AirQualityResponseSchema,
  ResolvedLocationSchema,
  type Advisory,
  type AirQualityResponse,
  type HouseholdProfile,
  type ResolvedLocation,
} from "@/types/airQuality";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function call(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? "Request failed";
    throw new ApiError(msg, res.status);
  }
  return body;
}

/** Searches Indian locations through the server geocoder. */
export async function searchLocations(q: string): Promise<ResolvedLocation[]> {
  const b = await call(`/api/public/geocode?q=${encodeURIComponent(q)}`);
  return z.object({ results: z.array(ResolvedLocationSchema) }).parse(b).results;
}

export async function fetchAirQuality(loc: ResolvedLocation): Promise<AirQualityResponse> {
  const b = await call("/api/public/air-quality", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(loc),
  });
  return AirQualityResponseSchema.parse(b);
}

export async function fetchAdvisory(
  location: ResolvedLocation,
  profile: HouseholdProfile,
): Promise<{ air: AirQualityResponse; advisory: Advisory }> {
  const b = await call("/api/public/advisory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ location, profile }),
  });
  return z.object({ air: AirQualityResponseSchema, advisory: AdvisorySchema }).parse(b);
}
