import distance from "@turf/distance";
import { point } from "@turf/helpers";
import example from "@/data/sponsor-example.json";
import type { Match, MatchRun, Place, Project, Relation, ReviewStatus, Snapshot } from "@/lib/domain/types";
import { displayTitle } from "@/lib/format";
import { evaluatePair } from "@/lib/matching/engine";
import { centerOf, SAME_SITE_MILES } from "@/lib/matching/geo";

/**
 * Sperry's worked example (Projects_Overlaps.xlsx: 5 DESC + 5 Georgia Power projects with their coordinates and
 * in-service dates), the sponsor's distance rule, and what became of the example's six overlap rows in today's plans.
 */

/** Sperry's distance rule, literally: "Any pair under 25 miles apart", project center to project center. */
export const SPONSOR_RADIUS_MILES = 25;

export const withinSponsorRule = (m: Match) => !!m.geoDetail.center && m.geoDetail.center.miles < SPONSOR_RADIUS_MILES;

/** The rows of the sponsor's overlap table: pairs inside the rule, closest first (OVL_1 is the closest, as in the starter file). */
export function sponsorRows(matches: Match[]): Match[] {
  return matches.filter(withinSponsorRule).sort((x, y) => x.geoDetail.center!.miles - y.geoDetail.center!.miles || x.id.localeCompare(y.id));
}

/** Why a flagged pair is outside the sponsor's rule; null when it is inside. */
export function beyondRuleReason(m: Match, relations: Relation[]): string | null {
  if (withinSponsorRule(m)) return null;
  const c = m.geoDetail.center;
  const apart = c ? `centers ${c.miles.toFixed(1)} mi apart` : "no project center";
  if (m.geoDetail.method === "shared-site") {
    const stated = relations.some((r) => m.geoDetail.relationIds.includes(r.id) && r.basis !== "inferred");
    return `${stated ? "shared facility stated in a source" : "shared facility implied by several sources"} (${apart})`;
  }
  if (m.geoDetail.method === "shared-endpoint") return `terminals geocoded to the same facility (${apart})`;
  if (!c) return "county-level location only (no project center)";
  if (m.geo === "possible") return `location uncertainty: ${apart}, near edge ${c.lowMiles.toFixed(1)} mi`;
  return `flagged at the ${m.geoDetail.thresholdMiles} mi review radius (${apart})`;
}

/** Per project, its sponsor-table partners in OVL order (the starter file's overlap_1..n), with the OVL id of each row. */
export function sponsorOverlaps(matches: Match[]): Map<string, { partner: string; overlapId: string }[]> {
  const out = new Map<string, { partner: string; overlapId: string }[]>();
  sponsorRows(matches).forEach((m, i) => {
    for (const [p, partner] of [
      [m.projectAId, m.projectBId],
      [m.projectBId, m.projectAId],
    ]) {
      if (!out.has(p)) out.set(p, []);
      out.get(p)!.push({ partner, overlapId: `OVL_${i + 1}` });
    }
  });
  return out;
}

/* ------------------------------ the starter file ------------------------------ */

interface SponsorPoint {
  name: string | null;
  lat: number | null;
  lon: number | null;
}
interface SponsorProject {
  id: string;
  utility: string;
  state: string;
  name: string;
  a: SponsorPoint;
  b: SponsorPoint;
  inService: string | null;
  sheet: { center: number[]; overlaps: string[] };
}
export const STARTER = example.projects as SponsorProject[];

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
    states: [p.state],
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

const NO_SOURCES = { relations: [], sources: [], evidence: {} } as unknown as Snapshot;

