import { Building2, Clock, Radio, Satellite, WifiOff } from "lucide-react";
import type { AirQualityResponse, HouseholdProfile, Pollutants } from "@/types/airQuality";
import { AQI_SCALE_LABEL } from "@/domain/catalogues";
import { ageMinutes, computeFreshness } from "@/domain/freshness";
import { compareIndoorOutdoor } from "@/domain/indoorComparison";
import { pm25Band } from "@/domain/ruleEngine";
import { SeverityBadge } from "@/components/common/SeverityBadge";

const FRESH = { live: "Live", aging: "Aging", stale: "Stale" } as const;
const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const POLL: [keyof Pollutants, string][] = [
  ["pm25", "PM2.5"],
  ["pm10", "PM10"],
  ["no2", "NO₂"],
  ["so2", "SO₂"],
  ["o3", "O₃"],
  ["co", "CO"],
];

type Props = {
  air: AirQualityResponse | null;
  loading: boolean;
  locationName: string | null;
  profile: HouseholdProfile;
  now?: Date;
};

/** Verified outdoor data with full provenance, plus a strictly separate indoor card. */
export function AirQualityOverview({
  air,
  loading,
  locationName,
  profile,
  now = new Date(),
}: Props) {
  if (!locationName)
    return (
      <section className="card-surface p-5">
        <p>Select a city or a sample scenario to load live outdoor data.</p>
      </section>
    );
  if (loading && !air)
    return (
      <section className="card-surface p-5" aria-busy="true">
        <p>Fetching verified outdoor data for {locationName}…</p>
      </section>
    );
  const data = air?.status === "ok" ? air.data : null;
  const indoor = compareIndoorOutdoor(profile, data, now);
  return (
    <section aria-labelledby="aq-h" className="space-y-4">
      <div className="card-surface p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="aq-h" className="text-xl font-semibold">
            Outdoor air · {locationName}
          </h2>
          {data && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {data.measurementType === "ground_station" ? (
                <Radio className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Satellite className="h-3.5 w-3.5" aria-hidden />
              )}
              {data.measurementType === "ground_station"
                ? "Ground-Station Observation"
                : "Atmospheric Model Estimate"}
            </span>
          )}
        </div>
        {!data ? (
          <div role="alert" className="flex gap-3 rounded-md border border-destructive p-4">
            <WifiOff className="h-5 w-5 text-destructive" aria-hidden />
            <div>
              <p className="font-semibold">Live Environmental Data Unavailable</p>
              <p className="text-sm text-muted-foreground">
                No provider returned data. Guidance below is general precaution only, not based on
                live readings.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">AQI</p>
                {data.aqi ? (
                  <p className="font-display text-4xl font-semibold">
                    {data.aqi.value}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {AQI_SCALE_LABEL[data.aqi.scale]}
                    </span>
                  </p>
                ) : (
                  <p className="font-display text-2xl">
                    Unavailable{" "}
                    <span className="block text-xs font-normal text-muted-foreground">
                      Provider did not supply an AQI
                    </span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  PM2.5 band (CPCB breakpoints)
                </p>
                <SeverityBadge band={pm25Band(data.pollutants.pm25)} value={data.pollutants.pm25} />
              </div>
              {(() => {
                const freshness = computeFreshness(data.measuredAt, data.measurementType, now);
                return (
                  <p className="inline-flex items-center gap-1 text-sm" data-testid="freshness">
                    <Clock className="h-4 w-4" aria-hidden />
                    <strong>{FRESH[freshness]}</strong> · measured{" "}
                    {ageMinutes(data.measuredAt, now)} min ago
                  </p>
                );
              })()}
            </div>
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {POLL.map(([k, l]) => (
                <div key={k} className="rounded-md bg-muted p-2 text-center">
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="font-semibold">
                    {data.pollutants[k] ?? "—"}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {data.pollutants[k] === null ? "not supplied" : "µg/m³"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-y-1 text-xs text-muted-foreground">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold">Provider: </dt>
                  <dd className="inline">{data.providerName}</dd>
                </div>
                {data.agency && (
                  <div>
                    <dt className="inline font-semibold">Agency: </dt>
                    <dd className="inline">{data.agency}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-semibold">
                    {data.stationName ? "Station: " : "Model grid: "}
                  </dt>
                  <dd className="inline">
                    {data.stationName
                      ? `${data.stationName} (${data.stationId})`
                      : `${data.dataCoordinates.lat.toFixed(3)}, ${data.dataCoordinates.lon.toFixed(3)}`}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Measured at: </dt>
                  <dd className="inline">{formatTimestamp(data.measuredAt)}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Fetched at: </dt>
                  <dd className="inline">{formatTimestamp(data.fetchedAt)}</dd>
                </div>
              </dl>
              {data.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </>
        )}
      </div>
      <IndoorCard indoor={indoor} />
    </section>
  );
}

function IndoorCard({ indoor }: { indoor: ReturnType<typeof compareIndoorOutdoor> }) {
  return (
    <article aria-labelledby="in-h" className="card-surface p-5">
      <h3 id="in-h" className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <Building2 className="h-5 w-5" aria-hidden />
        {indoor.status === "no_indoor"
          ? "General Indoor Air-Quality Guidance"
          : "User-Reported Indoor PM2.5 (µg/m³)"}
      </h3>
      {indoor.status === "no_indoor" ? (
        <p className="text-sm text-muted-foreground">
          Indoor conditions have not been measured. Outdoor data does not describe your indoor air;
          cooking, incense and dust often dominate indoors.
        </p>
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-display text-3xl font-semibold">{indoor.indoorPm25}</span> µg/m³{" "}
            <span className="text-muted-foreground">
              (your sensor reading — not converted to an AQI)
            </span>
          </p>
          {indoor.status === "comparable" && (
            <p>
              Outdoor PM2.5 at a comparable time: <strong>{indoor.outdoorPm25} µg/m³</strong> —
              indoor is{" "}
              {indoor.indoorHigher ? "higher, suggesting an indoor source" : "lower or equal"}.
            </p>
          )}
          {indoor.status === "not_comparable" && (
            <p className="text-muted-foreground">
              Timestamps are {indoor.gapMinutes} minutes apart (over 2 hours), so they are not
              directly comparable.
            </p>
          )}
          {indoor.status === "no_outdoor_pm25" && (
            <p className="text-muted-foreground">
              No outdoor PM2.5 concentration is available to compare against.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
