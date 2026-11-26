import { z } from "zod";

/** Indian geographic bounds used to validate every coordinate pair. */
export const INDIA_BOUNDS = { minLat: 6.0, maxLat: 37.6, minLon: 68.0, maxLon: 97.5 } as const;

export const CoordinatesSchema = z
  .object({
    lat: z.number().describe("Latitude in decimal degrees"),
    lon: z.number().describe("Longitude in decimal degrees"),
  })
  .refine(
    (c) =>
      c.lat >= INDIA_BOUNDS.minLat &&
      c.lat <= INDIA_BOUNDS.maxLat &&
      c.lon >= INDIA_BOUNDS.minLon &&
      c.lon <= INDIA_BOUNDS.maxLon,
    { message: "Coordinates must lie within India" },
  );
export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const ResolvedLocationSchema = z.object({
  name: z.string().min(1).max(120).describe("City or town name"),
  admin: z.string().max(120).nullable().describe("State / admin region"),
  coordinates: CoordinatesSchema,
});
export type ResolvedLocation = z.infer<typeof ResolvedLocationSchema>;

export const GeocodeQuerySchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(80, "Query too long")
  .regex(/^[\p{L}\p{M}\s.,'-]+$/u, "Use letters, spaces and basic punctuation only");

export const ProviderIdSchema = z.enum(["CPCB", "WAQI", "OPEN_METEO"]).describe("Data provider");
export const MeasurementTypeSchema = z
  .enum(["ground_station", "model_estimate"])
  .describe("Ground-Station Observation vs Atmospheric Model Estimate");
export const AqiScaleSchema = z
  .enum(["US_EPA", "IN_NAQI"])
  .describe("AQI scale supplied by provider");
export const FreshnessSchema = z.enum(["live", "aging", "stale"]);

const conc = z.number().nonnegative().nullable();
export const PollutantsSchema = z.object({
  pm25: conc.describe("PM2.5 µg/m³"),
  pm10: conc.describe("PM10 µg/m³"),
  no2: conc.describe("NO2 µg/m³"),
  so2: conc.describe("SO2 µg/m³"),
  o3: conc.describe("O3 µg/m³"),
  co: conc.describe("CO µg/m³"),
});
export type Pollutants = z.infer<typeof PollutantsSchema>;

export const NormalizedAirQualitySchema = z.object({
  provider: ProviderIdSchema,
  providerName: z.string().describe("Human readable provider attribution"),
  agency: z.string().nullable().describe("Originating agency attribution"),
  measurementType: MeasurementTypeSchema,
  stationId: z.string().nullable(),
  stationName: z.string().nullable(),
  dataCoordinates: z
    .object({ lat: z.number(), lon: z.number() })
    .describe("Station or model grid coordinates"),
  measuredAt: z.string().datetime().describe("Provider's original measurement timestamp"),
  fetchedAt: z.string().datetime().describe("When this server fetched the data"),
  aqi: z
    .object({ value: z.number().int().nonnegative(), scale: AqiScaleSchema })
    .nullable()
    .describe("Provider-supplied AQI only; null when unavailable"),
  pollutants: PollutantsSchema,
  units: z.literal("µg/m³"),
  notes: z.array(z.string()).describe("Provider-specific caveats"),
});
export type NormalizedAirQuality = z.infer<typeof NormalizedAirQualitySchema>;

export const AirQualityResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    data: NormalizedAirQualitySchema,
    attempted: z.array(z.string()),
  }),
  z.object({
    status: z.literal("unavailable"),
    message: z.string(),
    attempted: z.array(z.string()),
  }),
]);
export type AirQualityResponse = z.infer<typeof AirQualityResponseSchema>;

export const HouseholdProfileSchema = z.object({
  householdSize: z.number().int().min(1).max(20),
  youngChildren: z.boolean(),
  elderly: z.boolean(),
  respiratorySensitivity: z.boolean(),
  commuteMode: z.enum([
    "private_car",
    "two_wheeler",
    "public_transit",
    "walk_cycle",
    "work_from_home",
  ]),
  commuteWindow: z.enum(["morning_peak", "midday", "evening_peak", "flexible"]),
  exerciseRoutine: z.enum(["morning_outdoor", "evening_outdoor", "indoor_only", "none"]),
  hasAirPurifier: z.boolean(),
  hasIndoorSensor: z.boolean(),
  indoorPm25: z.number().min(0).max(1500).nullable().describe("User-Reported Indoor PM2.5 µg/m³"),
  indoorReadingAgeMinutes: z.number().int().min(0).max(1440).nullable(),
});
export type HouseholdProfile = z.infer<typeof HouseholdProfileSchema>;

export const PillarSchema = z.enum(["routines", "indoor", "sustainable"]);
export type Pillar = z.infer<typeof PillarSchema>;
export const BasisSchema = z.enum(["Measured", "Estimated", "Qualitative"]);

const text = (max: number) => z.string().trim().min(3).max(max);
export const RecommendationSchema = z.object({
  id: z.string().min(1).max(60),
  pillar: PillarSchema,
  title: text(90),
  what: text(400),
  why: text(400),
  how: text(400),
  limitation: text(400),
  basis: BasisSchema,
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const PlannerSlotSchema = z.object({
  action: text(300),
  reason: text(300),
  pillar: PillarSchema,
});
export const PlannerSchema = z.object({
  morning: PlannerSlotSchema,
  afternoon: PlannerSlotSchema,
  evening: PlannerSlotSchema,
});
export type Planner = z.infer<typeof PlannerSchema>;

/** Strict schema every Gemini response must satisfy before the output guard runs. */
export const AiAdvisoryResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema).min(3).max(12),
  planner: PlannerSchema,
});
export type AiAdvisoryResponse = z.infer<typeof AiAdvisoryResponseSchema>;

export const AdvisorySchema = z.object({
  mode: z.enum(["rule_based", "ai_enriched"]),
  modeReason: z.string(),
  sensitivityTier: z.enum(["standard", "elevated", "high"]),
  pm25Band: z.enum(["unknown", "good", "satisfactory", "moderate", "poor", "very_poor", "severe"]),
  ventilation: z.string(),
  purifierApplicable: z.boolean(),
  liveDataAvailable: z.boolean(),
  recommendations: z.array(RecommendationSchema),
  planner: PlannerSchema,
  rejectedAiItems: z.number().int().nonnegative(),
});
export type Advisory = z.infer<typeof AdvisorySchema>;

export const AdvisoryRequestSchema = z.object({
  location: ResolvedLocationSchema,
  profile: HouseholdProfileSchema,
});
export type AdvisoryRequest = z.infer<typeof AdvisoryRequestSchema>;
