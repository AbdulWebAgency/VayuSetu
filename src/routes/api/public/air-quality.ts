import { createFileRoute } from "@tanstack/react-router";
import { ResolvedLocationSchema } from "@/types/airQuality";
import { guardRequest, jsonResponse } from "@/server/security/requestGuard";
import { resolveAirQuality } from "@/server/providers/providerHierarchy";

export const Route = createFileRoute("/api/public/air-quality")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const g = await guardRequest(request, { schema: ResolvedLocationSchema, limiter: "standard", allowedOrigins: process.env["ALLOWED_ORIGINS"], readInput: (b) => JSON.parse(b) });
        if (!g.ok) return g.response;
        const r = await resolveAirQuality(g.data, { cpcbKey: process.env["DATA_GOV_IN_API_KEY"], waqiToken: process.env["WAQI_API_TOKEN"] });
        return jsonResponse(r, 200, g.headers);
      },
    },
  },
});
