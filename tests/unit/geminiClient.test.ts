import type { AiAdvisoryResponse } from "@/types/airQuality";

const defaultModel = "gemini-3.5-flash-lite";
const configuredModel = "gemini-2.5-flash";
const slot = { action: "Stay indoors", reason: "Limit exposure", pillar: "routines" } as const;
const advisory: AiAdvisoryResponse = {
  recommendations: (["routines", "indoor", "sustainable"] as const).map((pillar) => ({
    id: pillar,
    pillar,
    title: "Limit exposure",
    what: "Stay indoors",
    why: "Reduce exposure",
    how: "Move activities inside",
    limitation: "Indoor conditions vary",
    basis: "Qualitative",
  })),
  planner: { morning: slot, afternoon: slot, evening: slot },
};

function mockGeminiFetch() {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(advisory) }] } }] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const modelUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Gemini model configuration", () => {
  it.each([
    { label: "missing", value: undefined, expected: defaultModel },
    { label: "empty", value: "", expected: defaultModel },
    { label: "whitespace-only", value: "  \t ", expected: defaultModel },
    { label: "configured", value: configuredModel, expected: configuredModel },
    {
      label: "configured with padding",
      value: `  ${configuredModel}  `,
      expected: configuredModel,
    },
  ])("selects the primary model for $label configuration", async ({ value, expected }) => {
    vi.stubEnv("GEMINI_MODEL", value);
    const fetchMock = mockGeminiFetch();
    const { GEMINI_MODEL, callGemini } = await import("@/server/gemini/geminiClient");

    await expect(callGemini("dummy-key", "system", "user")).resolves.toEqual(advisory);
    expect.soft(GEMINI_MODEL).toBe(expected);
    expect(fetchMock).toHaveBeenNthCalledWith(1, modelUrl(expected), expect.any(Object));
  });

  it("handles a runtime override, removal and explicit blank after import", async () => {
    vi.stubEnv("GEMINI_MODEL", configuredModel);
    const fetchMock = mockGeminiFetch();
    const { GEMINI_MODEL, callGemini } = await import("@/server/gemini/geminiClient");
    expect(GEMINI_MODEL).toBe(configuredModel);

    vi.stubEnv("GEMINI_MODEL", "  gemma-4-31b-it  ");
    await callGemini("dummy-key", "system", "user");
    expect(fetchMock).toHaveBeenNthCalledWith(1, modelUrl("gemma-4-31b-it"), expect.any(Object));

    vi.stubEnv("GEMINI_MODEL", undefined);
    await callGemini("dummy-key", "system", "user");
    expect(fetchMock).toHaveBeenNthCalledWith(2, modelUrl(configuredModel), expect.any(Object));

    vi.stubEnv("GEMINI_MODEL", "");
    await callGemini("dummy-key", "system", "user");
    expect(fetchMock).toHaveBeenNthCalledWith(3, modelUrl(defaultModel), expect.any(Object));
    expect(GEMINI_MODEL).toBe(configuredModel);
  });
});

describe("Gemini stage deadline", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["headers", "body", "fallback"])(
    "stops waiting for %s at the shared deadline",
    async (phase) => {
      const { callGemini } = await import("@/server/gemini/geminiClient");
      vi.useFakeTimers();
      vi.stubEnv("GEMINI_MODEL", configuredModel);
      const pending = new Promise<never>(() => {});
      const fetchMock = vi.fn<typeof fetch>(async () => {
        if (phase === "fallback" && fetchMock.mock.calls.length <= 3) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return new Response(null, { status: 503 });
        }
        if (phase === "body") {
          const response = Response.json({});
          vi.spyOn(response, "json").mockReturnValue(pending);
          return response;
        }
        return pending;
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = callGemini("dummy", "system", "user").catch((error: unknown) => error);
      const expiry = Symbol("still pending");
      await vi.advanceTimersByTimeAsync(20000);
      expect(await Promise.race([result, Promise.resolve(expiry)])).toMatchObject({
        reason: "deadline",
      });
      expect(fetchMock).toHaveBeenCalledTimes(phase === "fallback" ? 4 : 2);
      if (phase === "fallback") expect(fetchMock.mock.calls[3]?.[0]).toBe(modelUrl(defaultModel));
    },
  );
  it("propagates 429 immediately without another model or retry", async () => {
    const { callGemini } = await import("@/server/gemini/geminiClient");
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callGemini("dummy", "system", "user")).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
