import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CITY_PRESETS } from "@/domain/catalogues";
import { GeocodeQuerySchema, type ResolvedLocation } from "@/types/airQuality";
import { searchLocations } from "@/lib/api";

type Props = {
  selected: ResolvedLocation | null;
  onConfirm: (l: ResolvedLocation) => void;
  search?: typeof searchLocations;
};

/** City presets plus custom Indian geocoding with explicit user confirmation. */
export function LocationSelector({ selected, onConfirm, search = searchLocations }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ResolvedLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = GeocodeQuerySchema.safeParse(q);
    if (!v.success) {
      setError(v.error.issues[0]?.message ?? "Invalid query");
      setResults(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await search(v.data);
      setResults(r);
      if (r.length === 0) setError("Location Not Found in India");
    } catch {
      setResults(null);
      setError("Location Not Found in India — the location service could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="loc-h" className="card-surface p-5 space-y-4">
      <h2 id="loc-h" className="text-xl font-semibold">
        Location
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick-select cities">
        {CITY_PRESETS.map((c) => (
          <Button
            key={c.name}
            type="button"
            size="sm"
            variant={selected?.name === c.name ? "default" : "outline"}
            aria-pressed={selected?.name === c.name}
            onClick={() => onConfirm(c)}
          >
            {c.name}
          </Button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="loc-q">Search another Indian city or town</Label>
        <div className="flex gap-2">
          <Input
            id="loc-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Lucknow"
            maxLength={80}
          />
          <Button type="submit" disabled={busy}>
            <Search className="h-4 w-4" aria-hidden />
            {busy ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {results && results.length > 0 && (
          <ul className="space-y-2" aria-label="Matching locations">
            {results.map((r) => (
              <li
                key={`${r.coordinates.lat},${r.coordinates.lon}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="text-sm">
                  <p className="font-semibold">
                    {r.name}
                    {r.admin ? `, ${r.admin}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {r.coordinates.lat.toFixed(4)}°N, {r.coordinates.lon.toFixed(4)}°E
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onConfirm(r);
                    setResults(null);
                    setQ("");
                  }}
                >
                  Confirm {r.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden />
          Selected:{" "}
          <strong className="text-foreground">
            {selected.name}
            {selected.admin ? `, ${selected.admin}` : ""}
          </strong>
        </p>
      )}
    </section>
  );
}
