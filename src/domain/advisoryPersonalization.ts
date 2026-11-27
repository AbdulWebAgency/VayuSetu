import type { Advisory, GeminiChoices, HouseholdProfile } from "@/types/airQuality";

interface Explanation {
  id: NonNullable<GeminiChoices["explanationId"]>;
  cardId: string;
  label: string;
  text: string;
}

export function eligibleChoices(baseline: Advisory, profile: HouseholdProfile) {
  const hasCard = (id: string) => baseline.recommendations.some((card) => card.id === id);
  const pair = ["sustain-transport", "sustain-energy"] as const;
  const priorities = pair.every((id) =>
    baseline.recommendations.some((card) => card.id === id && card.pillar === "sustainable"),
  )
    ? [...pair]
    : [];
  const explanations: Explanation[] = [];
  if (profile.youngChildren && hasCard("routine-exercise"))
    explanations.push({
      id: "child-play",
      cardId: "routine-exercise",
      label: "children’s play",
      text: "For a family with young children, the play part of this advice includes ordinary games as well as organized exercise.",
    });
  if (profile.commuteMode === "private_car" && hasCard("sustain-transport"))
    explanations.push({
      id: "car-trips",
      cardId: "sustain-transport",
      label: "household car trips",
      text: "A household errand that fits an existing car journey can mean one fewer separate round trip.",
    });
  if (profile.commuteMode === "work_from_home" && hasCard("indoor-sources"))
    explanations.push({
      id: "home-source-control",
      cardId: "indoor-sources",
      label: "working from home",
      text: "On a work-from-home day, the kitchen and workspace can share indoor air well beyond mealtimes.",
    });
  return { priorities, explanations };
}
export type EligibleChoices = ReturnType<typeof eligibleChoices>;
