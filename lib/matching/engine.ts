import type {
  Conflict,
  DateBound,
  ExcludedPair,
  ExcludedProject,
  Match,
  MatchCoordination,
  MatchRun,
  Project,
  Snapshot,
} from "@/lib/domain/types";
import { formatBound } from "@/lib/format";
import { DEFAULT_THRESHOLD_MILES, evaluateGeo } from "./geo";
import { activeWindows, evaluateTime, windowsBySource } from "./time";

export const ENGINE_VERSION = "gridlock-engine/1.1.0";

const ELIGIBLE = new Set(["proposed", "approved", "construction"]);

export interface RunOptions {
  thresholdMiles?: number;
  /** ISO timestamp; injected so runs are reproducible in tests. */
  now?: string;
  /** List every excluded pair (tests, audits). Default: only shared-owner pairs are listed; the rest are counted. */
  listExclusions?: boolean;
}

function ownerIds(p: Project): Set<string> {
  return new Set(p.owners.map((o) => o.utilityId));
}

function boundsIntersect(x: DateBound, y: DateBound): boolean {
  return x.earliest <= y.latest && y.earliest <= x.latest;
}

const IN_SERVICE_LABEL = /in-service|in service|need date|completion|complete|energiz|operation/i;

interface Dated {
  id: string;
  sourceId: string;
  start: DateBound;
  end: DateBound;
  earlier: boolean;
}

/** Group claims whose dates agree (intersect); two or more groups = one disagreement. */
function cluster(items: Dated[]): Dated[][] {
  const groups: { items: Dated[]; start: DateBound; end: DateBound }[] = [];
  for (const it of items) {
    const g = groups.find((x) => boundsIntersect(x.start, it.start) && boundsIntersect(x.end, it.end));
    if (g) g.items.push(it);
    else groups.push({ items: [it], start: it.start, end: it.end });
  }
  return groups.map((g) => g.items);
}

/**
 * Source disagreements inside one project, kept side by side and never silently resolved.
 * Several windows or dates from ONE source are components of the work, not competing claims;
 * sources that agree are grouped, so each disagreement is reported once with who says what.
 */
export function projectConflicts(p: Project, sourceTitle: (id: string) => string, sourceDoc: (id: string) => string = sourceTitle): Conflict[] {
  const out: Conflict[] = [];
  const describe = (groups: Dated[][], fmt: (d: Dated) => string) => {
    // when one publisher appears on more than one side, name the documents instead
    const sidesOf = (pub: string) => groups.filter((g) => g.some((x) => sourceTitle(x.sourceId) === pub)).length;
    const label = (id: string) => (sidesOf(sourceTitle(id)) > 1 ? sourceDoc(id) : sourceTitle(id));
    return groups
      .map((g) => `${[...new Set(g.map((x) => label(x.sourceId)))].join(", ")}${g.every((x) => x.earlier) ? " (earlier edition)" : ""}: ${fmt(g[0])}`)
      .join(" · ");
  };

  // completion / in-service: one representative claim per source (its latest-listed date)
  const perSource = new Map<string, Dated>();
  for (const c of p.completionClaims.filter((c) => IN_SERVICE_LABEL.test(c.label))) {
    if (!perSource.has(c.claimSourceId)) perSource.set(c.claimSourceId, { id: c.id, sourceId: c.claimSourceId, start: c.date, end: c.date, earlier: c.current === false });
  }
  const cGroups = cluster([...perSource.values()]);
  if (cGroups.length > 1) {
    const versionOnly = cGroups.filter((g) => !g.every((x) => x.earlier)).length === 1;
    out.push({
      id: `${p.id}:completion`,
      projectId: p.id,
      field: "completion",
      description: (versionOnly ? "Schedule changed between plan editions — " : "Sources give different completion / in-service dates — ") + describe(cGroups, (d) => formatBound(d.start)),
      sides: cGroups.map((g) => ({ value: formatBound(g[0].start), sourceIds: g.map((x) => x.sourceId), claimIds: g.map((x) => x.id), earlier: g.every((x) => x.earlier) })),
      claimIds: cGroups.flat().map((x) => x.id),
      affectsMatch: false,
    });
  }

  // construction windows: one envelope per source
  const envs: Dated[] = windowsBySource(p).map((ws) => ({
    id: ws[0].id,
    sourceId: ws[0].claimSourceId,
    start: { earliest: ws.map((w) => w.start.earliest).sort()[0], latest: ws.map((w) => w.start.latest).sort()[0], precision: ws[0].start.precision },
    end: { earliest: ws.map((w) => w.end.earliest).sort().at(-1)!, latest: ws.map((w) => w.end.latest).sort().at(-1)!, precision: ws.at(-1)!.end.precision },
    earlier: false,
  }));
  const wGroups = cluster(envs);
  if (wGroups.length > 1) {
    const fmt = (d: Dated) => `${formatBound(d.start).split("–")[0]}–${formatBound(d.end).split("–").at(-1)}`;
    out.push({
      id: `${p.id}:window`,
      projectId: p.id,
      field: "constructionWindow",
      description: "Sources give different construction windows — " + describe(wGroups, fmt),
      sides: wGroups.map((g) => ({ value: fmt(g[0]), sourceIds: g.map((x) => x.sourceId), claimIds: windowsBySource(p).filter((ws) => g.some((x) => x.sourceId === ws[0].claimSourceId)).flat().map((w) => w.id) })),
      claimIds: wGroups.flat().map((x) => x.id),
      affectsMatch: true,
    });
  }
  return out;
}

