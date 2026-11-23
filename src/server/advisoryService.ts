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

/** Full pipeline: provider → rule engine → Gemini → output guard, with deterministic fallback. */
export async function buildAdvisory(req: AdvisoryRequest, deps: AdvisoryDeps): Promise<{ air: AirQualityResponse; advisory: Advisory }> {
  const air = await resolveAirQuality(req.location, deps);
  const data = air.status === "ok" ? air.data : null;
  const now = deps.now?.() ?? new Date();
  if (!deps.geminiKey) return { air, advisory: runRuleEngine(data, req.profile, now, "AI key not configured — rule-based guidance") };
  const baseline = runRuleEngine(data, req.profile, now);
  try {
    const ai = await (deps.gemini ?? callGemini)(deps.geminiKey, SYSTEM_INSTRUCTION, buildUserPrompt(req.profile, data, baseline, req.location.name));
    return { air, advisory: guardAiAdvisory(ai, req.profile, baseline, data, now) };
  } catch (e) {
    console.error("DEBUG GEMINI ERROR:", e);
    const reason = e instanceof UpstreamError && e.status === 429 ? "AI rate-limited" : e instanceof UpstreamError && e.reason === "schema" ? "AI output failed validation" : "AI unavailable";
    return { air, advisory: { ...baseline, modeReason: `${reason} — rule-based guidance` } };
  }
}
