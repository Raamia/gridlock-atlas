import type {
  Conflict,
  DateBound,
  ExcludedPair,
  ExcludedProject,
  Match,
  MatchCoordination,
  MatchRun,
  PastDueProject,
  Project,
  Snapshot,
} from "@/lib/domain/types";
import { displayTitle, formatBound } from "@/lib/format";
import { DEFAULT_THRESHOLD_MILES, evaluateGeo } from "./geo";
import { activeWindows, currentInService, dayCount, DEADLINE, endsWindow, evaluateTime, scheduleWindows, windowsBySource } from "./time";

export const ENGINE_VERSION = "gridlock-engine/1.3.0";

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
  /** The start year is not published (only a floor), so it is never shown. */
  openStart?: boolean;
}

/** Group claims whose dates agree (intersect); two or more groups = one disagreement. */
function cluster(items: Dated[]): Dated[][] {
  // a claim joins a group only if it agrees with EVERY member (agreement is not transitive for ranges)
  const groups: Dated[][] = [];
  for (const it of items) {
    const g = groups.find((members) => members.every((x) => boundsIntersect(x.start, it.start) && boundsIntersect(x.end, it.end)));
    if (g) g.push(it);
    else groups.push([it]);
  }
  return groups;
}

const span = (b: DateBound) => Date.parse(b.latest) - Date.parse(b.earliest);

/**
 * Put the member that best states what its group agrees on first: a current claim over an earlier edition,
 * then the most precise (narrowest) bound, then the later date. Never the first-listed blindly — a coarse
 * "2028" would hide the "Sep 2028" that actually differs from the other side.
 */
function lead<T extends Dated>(g: T[]): T[] {
  const r = [...g].sort(
    (x, y) => Number(x.earlier) - Number(y.earlier) || span(x.start) + span(x.end) - (span(y.start) + span(y.end)) || y.start.earliest.localeCompare(x.start.earliest),
  )[0];
  return [r, ...g.filter((x) => x !== r)];
}

/**
 * Source disagreements inside one project, kept side by side and never silently resolved.
 * Several windows or dates from ONE source are components of the work, not competing claims;
 * sources that agree are grouped, so each disagreement is reported once with who says what.
 */
