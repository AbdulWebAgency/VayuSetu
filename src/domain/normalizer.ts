import { z } from "zod";
import {
  CoordinatesSchema,
  type NormalizedAirQuality,
  type ResolvedLocation,
} from "@/types/airQuality";
import { PROVIDER_LABEL } from "./catalogues";

const optionalNullableNumber = z.number().nullable().optional();

export const OpenMeteoAirSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: z.object({
    time: z.string(),
    pm2_5: optionalNullableNumber,
    pm10: optionalNullableNumber,
    nitrogen_dioxide: optionalNullableNumber,
    sulphur_dioxide: optionalNullableNumber,
    ozone: optionalNullableNumber,
    carbon_monoxide: optionalNullableNumber,
    us_aqi: optionalNullableNumber,
  }),
});

export const WaqiSchema = z.object({
  status: z.string(),
  data: z.object({
    aqi: z.union([z.number(), z.string()]),
    idx: z.number(),
    city: z.object({ geo: z.tuple([z.number(), z.number()]), name: z.string() }),
    time: z.object({ iso: z.string() }),
    attributions: z.array(z.object({ name: z.string() })).optional(),
  }),
});

export const CpcbRecordSchema = z.object({
  station: z.string(),
  city: z.string(),
  last_update: z.string(),
  latitude: z.union([z.string(), z.number()]),
  longitude: z.union([z.string(), z.number()]),
  pollutant_id: z.string(),
  avg_value: z.union([z.string(), z.number()]),
});
export const CpcbSchema = z.object({ records: z.array(CpcbRecordSchema) });

export const OpenMeteoGeocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country_code: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

const clean = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;

/** Normalizes Open-Meteo CAMS payload; AQI is the provider-supplied US AQI only. */
export function normalizeOpenMeteo(raw: unknown, fetchedAt: Date): NormalizedAirQuality {
  const p = OpenMeteoAirSchema.parse(raw);
  const c = p.current;
  const aqi = clean(c.us_aqi);
  return {
    provider: "OPEN_METEO",
    providerName: PROVIDER_LABEL.OPEN_METEO,
    agency: "Copernicus Atmosphere Monitoring Service (CAMS) via Open-Meteo",
    measurementType: "model_estimate",
    stationId: null,
    stationName: null,
    dataCoordinates: { lat: p.latitude, lon: p.longitude },
    measuredAt: new Date(c.time.endsWith("Z") ? c.time : `${c.time}Z`).toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    aqi: aqi === null ? null : { value: Math.round(aqi), scale: "US_EPA" },
    pollutants: {
      pm25: clean(c.pm2_5),
      pm10: clean(c.pm10),
      no2: clean(c.nitrogen_dioxide),
      so2: clean(c.sulphur_dioxide),
      o3: clean(c.ozone),
      co: clean(c.carbon_monoxide),
    },
    units: "µg/m³",
    notes: ["Model grid estimate, not a ground-station measurement."],
  };
}

/** Normalizes a WAQI feed. WAQI "iaqi" values are sub-indices, not concentrations, so concentrations are null. */
export function normalizeWaqi(raw: unknown, fetchedAt: Date): NormalizedAirQuality | null {
  const p = WaqiSchema.parse(raw);
  if (p.status !== "ok") return null;
  const d = p.data;
  const aqi = typeof d.aqi === "number" && d.aqi >= 0 ? Math.round(d.aqi) : null;
  const measured = new Date(d.time.iso);
  if (Number.isNaN(measured.getTime())) return null;
  return {
    provider: "WAQI",
    providerName: PROVIDER_LABEL.WAQI,
    agency:
      d.attributions
        ?.map((a) => a.name)
        .slice(0, 2)
        .join("; ") || null,
    measurementType: "ground_station",
    stationId: `@${d.idx}`,
    stationName: d.city.name,
    dataCoordinates: { lat: d.city.geo[0], lon: d.city.geo[1] },
    measuredAt: measured.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    aqi: aqi === null ? null : { value: aqi, scale: "US_EPA" },
    pollutants: { pm25: null, pm10: null, no2: null, so2: null, o3: null, co: null },
    units: "µg/m³",
    notes: [
      "WAQI publishes per-pollutant sub-indices rather than µg/m³ concentrations; concentrations shown as unavailable.",
    ],
  };
}