function coordinationBetween(a: Project, b: Project, snapshot: Snapshot): MatchCoordination[] {
  const out: MatchCoordination[] = [];
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const c of from.knownCoordination) {
      if (c.partnerProjectId === to.id && (c.status === "known-joint" || c.status === "reported-coordination")) {
        out.push({ status: c.status, scope: c.scope, description: c.description, evidenceIds: c.evidenceIds, fromProjectId: from.id });
      }
    }
  }
  for (const r of snapshot.relations) {
    const pair = (r.projectA === a.id && r.projectB === b.id) || (r.projectA === b.id && r.projectB === a.id);
    if (pair && r.kind === "same-initiative" && !out.some((c) => c.scope === "joint-initiative")) {
      out.push({ status: "known-joint", scope: "joint-initiative", description: r.description, evidenceIds: r.evidenceIds, fromProjectId: r.projectA });
    }
  }
  return out;
}

function exclusionFor(p: Project, snapshotDate: string): ExcludedProject | null {
  if (p.duplicateOf) {
    return { projectId: p.id, reason: "duplicate", detail: `Repeated mention of ${p.duplicateOf}; merged before pairing.` };
  }
  if (p.status.value === "complete") return { projectId: p.id, reason: "complete", detail: "Completed work is archived as a negative example." };
  if (p.status.value === "cancelled") return { projectId: p.id, reason: "cancelled", detail: "Cancelled plans are archived." };
  if (!ELIGIBLE.has(p.status.value)) return { projectId: p.id, reason: "unknown-status", detail: "Status not established in sources." };
  const ws = activeWindows(p);
  if (ws.length && ws.every((w) => w.end.latest < snapshotDate)) {
    return { projectId: p.id, reason: "complete", detail: "Every published construction window ended before the snapshot date." };
  }
  return null;
}

/** Deterministic A/B ordering so colors stay stable: alphabetical by project id. */
function ordered(x: Project, y: Project): [Project, Project] {
  return x.id < y.id ? [x, y] : [y, x];
}

/** Days over which an in-service gap still earns ranking credit (secondary signal). */
export const IN_SERVICE_HORIZON_DAYS = 1460;

