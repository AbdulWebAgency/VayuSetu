import type { HouseholdProfile, ResolvedLocation } from "@/types/airQuality";

/** Pre-verified coordinates for quick-select Indian cities. */
export const CITY_PRESETS: ResolvedLocation[] = [
  { name: "Hyderabad", admin: "Telangana", coordinates: { lat: 17.385, lon: 78.4867 } },
  { name: "Delhi", admin: "Delhi", coordinates: { lat: 28.6139, lon: 77.209 } },
  { name: "Mumbai", admin: "Maharashtra", coordinates: { lat: 19.076, lon: 72.8777 } },
  { name: "Kolkata", admin: "West Bengal", coordinates: { lat: 22.5726, lon: 88.3639 } },
  { name: "Bengaluru", admin: "Karnataka", coordinates: { lat: 12.9716, lon: 77.5946 } },
  { name: "Chennai", admin: "Tamil Nadu", coordinates: { lat: 13.0827, lon: 80.2707 } },
];

export const AQI_SCALE_LABEL = { US_EPA: "US EPA AQI", IN_NAQI: "Indian NAQI" } as const;

export const PROVIDER_LABEL = {
  CPCB: "CPCB via data.gov.in (OGD)",
  WAQI: "World Air Quality Index Project",
  OPEN_METEO: "Atmospheric Model Estimate (Open-Meteo / CAMS Global)",
} as const;

/** CPCB NAQI PM2.5 (24-h) concentration breakpoints, µg/m³ — used for a concentration band, never an AQI. */
export const PM25_BANDS = [
  { max: 30, band: "good", label: "Good" },
  { max: 60, band: "satisfactory", label: "Satisfactory" },
  { max: 90, band: "moderate", label: "Moderately polluted" },
  { max: 120, band: "poor", label: "Poor" },
  { max: 250, band: "very_poor", label: "Very poor" },
  { max: Infinity, band: "severe", label: "Severe" },
] as const;

export const DEFAULT_PROFILE: HouseholdProfile = {
  householdSize: 3,
  youngChildren: false,
  elderly: false,
  respiratorySensitivity: false,
  commuteMode: "public_transit",
  commuteWindow: "morning_peak",
  exerciseRoutine: "none",
  hasAirPurifier: false,
  hasIndoorSensor: false,
  indoorPm25: null,
  indoorReadingAgeMinutes: null,
};

export interface Scenario {
  id: "A" | "B" | "C" | "D";
  label: string;
  cityName: string;
  profile: HouseholdProfile;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "A",
    label: "Family with young children · Hyderabad",
    cityName: "Hyderabad",
    profile: {
      ...DEFAULT_PROFILE,
      householdSize: 4,
      youngChildren: true,
      commuteMode: "two_wheeler",
      commuteWindow: "morning_peak",
      exerciseRoutine: "evening_outdoor",
    },
  },
  {
    id: "B",
    label: "Working commuter · Delhi",
    cityName: "Delhi",
    profile: {
      ...DEFAULT_PROFILE,
      householdSize: 2,
      commuteMode: "private_car",
      commuteWindow: "morning_peak",
      exerciseRoutine: "morning_outdoor",
      hasAirPurifier: true,
    },
  },
  {
    id: "C",
    label: "Elderly member · Mumbai",
    cityName: "Mumbai",
    profile: {
      ...DEFAULT_PROFILE,
      householdSize: 3,
      elderly: true,
      respiratorySensitivity: true,
      commuteMode: "work_from_home",
      commuteWindow: "flexible",
      exerciseRoutine: "indoor_only",
      hasAirPurifier: false,
    },
  },
  {
    id: "D",
    label: "Student household · Kolkata",
    cityName: "Kolkata",
    profile: {
      ...DEFAULT_PROFILE,
      householdSize: 3,
      commuteMode: "public_transit",
      commuteWindow: "evening_peak",
      exerciseRoutine: "evening_outdoor",
    },
  },
];
