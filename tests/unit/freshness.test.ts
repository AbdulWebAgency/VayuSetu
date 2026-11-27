import { computeFreshness } from "@/domain/freshness";
import { NOW } from "../fixtures/payloads";

const ago = (min: number) => new Date(NOW.getTime() - min * 60000).toISOString();

describe("freshness", () => {
  it("ground station: live ≤90 min, aging ≤3 h, stale beyond", () => {
    expect(computeFreshness(ago(90), "ground_station", NOW)).toBe("live");
    expect(computeFreshness(ago(91), "ground_station", NOW)).toBe("aging");
    expect(computeFreshness(ago(180), "ground_station", NOW)).toBe("aging");
    expect(computeFreshness(ago(181), "ground_station", NOW)).toBe("stale");
  });
  it("model: live ≤3 h, stale beyond", () => {
    expect(computeFreshness(ago(180), "model_estimate", NOW)).toBe("live");
    expect(computeFreshness(ago(181), "model_estimate", NOW)).toBe("stale");
  });
  it("uses measuredAt, not cache age: a just-fetched 4 h old reading is stale", () => {
    expect(computeFreshness(ago(240), "model_estimate", NOW)).toBe("stale");
  });
});

it.each(["ground_station", "model_estimate"] as const)(
  "requires the %s observation time to have arrived",
  (type) => {
    expect(computeFreshness(new Date(NOW.getTime() + 1).toISOString(), type, NOW)).toBe("stale");
    expect(computeFreshness(NOW.toISOString(), type, NOW)).toBe("live");
  },
);
