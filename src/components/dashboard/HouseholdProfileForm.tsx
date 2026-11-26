import type { HouseholdProfile } from "@/types/airQuality";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Props = { profile: HouseholdProfile; onChange: (p: HouseholdProfile) => void };

const SELECT = "mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const COMMUTE = {
  private_car: "Private car",
  two_wheeler: "Two-wheeler",
  public_transit: "Public transit",
  walk_cycle: "Walk / cycle",
  work_from_home: "Work from home",
};
const WINDOW = {
  morning_peak: "Morning peak",
  midday: "Midday",
  evening_peak: "Evening peak",
  flexible: "Flexible",
};
const EXERCISE = {
  morning_outdoor: "Morning outdoors",
  evening_outdoor: "Evening outdoors",
  indoor_only: "Indoors only",
  none: "None",
};

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Editable household profile (persisted to localStorage by the parent). */
export function HouseholdProfileForm({ profile: p, onChange }: Props) {
  const set = <K extends keyof HouseholdProfile>(k: K, v: HouseholdProfile[K]) =>
    onChange({ ...p, [k]: v });
  const num = (s: string): number | null =>
    s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s);
  return (
    <section aria-labelledby="prof-h" className="card-surface p-5 space-y-4">
      <h2 id="prof-h" className="text-xl font-semibold">
        Your household
      </h2>
      <div>
        <Label htmlFor="hh-size">Household size</Label>
        <Input
          id="hh-size"
          type="number"
          min={1}
          max={20}
          value={p.householdSize}
          onChange={(e) =>
            set("householdSize", Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))))
          }
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who lives here</legend>
        <Check
          id="hh-kids"
          label="Young children"
          checked={p.youngChildren}
          onChange={(v) => set("youngChildren", v)}
        />
        <Check
          id="hh-elderly"
          label="Elderly members"
          checked={p.elderly}
          onChange={(v) => set("elderly", v)}
        />
        <Check
          id="hh-resp"
          label="Respiratory sensitivity (e.g. asthma)"
          checked={p.respiratorySensitivity}
          onChange={(v) => set("respiratorySensitivity", v)}
        />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="hh-commute">Main commute</Label>
          <select
            id="hh-commute"
            className={SELECT}
            value={p.commuteMode}
            onChange={(e) => set("commuteMode", e.target.value as HouseholdProfile["commuteMode"])}
          >
            {Object.entries(COMMUTE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="hh-window">Commute time</Label>
          <select
            id="hh-window"
            className={SELECT}
            value={p.commuteWindow}
            onChange={(e) =>
              set("commuteWindow", e.target.value as HouseholdProfile["commuteWindow"])
            }
          >
            {Object.entries(WINDOW).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="hh-ex">Exercise routine</Label>
        <select
          id="hh-ex"
          className={SELECT}
          value={p.exerciseRoutine}
          onChange={(e) =>
            set("exerciseRoutine", e.target.value as HouseholdProfile["exerciseRoutine"])
          }
        >
          {Object.entries(EXERCISE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Equipment</legend>
        <Check
          id="hh-purifier"
          label="We own a HEPA air purifier"
          checked={p.hasAirPurifier}
          onChange={(v) => set("hasAirPurifier", v)}
        />
        <Check
          id="hh-sensor"
          label="We have an indoor PM2.5 sensor"
          checked={p.hasIndoorSensor}
          onChange={(v) =>
            onChange({
              ...p,
              hasIndoorSensor: v,
              ...(v ? {} : { indoorPm25: null, indoorReadingAgeMinutes: null }),
            })
          }
        />
      </fieldset>
      {p.hasIndoorSensor && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="hh-indoor">User-Reported Indoor PM2.5 (µg/m³)</Label>
            <Input
              id="hh-indoor"
              type="number"
              min={0}
              max={1500}
              value={p.indoorPm25 ?? ""}
              onChange={(e) => {
                const n = num(e.target.value);
                set("indoorPm25", n === null ? null : Math.min(1500, Math.max(0, n)));
              }}
            />
          </div>
          <div>
            <Label htmlFor="hh-age">Reading taken (minutes ago)</Label>
            <Input
              id="hh-age"
              type="number"
              min={0}
              max={1440}
              value={p.indoorReadingAgeMinutes ?? ""}
              onChange={(e) => {
                const n = num(e.target.value);
                set(
                  "indoorReadingAgeMinutes",
                  n === null ? null : Math.min(1440, Math.max(0, Math.round(n))),
                );
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
