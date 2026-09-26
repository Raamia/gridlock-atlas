import example from "@/data/sponsor-example.json";
import type { Place, Project, Snapshot } from "@/lib/domain/types";
import { evaluatePair } from "@/lib/matching/engine";

/**
 * Re-runs the engine on the sponsor's worked example (Projects_Overlaps.xlsx: 5 DESC + 5 Georgia Power
 * projects with their coordinates and in-service dates) and compares against the sponsor's overlap table.
 */

interface SponsorProject {
  id: string;
  utility: string;
  name: string;
  a: { name: string | null; lat: number | null; lon: number | null };
  b: { name: string | null; lat: number | null; lon: number | null };
  inService: string | null;
}

function toProject(p: SponsorProject): Project {
  const places: Place[] = [p.a, p.b]
    .filter((x) => x.lat !== null && x.lon !== null)
    .map((x, i) => ({
      id: `${p.id}-${i}`,
      label: x.name ?? `${p.id} point ${i + 1}`,
      kind: "substation",
      precision: "named-facility",
      lat: x.lat!,
      lon: x.lon!,
      uncertaintyMeters: 0,
      coordinateSource: "sponsor starter file",
      evidenceIds: [],
      role: "endpoint",
    }));
  return {
    id: p.id,
    title: p.name,
    shortTitle: p.name,
    titleEvidenceIds: [],
    summary: "",
    owners: [{ utilityId: p.utility, evidenceIds: [] }],
    status: { value: "proposed", evidenceIds: [] },
    states: [],
    counties: [],
    facts: [],
    places,
    constructionWindows: [],
    completionClaims: p.inService ? [{ id: `${p.id}-isd`, claimSourceId: "sponsor", label: "in-service", date: { earliest: p.inService, latest: p.inService, precision: "day" }, evidenceIds: [] }] : [],
    knownCoordination: [],
    caveats: [],
    sourceIds: [],
    region: "sponsor",
  };
}

export interface SponsorCheckRow {
  id: string;
  pair: string;
  sponsorMiles: number;
  ourMiles: number | null;
  sponsorDays: number;
  ourDays: number | null;
  ok: boolean;
}

export function sponsorCheck(radius = 25): { rows: SponsorCheckRow[]; extra: string[]; allOk: boolean } {
  const projects = (example.projects as SponsorProject[]).map(toProject);
  const snap = { relations: [], sources: [], evidence: {} } as unknown as Snapshot;
  const found = new Map<string, { miles: number; days: number | null }>();
  const desc = projects.filter((p) => p.id.startsWith("DESC"));
  const gpc = projects.filter((p) => p.id.startsWith("GPC"));
  for (const a of desc) {
    for (const b of gpc) {
      const m = evaluatePair(a, b, snap, radius);
      const c = m?.geoDetail.center;
      if (m && c && c.miles < radius) found.set(`${a.id}|${b.id}`, { miles: c.miles, days: m.timeDetail.inService?.gapDays ?? null });
    }
  }
  const rows = example.overlaps.map((o) => {
    const f = found.get(`${o.a}|${o.b}`);
    const ourMiles = f ? Math.round(f.miles * 100) / 100 : null;
    return {
      id: o.id,
      pair: `${o.a} × ${o.b}`,
      sponsorMiles: o.distanceMi,
      ourMiles,
      sponsorDays: o.gapDays,
      ourDays: f?.days ?? null,
      ok: ourMiles !== null && Math.abs(ourMiles - o.distanceMi) <= 0.01 && f?.days === o.gapDays,
    };
  });
  const listed = new Set(example.overlaps.map((o) => `${o.a}|${o.b}`));
  const extra = [...found.keys()].filter((k) => !listed.has(k)).map((k) => k.replace("|", " × "));
  return { rows, extra, allOk: rows.every((r) => r.ok) && extra.length === 0 };
}
