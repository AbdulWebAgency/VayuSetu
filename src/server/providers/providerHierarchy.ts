import type {
  AirQualityResponse,
  NormalizedAirQuality,
  ResolvedLocation,
} from "@/types/airQuality";
import { hasEnvironmentalValue } from "@/domain/outdoorEvidence";
import { computeFreshness } from "@/domain/freshness";
import { fetchCpcb } from "./cpcbProvider";
import { fetchOpenMeteo } from "./openMeteoProvider";
import { fetchWaqi } from "./waqiProvider";
import { UpstreamError } from "./http";

export const PROVIDER_DEADLINE_MS = 12_000;

export interface ProviderDeps {
  cpcbKey?: string | undefined;
  waqiToken?: string | undefined;
  cpcb?: typeof fetchCpcb;
  waqi?: typeof fetchWaqi;
  openMeteo?: typeof fetchOpenMeteo;
  now?: () => Date;
}

/**
 * Ground station (CPCB, then WAQI, when configured and fresh) → Open-Meteo CAMS model.
 * Never merges providers. Returns "unavailable" when all fail.
 */
export async function resolveAirQuality(
  loc: ResolvedLocation,
  deps: ProviderDeps = {},
): Promise<AirQualityResponse> {
  const now = deps.now ?? (() => new Date());
  const attempted: string[] = [];
  const deadlineAt = Date.now() + PROVIDER_DEADLINE_MS;
  const tryStep = async (name: string, fn: () => Promise<NormalizedAirQuality | null>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        attempted.push(`${name}: deadline exceeded`);
        return null;
      }
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UpstreamError("deadline")), remaining);
      });
      const r = await Promise.race([fn(), timeout]);
      if (!r) attempted.push(`${name}: no eligible station`);
      else if (computeFreshness(r.measuredAt, r.measurementType, now()) === "stale")
        attempted.push(`${name}: stale`);
      else if (!hasEnvironmentalValue(r)) attempted.push(`${name}: no usable environmental values`);
      else {
        attempted.push(`${name}: used`);
        return r;
      }
    } catch (e) {
      attempted.push(
        `${name}: ${e instanceof UpstreamError && e.reason === "deadline" ? "deadline exceeded" : "failed"}`,
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    return null;
  };
  const cpcbKey = deps.cpcbKey;
  if (cpcbKey) {
    const r = await tryStep("CPCB", () => (deps.cpcb ?? fetchCpcb)(loc, cpcbKey, deadlineAt));
    if (r) return { status: "ok", data: r, attempted };
  } else attempted.push("CPCB: not configured");
  const waqiToken = deps.waqiToken;
  if (waqiToken) {
    const r = await tryStep("WAQI", () =>
      (deps.waqi ?? fetchWaqi)(loc.coordinates, waqiToken, deadlineAt),
    );
    if (r) return { status: "ok", data: r, attempted };
  } else attempted.push("WAQI: not configured");
  const m = await tryStep("Open-Meteo", () =>
    (deps.openMeteo ?? fetchOpenMeteo)(loc.coordinates, deadlineAt),
  );
  if (m) return { status: "ok", data: m, attempted };
  return { status: "unavailable", message: "Live Environmental Data Unavailable", attempted };
}