/** The starter file's ten projects as engine projects, and every DESC × Georgia Power pair the engine flags among them. */
export function sponsorStarter(radius = SPONSOR_RADIUS_MILES): { projects: Project[]; matches: Match[] } {
  const projects = STARTER.map(toProject);
  const matches: Match[] = [];
  for (const a of projects.filter((p) => p.id.startsWith("DESC")))
    for (const b of projects.filter((p) => p.id.startsWith("GPC"))) {
      const m = evaluatePair(a, b, NO_SOURCES, radius);
      if (m) matches.push(m);
    }
  return { projects, matches };
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

/** Re-runs the engine on the starter file and compares against the sponsor's overlap table. */
export function sponsorCheck(radius = SPONSOR_RADIUS_MILES): { rows: SponsorCheckRow[]; extra: string[]; allOk: boolean } {
  const found = new Map(
    sponsorStarter(radius)
      .matches.filter((m) => m.geoDetail.center && m.geoDetail.center.miles < radius)
      .map((m) => [`${m.projectAId}|${m.projectBId}`, { miles: m.geoDetail.center!.miles, days: m.timeDetail.inService?.gapDays ?? null }]),
  );
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

/** The starter file's "projects" sheet recomputed: center (its IF(ISBLANK…) midpoint formula), overlap_count and overlap_1..n in order. */
export function sponsorSheetCheck(): { id: string; ok: boolean }[] {
  const { projects, matches } = sponsorStarter();
  const overlaps = sponsorOverlaps(matches);
  return STARTER.map((s, i) => {
    const c = centerOf(projects[i]);
    const partners = (overlaps.get(s.id) ?? []).map((o) => o.partner);
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
    return { id: s.id, ok: !!c && near(c.lonlat[1], s.sheet.center[0]) && near(c.lonlat[0], s.sheet.center[1]) && partners.join() === s.sheet.overlaps.join() };
  });
}

/* ------------------------- the six rows in today's plans ------------------------- */

export interface Cite {
  sourceId: string;
  page?: number;
  excerpt: string;
  supports?: string;
}

/** Cited context the challenge names (Order 1920, SCRTP → SERTP, newest-source check, CEII) and facility-name notes, by topic. */
export const CONTEXT = example.context as (Cite & { topic: string })[];
/** Metadata of cited context documents that no project cites (so they are not in the snapshot's source registry). */
export const CONTEXT_SOURCES = example.sources as Record<string, { publisher: string; title: string; url: string; publishedAt: string | null; retrievedAt: string; sha256: string; mimeType: string; pageCount: number | null }>;
/** Text searches and link checks over cached documents: results, not quotes. */
export const SEARCHES = example.searches as { sourceId: string; term?: string; hits?: number; link?: string; supports: string }[];
/** Challenge-packet files that are byte-identical (SHA-256) to a cached source. */
export const PACKET = example.packet as { file: string; sourceId: string; sha256: string; label: string }[];

export interface NotListed {
  planId: string;
  lastListed: Cite;
  /** Later editions whose cached text has no such Project ID (a text search, not a quote). */
  absentFrom: string[];
}

export interface ReplaySide {
  sponsorId: string;
  name: string;
  projectId?: string;
  notListed?: NotListed;
}

export interface ReplayRow {
  id: string;
  a: ReplaySide;
  b: ReplaySide;
  sponsorMiles: number;
  sponsorDays: number;
  /** in-queue: flagged in today's run · hidden: both projects are listed but the pair is not in the queue · not-listed: a side is no longer in the current plan */
  status: "in-queue" | "hidden" | "not-listed" | "not-run";
  matchId?: string;
  tab?: ReviewStatus;
  rank?: number;
  withinRule?: boolean;
  /** Today's numbers on current plan data (also for a hidden pair). */
  miles?: number;
  days?: number;
  daysAtLeast?: boolean;
  reasons?: string[];
  /** In the queue although a planned in-service date has passed without a source confirming completion. */
  pastDue?: string[];
  related?: { pair: string[]; evidence: Cite[]; matchId?: string; tab?: ReviewStatus; rank?: number; miles?: number };
}

const TODAY = example.today as Record<string, { projectId?: string; notListed?: NotListed }>;
const RELATED = example.related as Record<string, { pair: string[]; evidence: Cite[] }>;

/** Rank of a flagged pair in its queue tab (no filters), within its region: the number on its queue card. */
function queueRank(run: MatchRun, m: Match, regionOf: (id: string) => string | undefined): number {
  const r = regionOf(m.projectAId);
  return run.matches.filter((x) => x.reviewStatus === m.reviewStatus && regionOf(x.projectAId) === r).indexOf(m) + 1;
}

export function sponsorReplay(run: MatchRun | null, snapshot: Snapshot): ReplayRow[] {
  const byId = new Map(snapshot.projects.map((p) => [p.id, p]));
  const regionOf = (id: string) => byId.get(id)?.region;
  const find = (a: string, b: string) => run?.matches.find((m) => (m.projectAId === a && m.projectBId === b) || (m.projectAId === b && m.projectBId === a));
  const side = (id: string): ReplaySide => {
    const t = TODAY[id] ?? {};
    return { sponsorId: id, name: STARTER.find((p) => p.id === id)!.name, projectId: t.projectId && byId.has(t.projectId) ? t.projectId : undefined, notListed: t.notListed };
  };
  return example.overlaps.map((o) => {
    const [a, b] = [side(o.a), side(o.b)];
    const row: ReplayRow = { id: o.id, a, b, sponsorMiles: o.distanceMi, sponsorDays: o.gapDays, status: "not-run" };
    const rel = RELATED[o.id];
    if (rel) {
      const m = find(rel.pair[0], rel.pair[1]);
      row.related = { ...rel, matchId: m?.id, tab: m?.reviewStatus, rank: m && run ? queueRank(run, m, regionOf) : undefined, miles: m?.geoDetail.center?.miles };
    }
    if (!a.projectId || !b.projectId) return { ...row, status: a.notListed || b.notListed ? "not-listed" : "not-run" };
    const [pa, pb] = [byId.get(a.projectId)!, byId.get(b.projectId)!];
    // today's numbers, whatever the radius or eligibility
    const probe = evaluatePair(pa, pb, snapshot, 1e6);
    const ip = probe?.timeDetail.inService;
    Object.assign(row, { miles: probe?.geoDetail.center?.miles, days: ip?.gapDays, daysAtLeast: ip?.coarse });
    if (!run) return row;
    const m = find(pa.id, pb.id);
    const due = m?.pastDue?.map((x) => `${displayTitle(byId.get(x.projectId)!)}: ${x.detail}`);
    if (m) return { ...row, status: "in-queue", matchId: m.id, tab: m.reviewStatus, rank: queueRank(run, m, regionOf), withinRule: withinSponsorRule(m), ...(due?.length ? { pastDue: due } : {}) };
    const excluded = run.excludedProjects.filter((x) => x.projectId === pa.id || x.projectId === pb.id);
    const reasons = excluded.length
      ? excluded.map((x) => `${displayTitle(byId.get(x.projectId)!)}: ${x.detail}`)
      : [`Not flagged at the ${run.thresholdMiles} mi review radius.`];
    return { ...row, status: "hidden", reasons };
  });
}

/* --------------------- the guide's location workflow, measured --------------------- */

/** A facility name without the words that vary between documents ("Sub", "Substation", "(SAV)", "St."). */
export const facilityKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(substation|sub|switching station|line terminal)\b/g, " ")
    .replace(/\bft\b/g, "fort")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const miles = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distance(point([a.lon, a.lat]), point([b.lon, b.lat]), { units: "miles" });

/** The points behind each project center (the guide's "sub-points"), by how they were confirmed against the plan text. */
export function terminalCounts(projects: Project[]) {
  const n = { confirmed: 0, lowerConfidence: 0, townLevel: 0 };
  for (const p of projects)
    for (const pl of centerOf(p)?.places ?? []) {
      if (pl.precision === "locality") n.townLevel++;
      else if (pl.confidence === "lower-confidence") n.lowerConfidence++;
      else n.confirmed++;
    }
  return n;
}

/** The starter file's sub-points that have no coordinates, and where today's snapshot locates a facility of that name. */
export function starterBlanks(projects: Project[]) {
  const blanks = new Map<string, { name: string; sponsorIds: string[] }>();
  for (const p of STARTER)
    for (const x of [p.a, p.b])
      if (x.name && x.lat === null) {
        const k = facilityKey(x.name);
        if (!blanks.has(k)) blanks.set(k, { name: x.name, sponsorIds: [] });
        blanks.get(k)!.sponsorIds.push(p.id);
      }
  return [...blanks].map(([k, b]) => {
    const hit = projects.flatMap((p) => p.places.filter((pl) => pl.precision === "named-facility" && facilityKey(pl.label) === k).map((pl) => ({ projectId: p.id, place: pl })))[0];
    return { ...b, found: hit && { projectId: hit.projectId, label: hit.place.label, lowerConfidence: hit.place.confidence === "lower-confidence" } };
  });
}

/**
 * Audit: one facility name, one location. Named facilities are grouped by name; a group whose points lie farther apart than
 * the engine's same-site tolerance is listed (two different facilities share a name, or one was geocoded twice).
 */
export function facilityNameSpread(projects: Project[], toleranceMiles = SAME_SITE_MILES) {
  const groups = new Map<string, { projectId: string; place: Place }[]>();
  for (const p of projects)
    for (const pl of p.places.filter((pl) => pl.precision === "named-facility")) {
      const k = facilityKey(pl.label);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ projectId: p.id, place: pl });
    }
  const spread = [...groups]
    .map(([key, g]) => ({ key, points: g, miles: Math.max(...g.flatMap((x) => g.map((y) => miles(x.place, y.place)))) }))
    .filter((x) => x.miles > toleranceMiles);
  return { names: groups.size, toleranceMiles, spread };
}

/** Sub-points the starter file names alike but places at different coordinates (e.g. McIntosh in GPC_2 and GPC_3). */
export function starterNameSpread() {
  const pts = STARTER.flatMap((p) => [p.a, p.b].filter((x) => x.name && x.lat !== null).map((x) => ({ id: p.id, name: x.name!, lat: x.lat!, lon: x.lon! })));
  const out: { name: string; ids: string[]; miles: number }[] = [];
  for (const k of new Set(pts.map((x) => facilityKey(x.name)))) {
    const g = pts.filter((x) => facilityKey(x.name) === k);
    const d = Math.max(...g.flatMap((x) => g.map((y) => miles(x, y))));
    if (d > 0) out.push({ name: g[0].name, ids: g.map((x) => x.id), miles: d });
  }
  return out;
}
