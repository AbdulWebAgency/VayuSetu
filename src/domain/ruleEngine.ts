import type {
  Advisory,
  HouseholdProfile,
  NormalizedAirQuality,
  Planner,
  Recommendation,
} from "@/types/airQuality";
import { PM25_BANDS } from "./catalogues";
import { computeFreshness } from "./freshness";
import { compareIndoorOutdoor, type IndoorComparison } from "./indoorComparison";

type Band = Advisory["pm25Band"];
type Basis = Recommendation["basis"];

/** Concentration band from provider PM2.5 (CPCB NAQI breakpoints). Not an AQI. */
export function pm25Band(pm25: number | null): Band {
  if (pm25 === null) return "unknown";
  return (PM25_BANDS.find((b) => pm25 <= b.max)?.band ?? "severe") as Band;
}

/** Sensitivity tier from household vulnerability factors. */
export function sensitivityTier(p: HouseholdProfile): Advisory["sensitivityTier"] {
  const n = Number(p.youngChildren) + Number(p.elderly) + Number(p.respiratorySensitivity) * 2;
  return n >= 2 ? "high" : n === 1 ? "elevated" : "standard";
}

export interface RuleContext {
  air: NormalizedAirQuality | null;
  usable: boolean;
  band: Band;
  tier: Advisory["sensitivityTier"];
  high: boolean;
  basis: Basis;
  indoor: IndoorComparison;
}

/** Builds the shared context used by every deterministic rule. Stale data is not treated as live. */
export function buildContext(
  air: NormalizedAirQuality | null,
  p: HouseholdProfile,
  now = new Date(),
): RuleContext {
  const usable = !!air && computeFreshness(air.measuredAt, air.measurementType, now) !== "stale";
  const band = usable ? pm25Band(air!.pollutants.pm25) : "unknown";
  const aqiHigh = usable && air!.aqi !== null && air!.aqi.value > 150;
  const high = aqiHigh || ["poor", "very_poor", "severe"].includes(band);
  const basis: Basis = !usable
    ? "Qualitative"
    : air!.measurementType === "ground_station"
      ? "Measured"
      : "Estimated";
  return {
    air,
    usable,
    band,
    tier: sensitivityTier(p),
    high,
    basis,
    indoor: compareIndoorOutdoor(p, air, now),
  };
}

function ventilation(c: RuleContext): string {
  if (c.indoor.status === "comparable" && c.indoor.indoorHigher)
    return "Your reported indoor PM2.5 is above the outdoor reading taken around the same time — likely an indoor source. Short, cross-ventilation bursts can help once the source (cooking, incense, smoke) is stopped.";
  if (!c.usable)
    return "Live outdoor data unavailable: keep windows mostly closed during traffic peaks and ventilate briefly after cooking.";
  if (c.high)
    return "Outdoor particle levels are high: keep windows closed during peaks and ventilate in short bursts only to clear cooking fumes or humidity.";
  return "Outdoor particle levels are lower right now: a 10–15 minute cross-ventilation window is reasonable, ideally away from road-facing sides.";
}

const describeOutdoorEvidence = (c: RuleContext, extra: string): string => {
  const pm =
    c.usable && c.air?.pollutants.pm25 != null
      ? `Outdoor PM2.5 ${c.air.pollutants.pm25} µg/m³ (${c.basis.toLowerCase()})`
      : "No verified live outdoor reading";
  return `${pm}. ${extra}`;
};

