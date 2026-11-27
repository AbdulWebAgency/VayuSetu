import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { Route } from "@/routes/index";
import { useHouseholdProfile } from "@/hooks/useHouseholdProfile";
import { fetchAdvisory } from "@/lib/api";
import { runRuleEngine } from "@/domain/ruleEngine";
import { air, NOW, profile } from "../fixtures/payloads";
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchAdvisory: vi.fn(),
}));
const Dashboard = Route.options.component!;
const source = air();
const response = {
  air: { status: "ok" as const, data: source, attempted: [] },
  advisory: runRuleEngine(source, profile(), NOW),
};
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.mocked(fetchAdvisory).mockReset();
});

it("retains preferences and clears observations on reload, including legacy relative readings", () => {
  localStorage.setItem(
    "vayusetu.profile.v1",
    JSON.stringify(profile({ hasIndoorSensor: true, indoorPm25: 90, indoorReadingAgeMinutes: 5 })),
  );
  const hook = renderHook(() => useHouseholdProfile());
  expect(hook.result.current[0]).toMatchObject({
    hasIndoorSensor: true,
    indoorPm25: null,
    indoorReadingAgeMinutes: null,
  });
  act(() =>
    hook.result.current[1]({
      ...hook.result.current[0],
      indoorPm25: 100,
      indoorReadingAgeMinutes: 0,
      indoorMeasuredAt: NOW.toISOString(),
    }),
  );
  expect(hook.result.current[0].indoorPm25).toBe(100);
  hook.unmount();
  const reloaded = renderHook(() => useHouseholdProfile());
  expect(reloaded.result.current[0]).toMatchObject({
    hasIndoorSensor: true,
    indoorPm25: null,
    indoorReadingAgeMinutes: null,
  });
  expect(reloaded.result.current[0].indoorMeasuredAt).toBeUndefined();
});

it("labels previous guidance after an edit and waits for an explicit refresh", async () => {
  vi.mocked(fetchAdvisory)
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce({
      ...response,
      advisory: {
        ...response.advisory,
        mode: "ai_enriched",
        modeReason: "AI prioritized household energy.",
      },
    });
  render(<Dashboard />);
  fireEvent.click(screen.getByRole("button", { name: "Delhi" }));
  expect(await screen.findByTestId("mode")).toHaveTextContent("Rule-Based Guidance Active");
  fireEvent.click(screen.getByLabelText("Young children"));
  expect(screen.getByTestId("mode")).toHaveTextContent("Previous guidance");
  expect(screen.getByText(/displayed plan uses your previous inputs/)).toBeVisible();
  expect(fetchAdvisory).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Update my guidance" }));
  expect(
    await screen.findByText("AI prioritized household energy.", { exact: false }),
  ).toBeVisible();
  expect(screen.getByTestId("mode")).toHaveTextContent("AI-Enriched Guidance Active");
});

it("ignores an outdated response that arrives after the edited profile has been applied", async () => {
  let finish!: (r: typeof response) => void;
  vi.mocked(fetchAdvisory)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(response);
  render(<Dashboard />);
  fireEvent.click(screen.getByRole("button", { name: "Delhi" }));
  fireEvent.click(screen.getByLabelText("Young children"));
  const refresh = screen.getByRole("button", { name: "Update my guidance" });
  expect(refresh).toBeEnabled();
  expect(screen.getByText(/Household changed. Select/)).toHaveAttribute("aria-live", "polite");
  fireEvent.click(refresh);
  expect(await screen.findByTestId("mode")).toHaveTextContent("Rule-Based Guidance Active");
  await act(async () =>
    finish({ ...response, advisory: { ...response.advisory, modeReason: "Obsolete result" } }),
  );
  expect(screen.queryByText(/Obsolete result/)).toBeNull();
  expect(vi.mocked(fetchAdvisory).mock.calls[1]?.[1].youngChildren).toBe(true);
});
