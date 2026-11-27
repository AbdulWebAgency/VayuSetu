import { eligibleChoices } from "@/domain/advisoryPersonalization";
import type { AdvisoryRequest, Advisory, AirQualityResponse } from "@/types/airQuality";
import { runRuleEngine } from "@/domain/ruleEngine";
import { guardAiAdvisory } from "@/domain/outputGuard";
import { resolveAirQuality, type ProviderDeps } from "./providers/providerHierarchy";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./gemini/promptBuilder";
import { callGemini } from "./gemini/geminiClient";
import { UpstreamError } from "./providers/http";

export interface AdvisoryDeps extends ProviderDeps {
  geminiKey?: string | undefined;
  gemini?: typeof callGemini;
}

function describeAiFailure(error: unknown): string {
  if (error instanceof UpstreamError) {
    if (error.status === 429) return "AI rate-limited";
    if (error.reason === "schema") return "AI output failed validation";
  }
  return "AI unavailable";
}

/** Full pipeline: provider → rule engine → Gemini → output guard, with deterministic fallback. */
export async function buildAdvisory(
  req: AdvisoryRequest,
  deps: AdvisoryDeps,
): Promise<{ air: AirQualityResponse; advisory: Advisory }> {
  const air = await resolveAirQuality(req.location, deps);
  const data = air.status === "ok" ? air.data : null;
  const now = deps.now?.() ?? new Date();
  if (!deps.geminiKey)
    return {
      air,
      advisory: runRuleEngine(
        data,
        req.profile,
        now,
        "AI key not configured — rule-based guidance",
      ),
    };
  const baseline = runRuleEngine(data, req.profile, now);
  const options = eligibleChoices(baseline, req.profile);
  if (!options.priorities.length && !options.explanations.length)
    return { air, advisory: baseline };
  try {
    const ai = await (deps.gemini ?? callGemini)(
      deps.geminiKey,
      SYSTEM_INSTRUCTION,
      buildUserPrompt(req.profile, data, baseline, req.location.name, options),
    );
    return { air, advisory: guardAiAdvisory(ai, req.profile, baseline, options, data) };
  } catch (e) {
    const reason = describeAiFailure(e);
    return { air, advisory: { ...baseline, modeReason: `${reason} — rule-based guidance` } };
  }
}