export function evaluatePair(a: Project, b: Project, snapshot: Snapshot, thresholdMiles = DEFAULT_THRESHOLD_MILES): Match | null {
  const geo = evaluateGeo(a, b, snapshot.relations, thresholdMiles);
  // Sponsor rule: geography is the primary signal — farther than the radius, the pair is ignored.
  if (geo.level !== "confirmed" && geo.level !== "possible") return null;
  const time = evaluateTime(a, b);

  const sourceTitle = (id: string) => snapshot.sources.find((s) => s.id === id)?.publisher ?? id;
  const sourceDoc = (id: string) => snapshot.sources.find((s) => s.id === id)?.title ?? id;
  const coordination = coordinationBetween(a, b, snapshot);
  const conflicts = [...projectConflicts(a, sourceTitle, sourceDoc), ...projectConflicts(b, sourceTitle, sourceDoc)];

  const badge: Match["badge"] =
    geo.level === "confirmed" && time.level === "confirmed" ? "BOTH" : geo.level === "confirmed" ? "GEO" : "POSSIBLE";

  const reviewStatus: Match["reviewStatus"] = coordination.length ? "known-coordination" : geo.level === "confirmed" ? "needs-review" : "possible";

  const sameSite = geo.detail.method === "shared-site" || geo.detail.method === "shared-endpoint";
  const d = geo.detail.center?.miles;
  const relevance: Match["relevance"] =
    geo.level !== "confirmed" ? "low" : sameSite || (d !== undefined && d <= 10) ? "high" : "medium";

  // explainable review priority — an ordering, not a probability or a dollar value
  const reasons: string[] = [];
  let priority = 0;
  const add = (points: number, reason: string) => {
    priority += Math.round(points);
    reasons.push(reason);
  };
  if (sameSite) add(60, geo.detail.method === "shared-site" ? "Shared facility stated in a source" : "Terminals at the same facility");
  else if (geo.level === "confirmed" && d !== undefined) add(30 + 30 * Math.max(0, 1 - d / thresholdMiles), `Centers ≈${d < 10 ? d.toFixed(1) : Math.round(d)} mi apart`);
  else if (geo.level === "confirmed") add(30, "Within the review radius");
  else add(12, "Proximity possible (coarse location)");

  const gap = time.detail.inService?.gapDays;
  if (time.level === "confirmed") add(30, "Construction windows overlap");
  else if (time.level === "possible") add(18, "Construction windows may overlap");
  else if (gap !== undefined && gap < IN_SERVICE_HORIZON_DAYS) add(25 * (1 - gap / IN_SERVICE_HORIZON_DAYS), `In-service dates ${gap.toLocaleString("en-US")} days apart`);
  else if (gap !== undefined) reasons.push(`In-service dates ${gap.toLocaleString("en-US")} days apart`);

  const evidenceIds = new Set<string>();
  for (const r of snapshot.relations.filter((r) => geo.detail.relationIds.includes(r.id))) r.evidenceIds.forEach((e) => evidenceIds.add(e));
  for (const p of [a, b]) {
    for (const w of activeWindows(p)) w.evidenceIds.forEach((e) => evidenceIds.add(e));
    const c = p.completionClaims[0];
    c?.evidenceIds.forEach((e) => evidenceIds.add(e));
  }
  for (const c of coordination) c.evidenceIds.forEach((e) => evidenceIds.add(e));
  const evs = [...evidenceIds].map((id) => snapshot.evidence[id]).filter(Boolean);
  const completeness = evs.length ? evs.filter((e) => e.verifiedInSource).length / evs.length : 0;
  priority += Math.round(completeness * 10);
  if (completeness === 1 && evs.length) reasons.push("Every cited excerpt located verbatim in its source");
  if (geo.detail.center?.lowConfidence) {
    priority -= 5;
    reasons.push("A location is approximate or lower-confidence");
  }
  if (coordination.length) reasons.push("Documented coordination on record");
  if (conflicts.length) reasons.push(`${conflicts.length} source conflict${conflicts.length > 1 ? "s" : ""} preserved`);

  return {
    id: `${a.id}__${b.id}`,
    projectAId: a.id,
    projectBId: b.id,
    geo: geo.level,
    time: time.level,
    geoReason: geo.reason,
    timeReason: time.reason,
    geoDetail: geo.detail,
    timeDetail: time.detail,
    badge,
    reviewStatus,
    coordination,
    conflicts,
    relevance,
    priority,
    priorityReasons: reasons,
    evidenceIds: [...evidenceIds],
    engineVersion: ENGINE_VERSION,
  };
}

export function runMatching(snapshot: Snapshot, opts: RunOptions = {}): MatchRun {
  const thresholdMiles = opts.thresholdMiles ?? DEFAULT_THRESHOLD_MILES;
  const excludedProjects: ExcludedProject[] = [];
  const eligible: Project[] = [];
  for (const p of snapshot.projects) {
    const ex = exclusionFor(p, snapshot.snapshotDate);
    if (ex) excludedProjects.push(ex);
    else eligible.push(p);
  }

  const matches: Match[] = [];
  const excludedPairs: ExcludedPair[] = [];
  const excludedCounts: MatchRun["excludedCounts"] = { "shared-owner": 0, "no-signal": 0, "beyond-radius": 0, "different-region": 0 };
  const exclude = (x: ExcludedPair) => {
    excludedCounts[x.reason]++;
    if (x.reason === "shared-owner" || opts.listExclusions !== false) excludedPairs.push(x);
  };
  let pairsEvaluated = 0;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const [a, b] = ordered(eligible[i], eligible[j]);
      const oa = ownerIds(a);
      const shared = [...ownerIds(b)].filter((u) => oa.has(u));
      if (shared.length) {
        exclude({
          projectAId: a.id,
          projectBId: b.id,
          reason: "shared-owner",
          detail: `Shared owner (${shared.join(", ")}): internal context, not a cross-utility lead.`,
        });
        continue;
      }
      if (a.region !== b.region) {
        exclude({ projectAId: a.id, projectBId: b.id, reason: "different-region", detail: "Pairs are generated within a region." });
        continue;
      }
      pairsEvaluated++;
      const m = evaluatePair(a, b, snapshot, thresholdMiles);
      if (m) matches.push(m);
      else {
        const t = evaluateTime(a, b);
        exclude(
          t.level === "confirmed" || t.level === "possible"
            ? { projectAId: a.id, projectBId: b.id, reason: "beyond-radius", detail: `Same build window, but farther than ${thresholdMiles} mi — ignored by the distance rule.` }
            : { projectAId: a.id, projectBId: b.id, reason: "no-signal", detail: `Farther than ${thresholdMiles} mi.` },
        );
      }
    }
  }

  matches.sort((x, y) => y.priority - x.priority || x.id.localeCompare(y.id));

  return {
    engineVersion: ENGINE_VERSION,
    snapshotVersion: snapshot.version,
    snapshotDate: snapshot.snapshotDate,
    thresholdMiles,
    ranAt: opts.now ?? new Date().toISOString(),
    projectsConsidered: eligible.length,
    pairsEvaluated,
    matches,
    excludedProjects,
    excludedPairs,
    excludedCounts,
  };
}
