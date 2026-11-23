import { NormalizedAirQualitySchema, ResolvedLocationSchema } from "@/types/airQuality";
import { CpcbSchema, OpenMeteoAirSchema, OpenMeteoGeocodeSchema, WaqiSchema, normalizeCpcb, normalizeGeocode, normalizeOpenMeteo, normalizeWaqi } from "@/domain/normalizer";
import { cpcbRaw, DELHI, geocodeRaw, NOW, openMeteoRaw, waqiRaw } from "../fixtures/payloads";

describe("provider contracts", () => {
  it("sample upstream payloads satisfy raw schemas", () => {
    expect(OpenMeteoAirSchema.safeParse(openMeteoRaw).success).toBe(true);
    expect(WaqiSchema.safeParse(waqiRaw).success).toBe(true);
    expect(CpcbSchema.safeParse(cpcbRaw).success).toBe(true);
    expect(OpenMeteoGeocodeSchema.safeParse(geocodeRaw).success).toBe(true);
  });
  it("normalized outputs satisfy NormalizedAirQualitySchema", () => {
    for (const n of [normalizeOpenMeteo(openMeteoRaw, NOW), normalizeWaqi(waqiRaw, NOW), normalizeCpcb(cpcbRaw, DELHI.coordinates, NOW)])
      expect(NormalizedAirQualitySchema.safeParse(n).success).toBe(true);
    for (const l of normalizeGeocode(geocodeRaw)) expect(ResolvedLocationSchema.safeParse(l).success).toBe(true);
  });
  it("malformed payloads are rejected", () => {
    expect(() => normalizeOpenMeteo({ current: {} }, NOW)).toThrow();
    expect(normalizeWaqi({ status: "error", data: waqiRaw.data }, NOW)).toBeNull();
  });
});
