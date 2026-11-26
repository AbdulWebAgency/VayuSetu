/** Optional live check of Open-Meteo endpoints. Run: bun run test:smoke */
import { geocodeIndia } from "../../src/server/providers/geocodingProvider";
import { fetchOpenMeteo } from "../../src/server/providers/openMeteoProvider";

const loc = (await geocodeIndia("Hyderabad"))[0];
if (!loc) throw new Error("Geocoding returned no Indian match for Hyderabad");
console.log("geocode ok:", loc.name, loc.admin, loc.coordinates);
const aq = await fetchOpenMeteo(loc.coordinates);
console.log(
  "air quality ok:",
  aq.measurementType,
  aq.measuredAt,
  "PM2.5",
  aq.pollutants.pm25,
  "AQI",
  aq.aqi,
);
