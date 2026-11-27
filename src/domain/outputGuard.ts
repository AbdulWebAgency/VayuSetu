import {
  GeminiChoicesSchema,
  type Advisory,
  type HouseholdProfile,
  type NormalizedAirQuality,
} from "@/types/airQuality";
import type { EligibleChoices } from "./advisoryPersonalization";

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

/** Only server-owned cards and reviewed explanations can enter the public advisory. */
export function guardAiAdvisory(
  raw: unknown,
  profile: HouseholdProfile,
  baseline: Advisory,
  options: EligibleChoices,
  air: NormalizedAirQuality | null,
): Advisory {
  const parsed = GeminiChoicesSchema.safeParse(raw);
  if (!parsed.success)
    return { ...baseline, modeReason: "AI output failed validation — rule-based guidance" };
  const { priorityId, explanationId } = parsed.data;
  const recommendations = [...baseline.recommendations];
  const contributions: string[] = [];
  let rejected = 0;
  if (priorityId !== null) {
    if (!options.priorities.includes(priorityId)) rejected++;
    else {
      const firstIndex = recommendations.findIndex((card) =>
        options.priorities.some((id) => id === card.id),
      );
      const selectedIndex = recommendations.findIndex((card) => card.id === priorityId);
      const first = recommendations[firstIndex];
      const selected = recommendations[selectedIndex];
      if (first && selected && firstIndex !== selectedIndex) {
        recommendations[firstIndex] = selected;
        recommendations[selectedIndex] = first;
        contributions.push(
          priorityId === "sustain-energy"
            ? "prioritized household energy"
            : "prioritized lower-emission trips",
        );
      }
    }
  }
  if (explanationId !== null) {
    const variant = options.explanations.find((option) => option.id === explanationId);
    const index = recommendations.findIndex((card) => card.id === variant?.cardId);
    const card = recommendations[index];
    if (
      !variant ||
      !card ||
      rejectReason(variant.text, profile) ||
      unsupportedEnvironmentalClaim(variant.text, profile, air)
    )
      rejected++;
    else if (!card.how.includes(variant.text)) {
      recommendations[index] = { ...card, how: `${card.how} ${variant.text}` };
      contributions.push(`selected the explanation about ${variant.label}`);
    }
  }
  return {
    ...baseline,
    recommendations,
    rejectedAiItems: rejected,
    mode: contributions.length ? "ai_enriched" : "rule_based",
    modeReason: contributions.length
      ? `AI ${contributions.join(" and ")}.`
      : "Rule-based guidance; AI choices did not change the displayed advice.",
  };
}