function routineRecs(c: RuleContext, p: HouseholdProfile): Recommendation[] {
  const out: Recommendation[] = [];
  const motor = p.commuteMode === "private_car" || p.commuteMode === "two_wheeler";
  out.push({
    id: "routine-commute",
    pillar: "routines",
    title: motor
      ? "Shift or share the vehicle commute"
      : p.commuteMode === "work_from_home"
        ? "Keep remote-work days on high-smog days"
        : "Plan the commute around peak smog",
    what: motor
      ? "Combine errands into one trip, carpool, or switch one commute leg to metro/bus; on a two-wheeler wear a well-fitted N95/FFP2 mask."
      : p.commuteMode === "work_from_home"
        ? "Schedule unavoidable outings for midday instead of early morning or late evening."
        : "Travel slightly outside 8–10 am and 6–9 pm peaks where possible and choose routes away from arterial roads.",
    why: describeOutdoorEvidence(
      c,
      `Commute: ${p.commuteMode.replace(/_/g, " ")}, ${p.commuteWindow.replace(/_/g, " ")}.`,
    ),
    how: "Winter inversions trap traffic emissions near the ground in early morning and late evening; fewer vehicle trips also cut what you add.",
    limitation:
      "Office hours, school timings and transit availability may not allow shifting; a mask only helps if it seals well.",
    basis: c.basis,
  });
  if (
    p.exerciseRoutine === "morning_outdoor" ||
    p.exerciseRoutine === "evening_outdoor" ||
    p.youngChildren
  ) {
    out.push({
      id: "routine-exercise",
      pillar: "routines",
      title: c.high
        ? "Move outdoor exercise and play indoors today"
        : "Time outdoor activity for the cleaner window",
      what: c.high
        ? "Replace outdoor runs or children's outdoor play with indoor activity until levels drop."
        : "Prefer late morning to mid-afternoon for outdoor exercise or play, away from busy roads.",
      why: describeOutdoorEvidence(
        c,
        `Routine: ${p.exerciseRoutine.replace(/_/g, " ")}${p.youngChildren ? "; young children present" : ""}.`,
      ),
      how: "Deeper breathing during exertion increases the amount of particles inhaled; children breathe more air per body weight.",
      limitation: "Indoor alternatives may be less enjoyable; conditions vary block to block.",
      basis: c.basis,
    });
  }
  return out;
}

function indoorRecs(c: RuleContext, p: HouseholdProfile): Recommendation[] {
  const out: Recommendation[] = [
    {
      id: "indoor-sources",
      pillar: "indoor",
      title: "Cut indoor smoke and combustion",
      what: "Use the kitchen exhaust or chimney while cooking, avoid incense, mosquito coils and indoor smoking, and keep tadka/frying lids on.",
      why:
        c.indoor.status === "comparable" && c.indoor.indoorHigher
          ? `Your reported indoor PM2.5 (${c.indoor.indoorPm25} µg/m³) is above the outdoor reading taken around the same time.`
          : "Indoor combustion is a major particle source in Indian homes, independent of outdoor levels.",
      how: "Removing sources is the most effective way to lower indoor particles.",
      limitation: "Exhausts need to vent outdoors to be effective; habits take time to change.",
      basis: c.indoor.status === "comparable" ? "Measured" : "Qualitative",
    },
    {
      id: "indoor-ventilation",
      pillar: "indoor",
      title: "Time window ventilation",
      what: ventilation(c),
      why: describeOutdoorEvidence(
        c,
        "Ventilation timing depends on whether the stronger source is indoors or outdoors.",
      ),
      how: "Brief, targeted ventilation clears indoor fumes and humidity while limiting outdoor smog entry.",
      limitation: "Kitchens and bathrooms still need airflow to avoid moisture and gas build-up.",
      basis: c.basis,
    },
  ];
  out.push(
    p.hasAirPurifier
      ? {
          id: "indoor-purifier",
          pillar: "indoor",
          title: "Run your HEPA purifier in the main room",
          what: "Run the purifier continuously in the room where the family spends most time (bedroom at night), doors closed, and check/replace the filter per manufacturer guidance.",
          why: describeOutdoorEvidence(c, `Tier: ${c.tier} sensitivity.`),
          how: "True HEPA filters capture most fine particles passing through; a closed room lets the unit keep up.",
          limitation:
            "Only effective if sized for the room (CADR) and the filter is maintained; does not remove gases.",
          basis: c.basis,
        }
      : {
          id: "indoor-clean-room",
          pillar: "indoor",
          title: "Create one cleaner room without a purifier",
          what: "Pick one bedroom, keep its windows closed on high-smog days, seal obvious gaps, wet-mop and dust with a damp cloth. If you consider buying a HEPA purifier, choose one whose CADR suits the room size.",
          why: describeOutdoorEvidence(c, `No purifier owned; tier: ${c.tier}.`),
          how: "Limiting infiltration and resuspended dust reduces particles where people sleep.",
          limitation: "Sealing reduces fresh air; a purifier is an added cost.",
          basis: "Qualitative",
        },
  );
  out.push({
    id: "indoor-plants",
    pillar: "indoor",
    title: "Treat indoor plants as supplementary only",
    what: "Keep plants if you enjoy them, but rely on source control, ventilation timing and filtration for particles.",
    why: "Plants are often promoted as air purifiers.",
    how: "At normal household densities plants remove negligible PM2.5 compared with ventilation or HEPA filtration.",
    limitation:
      "Overwatered soil can encourage mould; plants never replace source control or filtration.",
    basis: "Qualitative",
  });
  return out;
}