/** Parses CPCB "DD-MM-YYYY HH:mm:ss" IST timestamps. */
export function parseCpcbTime(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
export { haversineKm };

const CPCB_MAX_ROW_AGE_MS = 180 * 60_000;
const CPCB_COMPARABILITY_WINDOW_MS = 90 * 60_000;

type CpcbRow = z.infer<typeof CpcbRecordSchema>;

function retainComparableCpcbReadings(rows: CpcbRow[], now: Date) {
  const timed = rows
    .flatMap((row) => {
      const time = parseCpcbTime(row.last_update)?.getTime();
      const value = Number(row.avg_value);
      if (
        time === undefined ||
        time > now.getTime() ||
        now.getTime() - time > CPCB_MAX_ROW_AGE_MS ||
        !Number.isFinite(value) ||
        value < 0 ||
        !["PM2.5", "PM10", "NO2", "SO2", "OZONE"].includes(row.pollutant_id.toUpperCase()) ||
        String(row.avg_value).trim() === ""
      )
        return [];
      return [{ row, time, value }];
    })
    .sort((a, b) => b.time - a.time);
  const newest = timed[0];
  if (!newest) return [];
  const retained = timed.filter((r) => newest.time - r.time <= CPCB_COMPARABILITY_WINDOW_MS);
  // Keep only the newest retained reading for each pollutant.
  const seen = new Set<string>();
  const comparable = retained.filter(({ row }) => {
    const id = row.pollutant_id.toUpperCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return seen.has("PM2.5") || seen.has("PM10") ? comparable : [];
}

/** Picks the nearest CPCB station (≤ maxKm) and normalizes its pollutant rows. CPCB OGD supplies no AQI. */
export function normalizeCpcb(
  raw: unknown,
  target: { lat: number; lon: number },
  fetchedAt: Date,
  maxKm = 25,
  now = fetchedAt,
): NormalizedAirQuality | null {
  const rows = CpcbSchema.parse(raw).records;
  const byStation = new Map<string, CpcbRow[]>();
  for (const r of rows) byStation.set(r.station, [...(byStation.get(r.station) ?? []), r]);
  let best: {
    name: string;
    readings: ReturnType<typeof retainComparableCpcbReadings>;
    km: number;
    lat: number;
    lon: number;
  } | null = null;
  for (const [name, list] of byStation) {
    const readings = retainComparableCpcbReadings(list, now);
    const first = readings[0];
    if (!first) continue;
    const lat = Number(first.row.latitude),
      lon = Number(first.row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const km = haversineKm(target, { lat, lon });
    if (km <= maxKm && (!best || km < best.km)) best = { name, readings, km, lat, lon };
  }
  if (!best) return null;
  const { readings } = best;
  const measured = new Date(Math.min(...readings.map(({ time }) => time)));
  const readPollutantAverage = (id: string): number | null =>
    readings.find(({ row }) => row.pollutant_id.toUpperCase() === id)?.value ?? null;
  const pollutants = {
    pm25: readPollutantAverage("PM2.5"),
    pm10: readPollutantAverage("PM10"),
    no2: readPollutantAverage("NO2"),
    so2: readPollutantAverage("SO2"),
    o3: readPollutantAverage("OZONE"),
    co: null,
  };
  return {
    provider: "CPCB",
    providerName: PROVIDER_LABEL.CPCB,
    agency: "Central Pollution Control Board (CPCB)",
    measurementType: "ground_station",
    stationId: best.name,
    stationName: best.name,
    dataCoordinates: { lat: best.lat, lon: best.lon },
    measuredAt: measured.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    aqi: null,
    pollutants,
    units: "µg/m³",
    notes: [
      `Station ${best.km.toFixed(1)} km from selected location. CPCB OGD feed provides concentrations only; AQI not supplied. CO omitted (published in mg/m³).`,
    ],
  };
}

/** Converts Open-Meteo geocoding results into Indian locations only (country filter + bounds). */
export function normalizeGeocode(raw: unknown): ResolvedLocation[] {
  const p = OpenMeteoGeocodeSchema.parse(raw);
  return (p.results ?? [])
    .filter((r) => r.country_code === "IN")
    .filter((r) => CoordinatesSchema.safeParse({ lat: r.latitude, lon: r.longitude }).success)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      admin: r.admin1 ?? null,
      coordinates: { lat: r.latitude, lon: r.longitude },
    }));
}
