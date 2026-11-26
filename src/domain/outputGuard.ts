import type {
  Advisory,
  AiAdvisoryResponse,
  HouseholdProfile,
  NormalizedAirQuality,
  Recommendation,
} from "@/types/airQuality";
import { PillarSchema } from "@/types/airQuality";
import { computeFreshness } from "./freshness";

const PURIFIER_ASSUMED = /\b(purifiers?|hepa|air\s+cleaner|filtration\s+(unit|device))\b/i;
const INDOOR_AQI =
  /\b(indoor|indoors|inside|room|home)\b[^!?;]{0,100}\b(aqi|air quality index)\b|\b(aqi|air quality index)\b[^!?;]{0,100}\b(indoor|indoors|inside|room|home)\b/i;
const PERCENT = /%|\bpercent(?:age)?\b/i;
const MEDICAL =
  /\b(diagnos\w*|cure\w*|treat\w*|prescri\w*|medicat\w*|therapy|prevents?\s+(asthma|disease|cancer|copd|respiratory|illness)|guarantee\w*)\b|\byou\s+(have|suffer from)\s+(asthma|copd|cancer|a respiratory disease)\b/i;
const URL = /https?:\/\/|www\./i;

/** Returns the reason an item is unsafe for this household, or null if acceptable. */
export function rejectReason(text: string, profile: HouseholdProfile): string | null {
  if (!profile.hasAirPurifier && PURIFIER_ASSUMED.test(text)) return "assumes purifier";
  if (INDOOR_AQI.test(text)) return "indoor AQI claim";
  if (PERCENT.test(text)) return "unverified percentage";
  if (MEDICAL.test(text)) return "medical claim";
  if (URL.test(text)) return "external link";
  return null;
}

/** Fail closed on numeric environmental sentences; thresholds/predictions are not verified readings. */
export function unsupportedEnvironmentalClaim(
  text: string,
  profile: HouseholdProfile,
  air: NormalizedAirQuality | null,
): boolean {
  const normalized = text.replace(/[₀-₉]/g, (c) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)));
  const label =
    /\b(aqi|air quality index|pm\s*2[.,·]?5|pm\s*10|no2|so2|o3|co|nitrogen dioxide|sulphur dioxide|sulfur dioxide|ozone|carbon monoxide)\b/gi;
  const key = (s: string): keyof NormalizedAirQuality["pollutants"] | "aqi" => {
    const compact = s.toLowerCase().replace(/[\s.,·]/g, "");
    const aliases: Record<string, keyof NormalizedAirQuality["pollutants"] | "aqi"> = {
      aqi: "aqi",
      pm25: "pm25",
      pm10: "pm10",
      no2: "no2",
      so2: "so2",
      o3: "o3",
      co: "co",
      nitrogendioxide: "no2",
      sulphurdioxide: "so2",
      sulfurdioxide: "so2",
      ozone: "o3",
      carbonmonoxide: "co",
    };
    return aliases[compact] ?? "aqi";
  };
  for (const sentence of normalized.split(/(?<!\d)[.!?]|[.!?](?!\d)|[;\n]/)) {
    const labels = [...sentence.matchAll(label)];
    if (!labels.length) continue;
    // Unit exponents are not concentration claims.
    const withoutLabels = sentence.replace(label, " ").replace(/[µμu]?g\s*\/\s*m(?:\^?3|³)/gi, " ");
    const numbers = [...withoutLabels.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)];
    if (!numbers.length) continue;
    const indoor = /\b(indoor|indoors|inside|sensor|user.reported)\b/i.test(sentence);
    const outdoor = /\b(outdoor|outside)\b/i.test(sentence);
    // Mixed locations, converted units, changes, forecasts and thresholds are not source readings.
    if (
      (indoor && outdoor) ||
      /\b(ppb|ppm|mg\s*\/|forecast\w*|predict\w*|tomorrow|threshold|limit)\b/i.test(sentence) ||
      /\b(drop\w*|ris\w*|increase\w*|decrease\w*|reduc\w*)\b[^.!?;]{0,30}\b(by|to|of)\s+[-+]?\d/i.test(
        sentence,
      )
    )
      return true;
    const supported = new Set<number>();
    for (const match of labels) {
      const pollutant = key(match[0]);
      if (!indoor) {
        const value = pollutant === "aqi" ? air?.aqi?.value : air?.pollutants[pollutant];
        if (value != null) supported.add(value);
      }
      if (indoor && pollutant === "pm25" && profile.hasIndoorSensor && profile.indoorPm25 !== null)
        supported.add(profile.indoorPm25);
    }
    // Multiple pollutants with numbers cannot be unambiguously attributed: reject rather than guess.
    if (new Set(labels.map((m) => key(m[0]))).size > 1) return true;
    if (numbers.some((m) => !supported.has(Number(m[0].replace(",", "."))))) return true;
  }
  return false;
}

/**
 * Filters AI output against household constraints and fills any missing pillar or
 * planner slot from the deterministic baseline.
 */
export function guardAiAdvisory(
  ai: AiAdvisoryResponse,
  profile: HouseholdProfile,
  baseline: Advisory,
  source: NormalizedAirQuality | null = null,
  now = new Date(),
): Advisory {
  const air =
    source && computeFreshness(source.measuredAt, source.measurementType, now) !== "stale"
      ? source
      : null;
  const basis: Recommendation["basis"] = !air
    ? "Qualitative"
    : air.measurementType === "ground_station" &&
        (air.provider === "CPCB" || air.provider === "WAQI")
      ? "Measured"
      : air.provider === "OPEN_METEO" && air.measurementType === "model_estimate"
        ? "Estimated"
        : "Qualitative";
  const unsafe = (text: string) =>
    rejectReason(text, profile) || unsupportedEnvironmentalClaim(text, profile, air);
  let rejected = 0;
  const accepted: Recommendation[] = [];
  for (const r of ai.recommendations) {
    const text = [r.title, r.what, r.why, r.how, r.limitation].join(" ");
    if (unsafe(text) || [r.title, r.what, r.why, r.how, r.limitation].some(unsafe)) rejected++;
    else accepted.push({ ...r, basis });
  }
  for (const pillar of PillarSchema.options) {
    if (!accepted.some((r) => r.pillar === pillar))
      accepted.push(...baseline.recommendations.filter((r) => r.pillar === pillar));
  }
  const slot = (k: keyof Advisory["planner"]) => {
    const s = ai.planner[k];
    if (unsafe(`${s.action} ${s.reason}`) || [s.action, s.reason].some(unsafe)) {
      rejected++;
      return baseline.planner[k];
    }
    return s;
  };
  return {
    ...baseline,
    mode: "ai_enriched",
    modeReason: "AI-enriched guidance, checked by safety rules",
    recommendations: accepted,
    planner: { morning: slot("morning"), afternoon: slot("afternoon"), evening: slot("evening") },
    rejectedAiItems: rejected,
  };
}