function sustainableRecs(c: RuleContext, p: HouseholdProfile): Recommendation[] {
  return [
    {
      id: "sustain-transport",
      pillar: "sustainable",
      title: "Choose lower-emission trips",
      what:
        p.commuteMode === "private_car"
          ? "Swap at least some car trips for metro/bus or carpooling, and avoid idling at signals."
          : "Keep using public transit, walking or cycling for short trips when conditions allow; avoid unnecessary vehicle trips.",
      why: "Vehicle exhaust and road dust are key contributors to urban winter smog.",
      how: "Fewer vehicle-kilometres reduce the emissions your household adds to the local air.",
      limitation:
        "Last-mile gaps and safety may limit options; the individual effect is small but adds up across households.",
      basis: "Qualitative",
    },
    {
      id: "sustain-energy",
      pillar: "sustainable",
      title: "Cleaner household energy habits",
      what: "Avoid burning leaves or waste, prefer LPG/induction over wood or kerosene, and switch off heaters or geysers when not needed.",
      why: "Open burning and solid fuels add particles locally; lower electricity demand eases power-plant emissions.",
      how: "Removes local combustion sources and reduces indirect emissions.",
      limitation: "Induction cookware and appliance upgrades involve cost.",
      basis: "Qualitative",
    },
  ];
}

function planner(c: RuleContext, p: HouseholdProfile): Planner {
  return {
    morning:
      c.high || !c.usable
        ? {
            action:
              p.exerciseRoutine === "morning_outdoor"
                ? "Do your workout indoors; keep windows closed"
                : "Keep windows closed; run kitchen exhaust while cooking",
            reason: "Winter mornings often trap pollutants near the ground.",
            pillar: p.exerciseRoutine === "morning_outdoor" ? "routines" : "indoor",
          }
        : {
            action: "Short cross-ventilation after breakfast cooking",
            reason: "Outdoor levels are lower right now.",
            pillar: "indoor",
          },
    afternoon: {
      action:
        p.commuteMode === "private_car"
          ? "Batch errands into one trip, or use metro/bus"
          : "Run errands and outdoor play in this window",
      reason: "Midday mixing usually disperses smog more than mornings/evenings.",
      pillar: p.commuteMode === "private_car" ? "sustainable" : "routines",
    },
    evening: {
      action: p.hasAirPurifier
        ? "Close the bedroom and run the purifier before sleep"
        : "Damp-dust the bedroom and keep it closed overnight",
      reason:
        "Evening traffic and cooling air raise outdoor particles; sleep is the longest indoor exposure.",
      pillar: "indoor",
    },
  };
}

/** Deterministic, complete advisory used directly or as the AI fallback. */
export function runRuleEngine(
  air: NormalizedAirQuality | null,
  p: HouseholdProfile,
  now = new Date(),
  modeReason = "Rule-based guidance",
): Advisory {
  const c = buildContext(air, p, now);
  return {
    mode: "rule_based",
    modeReason,
    sensitivityTier: c.tier,
    pm25Band: c.band,
    ventilation: ventilation(c),
    purifierApplicable: p.hasAirPurifier,
    liveDataAvailable: c.usable,
    recommendations: [...routineRecs(c, p), ...indoorRecs(c, p), ...sustainableRecs(c, p)],
    planner: planner(c, p),
    rejectedAiItems: 0,
  };
}
