import { createFileRoute } from "@tanstack/react-router";
import { GeocodeQuerySchema } from "@/types/airQuality";
import { guardRequest, jsonResponse } from "@/server/security/requestGuard";
import { geocodeIndia } from "@/server/providers/geocodingProvider";

export const Route = createFileRoute("/api/public/geocode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = await guardRequest(request, {
          schema: GeocodeQuerySchema,
          limiter: "standard",
          allowedOrigins: process.env["ALLOWED_ORIGINS"],
          readInput: (_b, u) => u.searchParams.get("q") ?? "",
        });
        if (!g.ok) return g.response;
        try {
          const results = await geocodeIndia(g.data);
          return jsonResponse({ results }, 200, g.headers);
        } catch {
          return jsonResponse(
            { error: "Geocoding service unavailable", results: [] },
            502,
            g.headers,
          );
        }
      },
    },
  },
});
