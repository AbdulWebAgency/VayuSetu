import type {
  Advisory,
  HouseholdProfile,
  NormalizedAirQuality,
  Planner,
  Recommendation,
} from "@/types/airQuality";
import { hasEnvironmentalValue } from "./outdoorEvidence";
import { AQI_SCALE_LABEL, PM25_BANDS } from "./catalogues";
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
  outdoorCondition: "high" | "lower" | "unknown";
  basis: Basis;
  indoor: IndoorComparison;
}

/** Builds the shared context used by every deterministic rule. Stale data is not treated as live. */
export function buildContext(
  air: NormalizedAirQuality | null,
  p: HouseholdProfile,
  now = new Date(),
): RuleContext {
  const current =
    air &&
    computeFreshness(air.measuredAt, air.measurementType, now) !== "stale" &&
    hasEnvironmentalValue(air)
      ? air
      : null;
  const band = pm25Band(current?.pollutants.pm25 ?? null);
  const aqi = current?.aqi ?? null;
  const high = (aqi !== null && aqi.value > 150) || ["poor", "very_poor", "severe"].includes(band);
  const outdoorCondition = high ? "high" : aqi !== null || band !== "unknown" ? "lower" : "unknown";
  const basis: Basis = !current
    ? "Qualitative"
    : current.measurementType === "ground_station"
      ? "Measured"
      : "Estimated";
  return {
    air: current,
    usable: current !== null,
    band,
    tier: sensitivityTier(p),
    outdoorCondition,
    basis,
    indoor: compareIndoorOutdoor(p, current, now),
  };
}

function ventilation(c: RuleContext): string {
  const indoorHigher = c.indoor.status === "comparable" && c.indoor.indoorHigher;
  if (c.outdoorCondition === "high") {
    const precaution =
      "Outdoor pollution indicators are high. Keep windows closed during peaks and ventilate briefly only as needed to clear indoor fumes or humidity.";
    return indoorHigher
      ? `${precaution} Your reported indoor PM2.5 is higher still. Stop indoor smoke sources and use kitchen exhaust while cooking.`
      : precaution;
  }
  if (c.outdoorCondition === "unknown") {
    const evidence = c.usable
      ? "Available outdoor readings are insufficient to determine ventilation timing."
      : "Live outdoor data unavailable.";
    return `${evidence} Control indoor smoke sources, use kitchen exhaust while cooking and ventilate briefly as needed.`;
  }
  if (indoorHigher)
    return "Your reported indoor PM2.5 is higher than the comparable outdoor reading. Stop indoor smoke sources and consider brief cross-ventilation if local conditions allow.";
  return "The available outdoor indicators are below the high category. Consider brief cross-ventilation if local conditions allow and recheck readings before ventilating later.";
}

const describeOutdoorEvidence = (c: RuleContext, extra: string): string => {
  if (!c.air) return `No verified live outdoor reading. ${extra}`;
  const evidence: string[] = [];
  if (c.air.pollutants.pm25 !== null)
    evidence.push(`Outdoor PM2.5 ${c.air.pollutants.pm25} µg/m³ (${c.band})`);
  if (c.air.aqi) evidence.push(`${AQI_SCALE_LABEL[c.air.aqi.scale]} ${c.air.aqi.value}`);
  return `${evidence.length ? evidence.join("; ") : "Outdoor data available without AQI or PM2.5"}. ${extra}`;
};

function outdoorActivity(c: RuleContext) {
  switch (c.outdoorCondition) {
    case "high":
      return {
        title: "Move outdoor exercise and play indoors",
        action: "Move exercise or play indoors while outdoor indicators are high.",
      };
    case "lower":
      return {
        title: "Check conditions before outdoor activity",
        action:
          "Consider outdoor exercise or play if local conditions allow. Recheck the reading before going out later.",
      };
    case "unknown":
      return {
        title: "Check an outdoor reading before planning exercise or play",
        action: "Choose indoor exercise or play until a current reading can inform the decision.",
      };
  }
}

function routineRecs(
  c: RuleContext,
  p: HouseholdProfile,
  activity: ReturnType<typeof outdoorActivity>,
): Recommendation[] {
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
      title: activity.title,
      what: activity.action,
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

function planner(
  c: RuleContext,
  p: HouseholdProfile,
  activity: ReturnType<typeof outdoorActivity>,
): Planner {
  const activityReason = describeOutdoorEvidence(
    c,
    "Recheck outdoor conditions before a later outing.",
  );
  return {
    morning:
      p.exerciseRoutine === "morning_outdoor"
        ? { action: activity.action, reason: activityReason, pillar: "routines" }
        : {
            action: ventilation(c),
            reason: describeOutdoorEvidence(c, "Use current evidence for ventilation decisions."),
            pillar: "indoor",
          },
    afternoon:
      p.commuteMode === "private_car"
        ? {
            action: "Batch errands into one trip, or use metro/bus",
            reason: "Combining trips reduces unnecessary driving.",
            pillar: "sustainable",
          }
        : p.youngChildren ||
            p.exerciseRoutine === "morning_outdoor" ||
            p.exerciseRoutine === "evening_outdoor"
          ? { action: activity.action, reason: activityReason, pillar: "routines" }
          : {
              action: "Group essential errands if you need to go out.",
              reason: activityReason,
              pillar: "routines",
            },
    evening: {
      action: p.hasAirPurifier
        ? "Close the bedroom and run the purifier before sleep"
        : "Damp-dust the bedroom and keep it closed overnight",
      reason:
        "Prepare the bedroom before sleep, when the household will spend several hours there.",
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
  const activity = outdoorActivity(c);
  return {
    mode: "rule_based",
    modeReason,
    sensitivityTier: c.tier,
    pm25Band: c.band,
    ventilation: ventilation(c),
    purifierApplicable: p.hasAirPurifier,
    liveDataAvailable: c.usable,
    recommendations: [
      ...routineRecs(c, p, activity),
      ...indoorRecs(c, p),
      ...sustainableRecs(c, p),
    ],
    planner: planner(c, p, activity),
    rejectedAiItems: 0,
  };
}
