import type { HouseholdProfile, NormalizedAirQuality, ResolvedLocation } from "@/types/airQuality";
import { DEFAULT_PROFILE } from "@/domain/catalogues";

export const NOW = new Date("2026-11-22T12:00:00Z");
export const DELHI: ResolvedLocation = {
  name: "Delhi",
  admin: "Delhi",
  coordinates: { lat: 28.6139, lon: 77.209 },
};

export const openMeteoRaw = {
  latitude: 28.6,
  longitude: 77.2,
  current: {
    time: "2026-11-22T11:00",
    pm2_5: 180.4,
    pm10: 260.1,
    nitrogen_dioxide: 40,
    sulphur_dioxide: 12,
    ozone: 30,
    carbon_monoxide: 900,
    us_aqi: 230,
  },
};
export const waqiRaw = {
  status: "ok",
  data: {
    aqi: 312,
    idx: 10111,
    city: { geo: [28.63, 77.22], name: "ITO, Delhi" },
    time: { iso: "2026-11-22T17:00:00+05:30" },
    attributions: [{ name: "CPCB" }],
    iaqi: { pm25: { v: 312 } },
  },
};
export const cpcbRaw = {
  records: [
    {
      station: "ITO, Delhi - CPCB",
      city: "Delhi",
      last_update: "22-11-2026 17:00:00",
      latitude: "28.628",
      longitude: "77.241",
      pollutant_id: "PM2.5",
      avg_value: "201",
    },
    {
      station: "ITO, Delhi - CPCB",
      city: "Delhi",
      last_update: "22-11-2026 17:00:00",
      latitude: "28.628",
      longitude: "77.241",
      pollutant_id: "PM10",
      avg_value: "310",
    },
    {
      station: "Far Station",
      city: "Delhi",
      last_update: "22-11-2026 17:00:00",
      latitude: "29.9",
      longitude: "77.9",
      pollutant_id: "PM2.5",
      avg_value: "50",
    },
  ],
};
export const geocodeRaw = {
  results: [
    {
      name: "Lucknow",
      latitude: 26.84,
      longitude: 80.92,
      country_code: "IN",
      admin1: "Uttar Pradesh",
    },
    { name: "Lahore", latitude: 31.55, longitude: 74.34, country_code: "PK", admin1: "Punjab" },
    { name: "Bogus", latitude: 50, longitude: 80, country_code: "IN" },
  ],
};

export const air = (o: Partial<NormalizedAirQuality> = {}): NormalizedAirQuality => ({
  provider: "OPEN_METEO",
  providerName: "Model",
  agency: null,
  measurementType: "model_estimate",
  stationId: null,
  stationName: null,
  dataCoordinates: { lat: 28.6, lon: 77.2 },
  measuredAt: "2026-11-22T11:00:00.000Z",
  fetchedAt: "2026-11-22T11:55:00.000Z",
  aqi: { value: 230, scale: "US_EPA" },
  pollutants: { pm25: 180, pm10: 260, no2: null, so2: null, o3: null, co: null },
  units: "µg/m³",
  notes: [],
  ...o,
});

export const profile = (o: Partial<HouseholdProfile> = {}): HouseholdProfile => ({
  ...DEFAULT_PROFILE,
  ...o,
});
