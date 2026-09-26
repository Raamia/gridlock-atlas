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
import { activeWindows, evaluateTime } from "./time";

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

/** Source disagreements inside one project. Kept side by side; never silently resolved. */
export function projectConflicts(p: Project, sourceTitle: (id: string) => string): Conflict[] {
  const out: Conflict[] = [];
  const cc = p.completionClaims;
  for (let i = 0; i < cc.length; i++) {
    for (let j = i + 1; j < cc.length; j++) {
      if (!boundsIntersect(cc[i].date, cc[j].date)) {
        const versioned = cc[i].current === false || cc[j].current === false;
        const [now, then] = cc[j].current === false ? [cc[i], cc[j]] : [cc[j], cc[i]];
        out.push({
          id: `${p.id}:completion:${cc[i].id}:${cc[j].id}`,
          projectId: p.id,
          field: "completion",
          description: versioned
            ? `Schedule changed between plan editions: ${then.label.replace(/^.*\((.*)\)$/, "$1")} gave ${formatBound(then.date)}; the current edition gives ${formatBound(now.date)}.`
            : `${sourceTitle(cc[i].claimSourceId)} gives ${formatBound(cc[i].date)}; ${sourceTitle(cc[j].claimSourceId)} gives ${formatBound(cc[j].date)}.`,
          claimIds: [cc[i].id, cc[j].id],
          affectsMatch: false,
        });
      }
    }
  }
  const ws = activeWindows(p);
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      if (!boundsIntersect(ws[i].start, ws[j].start) || !boundsIntersect(ws[i].end, ws[j].end)) {
        out.push({
          id: `${p.id}:window:${ws[i].id}:${ws[j].id}`,
          projectId: p.id,
          field: "constructionWindow",
          description: `Construction windows disagree between ${sourceTitle(ws[i].claimSourceId)} and ${sourceTitle(ws[j].claimSourceId)}.`,
          claimIds: [ws[i].id, ws[j].id],
          affectsMatch: true,
        });
      }
    }
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
  const coordination = coordinationBetween(a, b, snapshot);
  const conflicts = [...projectConflicts(a, sourceTitle), ...projectConflicts(b, sourceTitle)];

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
