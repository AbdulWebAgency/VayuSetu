import { AiAdvisoryResponseSchema, type AiAdvisoryResponse } from "@/types/airQuality";
import { fetchJson, UpstreamError } from "../providers/http";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Default primary model; override at runtime via GEMINI_MODEL env variable (server-only, never VITE_*). */
export const GEMINI_MODEL = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL;

const GEMINI_STAGE_BUDGET_MS = 20_000;
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemma-4-31b-it"];

async function invokeModel(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  deadlineAt: number,
): Promise<AiAdvisoryResponse> {
  const raw = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      timeoutMs: 12_000,
      retries: 2,
      deadlineAt,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
            maxOutputTokens: 4096,
            ...(model.startsWith("gemma-")
              ? {}
              : {
                  thinkingConfig: model.startsWith("gemini-2.5")
                    ? { thinkingBudget: 0 }
                    : { thinkingLevel: "MINIMAL" },
                }),
          },
        }),
      },
    },
  );
  const text = (raw as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new UpstreamError("empty");
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new UpstreamError("non-json");
  }
  const parsed = AiAdvisoryResponseSchema.safeParse(obj);
  if (!parsed.success) throw new UpstreamError("schema");
  return parsed.data;
}

/**
 * Calls Gemini with separated system instruction, retries + fallback flash-lite models on 5xx/timeout,
 * and schema validation. Throws UpstreamError if all candidates fail.
 */
export async function callGemini(
  apiKey: string,
  system: string,
  user: string,
): Promise<AiAdvisoryResponse> {
  const configuredModel = process.env["GEMINI_MODEL"];
  const primary =
    configuredModel === undefined ? GEMINI_MODEL : configuredModel.trim() || DEFAULT_GEMINI_MODEL;
  const models = Array.from(new Set([primary, ...FALLBACK_MODELS]));
  const deadlineAt = Date.now() + GEMINI_STAGE_BUDGET_MS;
  let lastError: unknown;
  for (const model of models) {
    if (Date.now() >= deadlineAt) throw new UpstreamError("deadline");
    try {
      return await invokeModel(apiKey, model, system, user, deadlineAt);
    } catch (e) {
      console.error(`MODEL ATTEMPT FAILED [${model}]:`, e);
      lastError = e;
      if (e instanceof UpstreamError && e.reason === "deadline") throw e;
      if (e instanceof UpstreamError && e.status !== undefined && e.status < 500) throw e;
    }
  }
  throw lastError instanceof UpstreamError ? lastError : new UpstreamError("network");
}
