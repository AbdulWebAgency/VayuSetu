import { expect, test, type Page } from "@playwright/test";

const air = (name: string) => ({
  status: "ok",
  attempted: ["Open-Meteo: used"],
  data: {
    provider: "OPEN_METEO",
    providerName: "Atmospheric Model Estimate (Open-Meteo / CAMS Global)",
    agency: "CAMS",
    measurementType: "model_estimate",
    stationId: null,
    stationName: null,
    dataCoordinates: { lat: 17.4, lon: 78.5 },
    measuredAt: new Date(Date.now() - 30 * 60000).toISOString(),
    fetchedAt: new Date().toISOString(),
    aqi: { value: 168, scale: "US_EPA" },
    pollutants: { pm25: 88.2, pm10: 120, no2: 30, so2: 10, o3: 40, co: 800 },
    units: "µg/m³",
    notes: [`fixture for ${name}`],
  },
});
const slot = (a: string) => ({ action: a, reason: "Fixture reason", pillar: "indoor" });
const rec = (id: string, pillar: string) => ({
  id,
  pillar,
  title: `Rec ${id}`,
  what: "Do it",
  why: "Because",
  how: "Helps",
  limitation: "Effort",
  basis: "Estimated",
});

async function mockApis(page: Page) {
  await page.route("**/api/public/geocode*", (r) =>
    r.fulfill({
      json: {
        results: [
          { name: "Lucknow", admin: "Uttar Pradesh", coordinates: { lat: 26.84, lon: 80.92 } },
        ],
      },
    }),
  );
  await page.route("**/api/public/advisory", async (r) => {
    const body = r.request().postDataJSON() as { location: { name: string } };
    await r.fulfill({
      json: {
        air: air(body.location.name),
        advisory: {
          mode: "rule_based",
          modeReason: "fixture",
          sensitivityTier: "standard",
          pm25Band: "moderate",
          ventilation: "v",
          purifierApplicable: false,
          liveDataAvailable: true,
          recommendations: [rec("a", "routines"), rec("b", "indoor"), rec("c", "sustainable")],
          planner: {
            morning: slot("Morning fixture"),
            afternoon: slot("Afternoon fixture"),
            evening: slot("Evening fixture"),
          },
          rejectedAiItems: 0,
        },
      },
    });
  });
}

test("scenario → data → planner", async ({ page }) => {
  await mockApis(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /A · Family with young children/ }).click();
  await expect(page.getByRole("heading", { name: /Outdoor air · Hyderabad/ })).toBeVisible();
  await expect(page.getByText("Atmospheric Model Estimate", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Evening" })).toContainText("Evening fixture");
  await expect(page.getByLabel("Young children")).toBeChecked();
});

test("custom city geocoding requires confirmation; profile + indoor PM2.5", async ({ page }) => {
  await mockApis(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel(/Search another Indian city/).fill("Lucknow");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Lucknow, Uttar Pradesh")).toBeVisible();
  await page.getByRole("button", { name: "Confirm Lucknow" }).click();
  await expect(page.getByRole("heading", { name: /Outdoor air · Lucknow/ })).toBeVisible();
  await page.getByLabel("We have an indoor PM2.5 sensor").check();
  await page.getByLabel("User-Reported Indoor PM2.5 (µg/m³)").fill("120");
  await page.getByLabel(/Reading taken/).fill("5");
  await expect(page.getByText(/indoor is higher/)).toBeVisible();
  await page.getByRole("button", { name: "Update my guidance" }).click();
  await expect(page.getByRole("listitem", { name: "Morning" })).toContainText("Morning fixture");
});