export function projectConflicts(
  p: Project,
  sourceTitle: (id: string) => string,
  sourceDoc: (id: string) => string = sourceTitle,
  sourceDate: (id: string) => string | undefined = () => undefined,
): Conflict[] {
  const out: Conflict[] = [];
  // groups are led by their representative (lead): g[0] is the value shown, and only members stating exactly that value are named
  const stating = <T extends Dated>(g: T[], fmt: (d: Dated) => string) => g.filter((x) => fmt(x) === fmt(g[0]));
  const describe = (groups: Dated[][], fmt: (d: Dated) => string) => {
    // when one publisher appears on more than one side, name the documents instead
    const sidesOf = (pub: string) => groups.filter((g) => g.some((x) => sourceTitle(x.sourceId) === pub)).length;
    const label = (id: string) => (sidesOf(sourceTitle(id)) > 1 ? sourceDoc(id) : sourceTitle(id));
    return groups
      .map((g) => `${[...new Set(stating(g, fmt).map((x) => label(x.sourceId)))].join(", ")}${g.every((x) => x.earlier) ? " (earlier edition)" : ""}: ${fmt(g[0])}`)
      .join(" · ");
  };

  // completion / in-service: one representative claim per source (its latest-listed date); a required-by deadline is not a forecast date
  const perSource = new Map<string, Dated & { label: string }>();
  for (const c of p.completionClaims.filter((c) => IN_SERVICE_LABEL.test(c.label) && !DEADLINE.test(c.label))) {
    if (!perSource.has(c.claimSourceId))
      perSource.set(c.claimSourceId, { id: c.id, sourceId: c.claimSourceId, start: c.date, end: c.date, earlier: c.current === false, label: c.label });
  }
  const cGroups = cluster([...perSource.values()]).map(lead);
  if (cGroups.length > 1) {
    const versionOnly = cGroups.filter((g) => !g.every((x) => x.earlier)).length === 1 && cGroups.flat().some((x) => x.earlier);
    // "plan editions" only when one publisher revised its own list; otherwise a later source superseded an earlier one
    const onePublisher = new Set(cGroups.flat().map((x) => sourceTitle(x.sourceId))).size === 1;
    // edition names read best: "2024–2028 list: Dec 31, 2025 → current edition: Dec 1, 2026"
    const edition = (x: Dated & { label?: string }) => x.label?.match(/\(([^)]*\b(?:19|20)\d\d\b[^)]*)\)\s*$/)?.[1];
    const name = (x: Dated & { label?: string }) => (x.earlier || !onePublisher ? (edition(x) ?? sourceDoc(x.sourceId)) : "current edition");
    const names = (g: (typeof cGroups)[number]) =>
      [...new Set(stating(g, (d) => formatBound(d.start)).sort((x, y) => (edition(x) ?? "").localeCompare(edition(y) ?? "")).map(name))];
    // a group's document date: its newest member's; groups without dates fall back to their edition names
    const dated = (g: (typeof cGroups)[number]) => g.map((x) => sourceDate(x.sourceId) ?? "").sort().at(-1) ?? "";
    const versionText = () =>
      [...cGroups]
        // earlier editions first (oldest document first), the current one last
        .sort(
          (g1, g2) =>
            Number(!g1.every((x) => x.earlier)) - Number(!g2.every((x) => x.earlier)) ||
            (dated(g1) && dated(g2) ? dated(g1).localeCompare(dated(g2)) : 0) ||
            names(g1)[0].localeCompare(names(g2)[0]),
        )
        .map((g) => `${names(g).join(", ")}: ${formatBound(g[0].start)}`)
        .join(" → ");
    // disputed dates that also end a current TIME window (DESC/Dominion windows end at the SCRTP date, GPC's at the SERTP year, PSC/NSPW's at the completion quarter)
    const claimIds = cGroups.flat().map((x) => x.id);
    const boundClaimIds = claimIds.filter((id) => endsWindow(p, p.completionClaims.find((k) => k.id === id)!));
    out.push({
      id: `${p.id}:completion`,
      projectId: p.id,
      field: "completion",
      description: versionOnly
        ? `${onePublisher ? "Schedule changed between plan editions" : "Date superseded by a newer source"} — ${versionText()}`
        : "Sources give different completion / in-service dates — " + describe(cGroups, (d) => formatBound(d.start)),
      sides: cGroups.map((g) => ({ value: formatBound(g[0].start), sourceIds: g.map((x) => x.sourceId), claimIds: g.map((x) => x.id), earlier: g.every((x) => x.earlier) })),
      claimIds,
      affectsMatch: boundClaimIds.length > 0,
      versionOnly,
      boundClaimIds,
    });
  }

  // construction windows: one envelope per source
  const envs: Dated[] = windowsBySource(p).map((ws) => {
    const earliest = ws.map((w) => w.start.earliest).sort()[0];
    return {
      id: ws[0].id,
      sourceId: ws[0].claimSourceId,
      start: { earliest, latest: ws.map((w) => w.start.latest).sort()[0], precision: ws[0].start.precision },
      end: { earliest: ws.map((w) => w.end.earliest).sort().at(-1)!, latest: ws.map((w) => w.end.latest).sort().at(-1)!, precision: ws.at(-1)!.end.precision },
      earlier: false,
      openStart: ws.some((w) => w.openStart && w.start.earliest === earliest),
    };
  });
  const wGroups = cluster(envs).map(lead);
  if (wGroups.length > 1) {
    const fmt = (d: Dated) => `${d.openStart ? `before ${d.start.latest.slice(0, 4)} → ` : `${formatBound(d.start).split("–")[0]}–`}${formatBound(d.end).split("–").at(-1)}`;
    const bySource = windowsBySource(p);
    out.push({
      id: `${p.id}:window`,
      projectId: p.id,
      field: "constructionWindow",
      description: "Sources give different construction windows — " + describe(wGroups, fmt),
      // the representative source's windows first, so the side's excerpt matches its value
      sides: wGroups.map((g) => ({ value: fmt(g[0]), sourceIds: g.map((x) => x.sourceId), claimIds: g.flatMap((x) => bySource.find((ws) => ws[0].claimSourceId === x.sourceId) ?? []).map((w) => w.id) })),
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

function exclusionFor(p: Project): ExcludedProject | null {
  if (p.duplicateOf) {
    return { projectId: p.id, reason: "duplicate", detail: `Repeated mention of ${p.duplicateOf}; merged before pairing.` };
  }
  // completion stated by a source: archived; a planned date that merely passed is not a completion claim (see pastDue)
  if (p.status.value === "complete") return { projectId: p.id, reason: "complete", detail: "Completed work is archived as a negative example." };
  if (p.status.value === "cancelled") return { projectId: p.id, reason: "cancelled", detail: "Cancelled plans are archived." };
  if (!ELIGIBLE.has(p.status.value)) return { projectId: p.id, reason: "unknown-status", detail: "Status not established in sources." };
  return null;
}

export const PAST_DUE_PENALTY = 15;

/**
 * Planned date passed, completion not confirmed: the project stays in the queue (ranked lower, TIME at most possible) instead of
 * being dropped. A published construction window that still runs past the snapshot date (e.g. a state permit's completion date)
 * shows the work continues, so the project is current.
 */
export function pastDue(p: Project, snapshotDate: string | undefined): PastDueProject | null {
  if (!snapshotDate) return null;
  const ws = activeWindows(p);
  if (ws.some((w) => w.phase === "general-construction" && !w.boundsOnly && !w.openEnded && w.end.earliest >= snapshotDate)) return null;
  const isd = currentInService(p);
  if (isd && isd.date.latest < snapshotDate)
    return { projectId: p.id, detail: `Planned in-service date (${formatBound(isd.date)}) has passed; completion not confirmed by any source reviewed.` };
  if (ws.length && ws.every((w) => w.end.latest < snapshotDate))
    return { projectId: p.id, detail: "Every published window ended before the snapshot date; completion not confirmed by any source reviewed." };
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
  const due = [a, b].map((p) => pastDue(p, snapshot.snapshotDate)).filter((x): x is PastDueProject => !!x);
  if (due.length && time.level === "confirmed") {
    // a schedule that may already be over cannot confirm a shared build window
    time.level = "possible";
    delete time.detail.confirmedOverlap;
    delete time.detail.basis;
  }
  if (due.length) {
    const names = due.map((x) => displayTitle(x.projectId === a.id ? a : b)).join(" and ");
    time.reason = `${time.reason} ${names}: planned date passed; completion not confirmed, so TIME is at most possible.`;
  }

  const source = (id: string) => snapshot.sources.find((s) => s.id === id);
  const sourceTitle = (id: string) => source(id)?.publisher ?? id;
  const sourceDoc = (id: string) => source(id)?.title ?? id;
  const sourceDate = (id: string) => source(id)?.publishedAt;
  const coordination = coordinationBetween(a, b, snapshot);
  const conflicts = [...projectConflicts(a, sourceTitle, sourceDoc, sourceDate), ...projectConflicts(b, sourceTitle, sourceDoc, sourceDate)];

  const badge: Match["badge"] =
    geo.level === "confirmed" && time.level === "confirmed" ? "BOTH" : geo.level === "confirmed" ? "GEO" : "POSSIBLE";

  const reviewStatus: Match["reviewStatus"] = coordination.length ? "known-coordination" : geo.level === "confirmed" ? "needs-review" : "possible";

  const sameSite = geo.detail.method === "shared-site" || geo.detail.method === "shared-endpoint";
  const d = geo.detail.closest?.miles;
  const beyondRadius = sameSite && !(d !== undefined && d < thresholdMiles);
  const geoReason = geo.reason;
  const relevance: Match["relevance"] =
    geo.level !== "confirmed" ? "low" : sameSite || (d !== undefined && d <= 10) ? "high" : "medium";

  // explainable review priority — an ordering, not a probability or a dollar value
  const reasons: string[] = [];
  let priority = 0;
  const add = (points: number, reason: string) => {
    priority += Math.round(points);
    reasons.push(reason);
  };
  const inferredSite = geo.detail.method === "shared-site" && snapshot.relations.filter((r) => geo.detail.relationIds.includes(r.id)).every((r) => r.basis === "inferred");
  if (sameSite && inferredSite) add(50, "Shared facility implied by sources");
  else if (sameSite) add(60, geo.detail.method === "shared-site" ? "Shared facility stated in a source" : "Terminals at the same facility");
  else if (geo.level === "confirmed" && d !== undefined)
    add(30 + 30 * Math.max(0, 1 - d / thresholdMiles), `Closest approach ≈${d < 10 || Math.abs(d - thresholdMiles) < 1.5 ? d.toFixed(1) : Math.round(d)} mi`);
  else if (geo.level === "confirmed") add(30, "Within the review radius");
  else add(12, geo.detail.method === "measured" && !geo.detail.closest?.localityOnly ? "Closest approach is estimated or near the radius edge" : "Proximity possible (coarse location)");

  // timing: more evidence never scores lower — confirmed 30 > possible 18–30 > unknown ≤ 15 > no-match 0
  const gap = time.detail.inService?.gapDays;
  const gapFactor = gap === undefined ? 0 : Math.max(0, 1 - gap / IN_SERVICE_HORIZON_DAYS);
  const coarseGap = time.detail.inService?.coarse;
  const gapText =
    gap === undefined ? "" : coarseGap && gap === 0 ? "in-service dates overlap at stated precision" : `in-service dates ${coarseGap ? "≥" : ""}${dayCount(gap)} apart`;
  if (time.level === "confirmed" && time.detail.basis === "schedule") add(28 + 2 * gapFactor, "Published schedules overlap (start → in-service)");
  else if (time.level === "confirmed") add(30, "Construction windows overlap");
  else if (time.level === "possible") add(18 + 12 * gapFactor, `Construction windows may overlap${gapText ? `; ${gapText}` : ""}`);
  else if (time.level === "unknown" && gap !== undefined) add(15 * gapFactor, gapText[0].toUpperCase() + gapText.slice(1));
  else if (time.level === "no-match") reasons.push("Schedule windows do not overlap");

  const evidenceIds = new Set<string>();
  for (const r of snapshot.relations.filter((r) => geo.detail.relationIds.includes(r.id))) r.evidenceIds.forEach((e) => evidenceIds.add(e));
  for (const p of [a, b]) {
    for (const w of activeWindows(p)) w.evidenceIds.forEach((e) => evidenceIds.add(e));
    if (time.detail.basis === "schedule") for (const w of scheduleWindows(p)) w.evidenceIds.forEach((e) => evidenceIds.add(e));
    currentInService(p)?.evidenceIds.forEach((e) => evidenceIds.add(e));
  }
  for (const c of coordination) c.evidenceIds.forEach((e) => evidenceIds.add(e));
  const evs = [...evidenceIds].map((id) => snapshot.evidence[id]).filter(Boolean);
  const completeness = evs.length ? evs.filter((e) => e.verifiedInSource).length / evs.length : 0;
  priority += Math.round(completeness * 10);
  if (completeness === 1 && evs.length) reasons.push("Every cited excerpt located verbatim in its source");
  if (geo.detail.closest?.lowConfidence) {
    priority -= 5;
    reasons.push("A location is approximate or lower-confidence");
  }
  if (due.length) {
    priority -= PAST_DUE_PENALTY;
    reasons.push("Planned date passed; completion not confirmed (ranked below current plans)");
  }
  if (beyondRadius) reasons.push(`Outside the ${thresholdMiles} mi rule: ranked after every within-radius needs-review pair`);
  if (coordination.length) reasons.push("Documented coordination on record");
  if (conflicts.length) reasons.push(`${conflicts.length} source conflict${conflicts.length > 1 ? "s" : ""} preserved`);

  return {
    id: `${a.id}__${b.id}`,
    projectAId: a.id,
    projectBId: b.id,
    geo: geo.level,
    time: time.level,
    geoReason,
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
    ...(beyondRadius ? { beyondRadius } : {}),
    ...(due.length ? { pastDue: due } : {}),
    evidenceIds: [...evidenceIds],
    engineVersion: ENGINE_VERSION,
  };
}

export function runMatching(snapshot: Snapshot, opts: RunOptions = {}): MatchRun {
  const thresholdMiles = opts.thresholdMiles ?? DEFAULT_THRESHOLD_MILES;
  const excludedProjects: ExcludedProject[] = [];
  const pastDueProjects: PastDueProject[] = [];
  const eligible: Project[] = [];
  for (const p of snapshot.projects) {
    const ex = exclusionFor(p);
    if (ex) excludedProjects.push(ex);
    else {
      eligible.push(p);
      const due = pastDue(p, snapshot.snapshotDate);
      if (due) pastDueProjects.push(due);
    }
  }

  const matches: Match[] = [];
  const excludedPairs: ExcludedPair[] = [];
  const excludedCounts: MatchRun["excludedCounts"] = { "shared-owner": 0, "no-signal": 0, "beyond-radius": 0, "different-region": 0, "location-unknown": 0 };
  const exclude = (x: ExcludedPair, notable = false) => {
    excludedCounts[x.reason]++;
    if (notable || opts.listExclusions !== false) excludedPairs.push(x);
  };
  const utilityName = (id: string) => snapshot.utilities.find((u) => u.id === id)?.shortName ?? id;
  let pairsEvaluated = 0;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const [a, b] = ordered(eligible[i], eligible[j]);
      const oa = ownerIds(a);
      const shared = [...ownerIds(b)].filter((u) => oa.has(u));
      if (shared.length) {
        // listed individually only when the pair would otherwise meet the place rule (useful internal context)
        const g = a.region === b.region ? evaluateGeo(a, b, snapshot.relations, thresholdMiles).level : "no-match";
        exclude(
          {
            projectAId: a.id,
            projectBId: b.id,
            reason: "shared-owner",
            detail: `Shared owner (${shared.map(utilityName).join(", ")}): internal context, not a cross-utility lead.`,
          },
          g === "confirmed" || g === "possible",
        );
        continue;
      }
      if (a.region !== b.region) {
        exclude({ projectAId: a.id, projectBId: b.id, reason: "different-region", detail: "Pairs are generated within a region." });
        continue;
      }
      pairsEvaluated++;
      const m = evaluatePair(a, b, snapshot, thresholdMiles);
      if (m) matches.push(m);
      else if (evaluateGeo(a, b, snapshot.relations, thresholdMiles).level === "unknown") {
        const missing = [a, b].filter((p) => !p.places.some((pl) => pl.precision !== "unknown")).map(displayTitle);
        exclude({
          projectAId: a.id,
          projectBId: b.id,
          reason: "location-unknown",
          detail: `No usable location for ${missing.join(" and ") || "one project"}; proximity is unknown, not ruled out.`,
        });
      } else {
        const t = evaluateTime(a, b);
        exclude(
          t.level === "confirmed" || t.level === "possible"
            ? { projectAId: a.id, projectBId: b.id, reason: "beyond-radius", detail: `Same build window, but farther than ${thresholdMiles} mi — ignored by the distance rule.` }
            : { projectAId: a.id, projectBId: b.id, reason: "no-signal", detail: `Farther than ${thresholdMiles} mi.` },
        );
      }
    }
  }

  // beyond-radius shared-facility pairs rank after every within-radius needs-review pair (their own order is kept)
  const floor = Math.min(...matches.filter((m) => m.reviewStatus === "needs-review" && !m.beyondRadius).map((m) => m.priority));
  const raw = new Map(matches.map((m) => [m.id, m.priority]));
  if (Number.isFinite(floor)) for (const m of matches) if (m.beyondRadius && m.priority >= floor) m.priority = Math.max(0, floor - 1);
  matches.sort((x, y) => y.priority - x.priority || Number(!!x.beyondRadius) - Number(!!y.beyondRadius) || raw.get(y.id)! - raw.get(x.id)! || x.id.localeCompare(y.id));

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
    pastDueProjects,
    excludedPairs,
    excludedCounts,
  };
}
