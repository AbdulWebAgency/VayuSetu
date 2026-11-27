import { useEffect, useState } from "react";
import { HouseholdProfileSchema, type HouseholdProfile } from "@/types/airQuality";
import { DEFAULT_PROFILE } from "@/domain/catalogues";

const KEY = "vayusetu.profile.v1";

// Sensor ownership is durable. A reading belongs to the current session.
function preferencesOnly(p: HouseholdProfile): HouseholdProfile {
  const { indoorMeasuredAt, ...preferences } = p;
  return { ...preferences, indoorPm25: null, indoorReadingAgeMinutes: null };
}

/** Household profile persisted in localStorage (validated on read; loaded after hydration). */
export function useHouseholdProfile() {
  const [profile, setProfile] = useState<HouseholdProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    try {
      const parsed = HouseholdProfileSchema.safeParse(
        JSON.parse(localStorage.getItem(KEY) ?? "null"),
      );
      if (parsed.success) setProfile(preferencesOnly(parsed.data));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);
  const update = (p: HouseholdProfile) => {
    setProfile(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(preferencesOnly(p)));
    } catch {
      /* storage full or blocked */
    }
  };
  return [profile, update] as const;
}
