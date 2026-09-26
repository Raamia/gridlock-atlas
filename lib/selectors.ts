import type { Conflict, ConstructionWindow, Evidence, Match, MatchRun, Project, SourceDocument, Snapshot, Utility } from "@/lib/domain/types";
import { formatWindow, publicNote } from "@/lib/format";

export function indexSnapshot(s: Snapshot) {
  const projects = new Map(s.projects.map((p) => [p.id, p]));
  const utilities = new Map(s.utilities.map((u) => [u.id, u]));
  const sources = new Map(s.sources.map((d) => [d.id, d]));
  return {
    project: (id: string) => projects.get(id) as Project,
    utility: (id: string) => utilities.get(id) as Utility | undefined,
    source: (id: string) => sources.get(id) as SourceDocument | undefined,
    evidence: (id: string) => s.evidence[id] as Evidence | undefined,
    evidenceList: (ids: string[]) => ids.map((id) => s.evidence[id]).filter(Boolean) as Evidence[],
    allEvidence: () => s.evidence,
    relations: (ids: string[]) => s.relations.filter((r) => ids.includes(r.id)),
    snapshotDate: s.snapshotDate,
  };
}

export type SnapshotIndex = ReturnType<typeof indexSnapshot>;

export function ownerNames(p: Project, idx: SnapshotIndex, short = false): string {
  return p.owners
    .map((o) => {
      const u = idx.utility(o.utilityId);
      return u ? (short ? u.shortName : u.name) : o.utilityId;
    })
    .join(" · ");
}

/** Deep link to the cited page of a PDF, or the page itself for HTML. */
export function evidenceHref(e: Evidence, src?: SourceDocument): string | undefined {
  if (!src) return undefined;
  // only direct PDF links take a #page anchor; a docket landing page (e.g. Georgia PSC) does not
  if (src.mimeType === "application/pdf" && e.page && /\.pdf($|[?#])/i.test(src.url)) return `${src.url}#page=${e.page}`;
  return src.url;
}

export function pageLabel(e: Evidence): string | undefined {
  if (!e.page) return e.section;
  if (e.printedPage && e.printedPage !== String(e.page)) return `PDF p. ${e.page} (printed ${e.printedPage})`;
  return `p. ${e.page}`;
}

export function matchSourceIds(m: Match, idx: SnapshotIndex): string[] {
  const ids = new Set<string>();
  for (const id of m.evidenceIds) {
    const e = idx.evidence(id);
    if (e) ids.add(e.sourceId);
  }
  return [...ids];
}

/** One display group of windows (a timeline bar, an inspector row): one window as published, several as first start to last end. */
export function windowGroupText(ws: ConstructionWindow[]): string {
  if (ws.length === 1) return formatWindow(ws[0].start, ws[0].end, ws[0].openEnded, ws[0].openStart);
  const first = ws.reduce((x, y) => (y.start.earliest < x.start.earliest ? y : x));
  const last = ws.reduce((x, y) => (y.end.latest > x.end.latest ? y : x));
  return formatWindow(first.start, last.end, ws.some((w) => w.openEnded), first.openStart);
}

/** Source credit for one display group of windows: the window's own label when its bounds come from several documents, else the publisher. */
export function windowSourceText(ws: ConstructionWindow[], idx: SnapshotIndex): string {
  const labels = new Set(ws.map((w) => w.sourceLabel));
  if (labels.size === 1 && ws[0]?.sourceLabel) return ws[0].sourceLabel;
  return idx.source(ws[0].claimSourceId)?.publisher ?? ws[0].claimSourceId;
}

const SLUG = "[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}";
/**
 * A research note for readers (publicNote), with record ids put in words: a snapshot source or project id reads as its title,
 * and a cached page the snapshot does not cite drops out of its parenthetical ("(cached as desc-wagener-connection-page)").
 */
export function readableNote(t: string, idx: SnapshotIndex): string {
  const name = (id: string) => idx.source(id)?.title ?? idx.project(id)?.shortTitle;
  return publicNote(t)
    .replace(new RegExp(`\\s*\\((?:cached(?: as)? )?(${SLUG})\\)`, "g"), (_, id: string) => (name(id) ? ` (${name(id)})` : ""))
    .replace(new RegExp(`\\((?:cached(?: as)? )?(${SLUG})(?:,\\s*|\\s+(?=p\\.))`, "g"), (_, id: string) => (name(id) ? `(${name(id)}, ` : "("))
    .replace(new RegExp(`,\\s*cached(?: as)? (${SLUG})`, "g"), (_, id: string) => (name(id) ? `, ${name(id)}` : ""))
    .replace(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g, (id) => name(id) ?? id);
}

/** A conflict picked out by id, by its project, or by a source on any side (see `focusConflict` in the store). */
export function conflictMatches(c: Conflict, key: string): boolean {
  return c.id === key || c.projectId === key || c.sides.some((s) => s.sourceIds.includes(key));
}

/**
 * Pair totals for the region on screen. The API returns only run-wide exclusion counts, so a region's are
 * recounted here the way the engine forms pairs: eligible projects, same region, no shared owner.
 * `beyond` counts pairs left unflagged because their closest points are farther than the radius.
 * `viaFacility` is retained for the audit shape; a shared facility now has a zero-mile closest approach.
 */
export function regionPairCounts(run: MatchRun, projects: Project[], region: string) {
  const farViaFacility = (m: Match) =>
    (m.geoDetail.method === "shared-site" || m.geoDetail.method === "shared-endpoint") && (m.geoDetail.closest?.miles ?? 0) > run.thresholdMiles;
  if (region === "all") {
    return {
      evaluated: run.pairsEvaluated,
      beyond: run.excludedCounts["beyond-radius"] + run.excludedCounts["no-signal"],
      unlocated: run.excludedCounts["location-unknown"],
      viaFacility: run.matches.filter(farViaFacility).length,
    };
  }
  const archived = new Set(run.excludedProjects.map((x) => x.projectId));
  const flagged = new Map(run.matches.map((m) => [m.id, m]));
  const ps = projects.filter((p) => p.region === region && !archived.has(p.id));
  const located = (p: Project) => p.places.some((pl) => pl.precision !== "unknown");
  let evaluated = 0;
  let matched = 0;
  let unlocated = 0;
  let viaFacility = 0;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const [a, b] = [ps[i], ps[j]];
      if (a.owners.some((o) => b.owners.some((x) => x.utilityId === o.utilityId))) continue;
      evaluated++;
      const m = flagged.get(`${a.id}__${b.id}`) ?? flagged.get(`${b.id}__${a.id}`);
      if (m) {
        matched++;
        if (farViaFacility(m)) viaFacility++;
      } else if (!located(a) || !located(b)) unlocated++;
    }
  }
  return { evaluated, beyond: evaluated - matched - unlocated, unlocated, viaFacility };
}
