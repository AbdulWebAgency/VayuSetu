import { createFileRoute } from "@tanstack/react-router";
import { AdvisoryRequestSchema } from "@/types/airQuality";
import { guardRequest, jsonResponse } from "@/server/security/requestGuard";
import { buildAdvisory } from "@/server/advisoryService";

export const Route = createFileRoute("/api/public/advisory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const g = await guardRequest(request, {
          schema: AdvisoryRequestSchema,
          limiter: "advisory",
          allowedOrigins: process.env["ALLOWED_ORIGINS"],
          readInput: (b) => JSON.parse(b),
        });
        if (!g.ok) return g.response;
        const r = await buildAdvisory(g.data, {
          cpcbKey: process.env["DATA_GOV_IN_API_KEY"],
          waqiToken: process.env["WAQI_API_TOKEN"],
          geminiKey: process.env["GEMINI_API_KEY"],
        });
        return jsonResponse(r, 200, g.headers);
      },
    },
  },
});
