import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp, CloudFog } from "lucide-react";
import type { Advisory } from "@/types/airQuality";
import { PM25_BANDS } from "@/domain/catalogues";

const STYLE: Record<Advisory["pm25Band"], { cls: string; Icon: typeof CheckCircle2 }> = {
  unknown: { cls: "bg-sev-unknown", Icon: CircleHelp },
  good: { cls: "bg-sev-good", Icon: CheckCircle2 },
  satisfactory: { cls: "bg-sev-good", Icon: CheckCircle2 },
  moderate: { cls: "bg-sev-moderate", Icon: CloudFog },
  poor: { cls: "bg-sev-poor", Icon: AlertTriangle },
  very_poor: { cls: "bg-sev-severe", Icon: AlertTriangle },
  severe: { cls: "bg-sev-severe", Icon: AlertOctagon },
};

/** Dual-encoded severity: icon + text category + numeric value (never colour alone). */
export function SeverityBadge({
  band,
  value,
}: {
  band: Advisory["pm25Band"];
  value: number | null;
}) {
  const { cls, Icon } = STYLE[band];
  const label =
    band === "unknown" ? "Unavailable" : (PM25_BANDS.find((b) => b.band === band)?.label ?? band);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-primary-foreground ${cls}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
      {value !== null && <span>· {value} µg/m³</span>}
    </span>
  );
}
