import { AiAdvisoryResponseSchema, type AiAdvisoryResponse } from "@/types/airQuality";
import { fetchJson, UpstreamError } from "../providers/http";

/** Default model; override at runtime via GEMINI_MODEL env variable (server-only, never VITE_*). */
export const GEMINI_MODEL = process.env["GEMINI_MODEL"] ?? "gemini-3.1-flash-lite";

/**
 * Calls Gemini with separated system instruction and data turn (10 s timeout, 1 retry on network/5xx).
 * Returns a schema-validated response or throws.
 */
export async function callGemini(apiKey: string, system: string, user: string): Promise<AiAdvisoryResponse> {
  const model = process.env["GEMINI_MODEL"] ?? GEMINI_MODEL;
  const raw = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    timeoutMs: 10_000,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 4096, thinkingConfig: model.startsWith("gemini-3") ? { thinkingLevel: "MINIMAL" } : { thinkingBudget: 0 } },
      }),
    },
  });
  const text = (raw as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new UpstreamError("empty");
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { throw new UpstreamError("non-json"); }
  const parsed = AiAdvisoryResponseSchema.safeParse(obj);
  if (!parsed.success) throw new UpstreamError("schema");
  return parsed.data;
}
