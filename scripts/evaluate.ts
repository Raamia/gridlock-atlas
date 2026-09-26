/**
 * Automated evaluation of the matching engine on the current snapshot. There are no human labels: "documented
 * interfaces" are relations the public filings state (or imply), and the engine reads the same relations, which is
 * stated wherever it matters (circularity). Nothing here changes engine behavior; ablations transform a copy of the snapshot.
 *
 *   npm run eval        → data/eval/eval.json + data/eval/eval.md
 */
import fs from "node:fs";
import path from "node:path";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Match, MatchRun, Place, Project, Snapshot } from "../lib/domain/types";
import { pastDue, runMatching } from "../lib/matching/engine";
import { centerOf, evaluateGeo } from "../lib/matching/geo";
import { activeWindows, currentInService, evaluateTime, scheduleWindows } from "../lib/matching/time";
import { sponsorCheck, sponsorReplay, sponsorSheetCheck } from "../lib/sponsor";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data", "eval");
export const R0 = 25;
export const RADII = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
const FAR_MILES = 50;
const FOCUS = "southeast"; // the sponsor's Savannah River region: its Needs-review tab is the demo's queue

type Pair = { a: Project; b: Project; id: string };
type Tier = "A-physical" | "B-joint" | "C-portfolio";
type County = { geoid: string; name: string; state: string; rings: number[][][] };
const hit = (lv: string) => lv === "confirmed" || lv === "possible";
const owners = (p: Project) => new Set(p.owners.map((o) => o.utilityId));
const disjoint = (a: Project, b: Project) => ![...owners(a)].some((u) => owners(b).has(u));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const share = (k: number, n: number) => ({ k, n, pct: n ? round((100 * k) / n, 1) : null });
const count = (xs: string[]) => xs.reduce<Record<string, number>>((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {});

function pairsOf(ps: Project[], sameRegion: boolean): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const [a, b] = ps[i].id < ps[j].id ? [ps[i], ps[j]] : [ps[j], ps[i]];
      if (disjoint(a, b) && (a.region === b.region) === sameRegion) out.push({ a, b, id: `${a.id}__${b.id}` });
    }
  return out;
}

/* ------------------------------------------------------------ counties (B1): listed counties ∪ Census polygons of each located place */
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function countyLookup(counties: County[]) {
  const boxes = counties.map((c) => {
    const pts = c.rings.flat();
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  });
  return (lon: number, lat: number) => {
    const i = counties.findIndex((c, k) => {
      const [x0, y0, x1, y1] = boxes[k];
      return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1 && c.rings.filter((r) => inRing(lon, lat, r)).length % 2 === 1;
    });
    return i < 0 ? null : `${counties[i].name}|${counties[i].state}`;
  };
}
const yearsOf = (lo: string, hi: string) => Array.from({ length: Number(hi.slice(0, 4)) - Number(lo.slice(0, 4)) + 1 }, (_, i) => Number(lo.slice(0, 4)) + i);
const meets = <T>(x: Set<T>, y: Set<T>) => [...x].some((v) => y.has(v));

/* ------------------------------------------------------------ B6: a named terminal of one project is named in BOTH plan texts */
const STOP = new Set(["north", "south", "east", "west", "tap", "sub", "substation", "switching", "station", "line", "terminal", "primary", "junction", "the", "and", "plant", "dam", "new", "county", "creek", "river", "road"]);
function facilityNames(p: Project): string[] {
  const out = new Set<string>();
  for (const pl of p.places) {
    if (pl.precision === "county" || pl.precision === "locality") continue;
    const words = pl.label.replace(/\(.*?\)/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.length) out.add(words.join(" "));
  }
  return [...out];
}
function nameJoin(a: Project, b: Project): string | null {
  const text = (p: Project) => `${p.title} ${p.summary}`.toLowerCase();
  for (const f of new Set([...facilityNames(a), ...facilityNames(b)])) {
    const re = new RegExp(`\\b${f.replace(/ /g, "\\s+")}\\b`);
    if (re.test(text(a)) && re.test(text(b))) return f;
  }
  return null;
}

/* ------------------------------------------------------------ ablations: engine untouched, a transformed copy of the snapshot */
const relabel = (s: Snapshot, from: Place["precision"], to: Place["precision"]) =>
  s.projects.forEach((p) =>
    p.places.forEach((pl) => {
      if (pl.precision === from) pl.precision = to;
    }),
  );
export const ABLATIONS: { id: string; name: string; how: string; transform: (s: Snapshot) => void }[] = [
  { id: "A0", name: "full engine", how: "no change", transform: () => {} },
  {
    id: "A1",
    name: "no location uncertainty",
    how: "every place's uncertaintyMeters set to 0 (d_low = d_high = d)",
    transform: (s) => s.projects.forEach((p) => p.places.forEach((pl) => (pl.uncertaintyMeters = 0))),
  },
  {
    id: "A2",
    name: "no locality cap",
    how: "town-level places re-labeled official-gis: still located, no longer capped at possible (this also drops their −5 lower-confidence points)",
    transform: (s) => relabel(s, "locality", "official-gis"),
  },
  {
    id: "A3a",
    name: "no source-stated shared sites",
    how: "shared-site/interconnects relations re-labeled other; same-initiative relations lose their site (known-coordination status logic untouched)",
    transform: (s) =>
      s.relations.forEach((r) => {
        if (r.kind === "shared-site" || r.kind === "interconnects") r.kind = "other";
        if (r.kind === "same-initiative") {
          delete r.siteLabel;
          delete r.sitePlaceId;
        }
      }),
  },
  {
    id: "A3b",
    name: "no shared-site rule at all",
    how: "A3a, and named facilities re-labeled official-gis so no terminals are equated by name (centers unchanged)",
    transform: (s) => {
      ABLATIONS.find((x) => x.id === "A3a")!.transform(s);
      relabel(s, "named-facility", "official-gis");
    },
  },
  {
    id: "A4",
    name: "A1 + A2 + A3b (naive center rule with uncertainty ignored)",
    how: "all three transforms",
    transform: (s) => ["A1", "A2", "A3b"].forEach((id) => ABLATIONS.find((x) => x.id === id)!.transform(s)),
  },
  {
    id: "A5",
    name: "no schedule basis",
    how: "published schedules (start → in-service) removed: TIME from construction windows only",
    transform: (s) => s.projects.forEach((p) => (p.constructionWindows = p.constructionWindows.filter((w) => w.phase !== "scheduled"))),
  },
  {
    id: "A6",
    name: "drop past-due plans (engine 1.1 rule)",
    how: "projects whose planned date passed without a completion source are excluded before pairing",
    transform: (s) =>
      s.projects.forEach((p) => {
        if (pastDue(p, s.snapshotDate)) p.status = { ...p.status, value: "cancelled" };
      }),
  },
];
export const NOT_RUN = [
  "Priority weights (place ≤ 60, time ≤ 30, evidence ≤ 10, −5 lower confidence, −15 past due): constants inside evaluatePair",
  "Same-site tolerance (SAME_SITE_MILES = 0.6) and the 30-day minimum schedule overlap: module constants",
  "In-service-gap ranking horizon (1,460 days) and the beyond-radius ranking floor",
];

export function evaluate(S: Snapshot, counties: County[]) {
  const now = `${S.snapshotDate}T00:00:00Z`;
  const run = (snap: Snapshot, R = R0) => runMatching(snap, { now, thresholdMiles: R, listExclusions: false });
  const full = run(S);
  const P = new Map(S.projects.map((p) => [p.id, p]));
  const excluded = new Map(full.excludedProjects.map((x) => [x.projectId, x.reason]));
  const eligible = S.projects.filter((p) => !excluded.has(p.id));
  const U = pairsOf(eligible, true);
  if (U.length !== full.pairsEvaluated) throw new Error(`universe ${U.length} != engine ${full.pairsEvaluated}`);
  const dueIds = new Set(full.pastDueProjects.map((x) => x.projectId));
  // the sponsor's utility pair, by owner (SERTP-listed Georgia Power projects carry sertp26-* ids)
  const sides = (id: string) => id.split("__").map((x) => P.get(x)!);
  const descSide = (id: string) => sides(id).find((p) => owners(p).has("desc"));
  const isDescGpc = (id: string) => {
    const [a, b] = sides(id);
    return (owners(a).has("desc") && owners(b).has("gpc")) || (owners(a).has("gpc") && owners(b).has("desc"));
  };

  const countyAt = countyLookup(counties);
  const countyCache = new Map<string, Set<string>>();
  const countiesOf = (p: Project) => {
    if (!countyCache.has(p.id)) {
      const s = new Set(p.counties.map((c) => `${c.name.replace(/\s+County$/i, "").trim()}|${c.state}`));
      for (const pl of p.places) if (pl.role !== "context") s.add(countyAt(pl.lon, pl.lat) ?? "");
      s.delete("");
      countyCache.set(p.id, s);
    }
    return countyCache.get(p.id)!;
  };
  const isdYears = (p: Project) => {
    const c = currentInService(p);
    return new Set(c ? yearsOf(c.date.earliest, c.date.latest) : []);
  };
  const windowYears = (p: Project) => new Set([...activeWindows(p), ...scheduleWindows(p)].flatMap((w) => yearsOf(w.start.earliest, w.end.latest)));

  // per-pair signals that do not depend on the radius
  const sig = new Map<string, { d: number | null; time: string; sameCounty: boolean; b1: boolean; b1w: boolean; name: string | null }>();
  const signal = (x: Pair) => {
    if (!sig.has(x.id)) {
      const [ca, cb] = [centerOf(x.a), centerOf(x.b)];
      const sameCounty = meets(countiesOf(x.a), countiesOf(x.b));
      sig.set(x.id, {
        d: ca && cb ? distance(point(ca.lonlat), point(cb.lonlat), { units: "miles" }) : null,
        time: evaluateTime(x.a, x.b).level,
        sameCounty,
        b1: sameCounty && meets(isdYears(x.a), isdYears(x.b)),
        b1w: sameCounty && meets(windowYears(x.a), windowYears(x.b)),
        name: nameJoin(x.a, x.b),
      });
    }
    return sig.get(x.id)!;
  };
  const methods = (pairs: Pair[], R: number, ours: Set<string>) => {
    const m: Record<string, Set<string>> = { B1: new Set(), B1w: new Set(), B2: new Set(), B3: new Set(), B3time: new Set(), B5: new Set(), B5c: new Set(), B6: new Set(), B4: new Set() };
    for (const x of pairs) {
      const s = signal(x);
      const near = s.d !== null && s.d < R;
      if (s.b1) m.B1.add(x.id);
      if (s.b1w) m.B1w.add(x.id);
      if (near) m.B2.add(x.id);
      if (near && hit(s.time)) m.B5.add(x.id);
      if (near && s.time === "confirmed") m.B5c.add(x.id);
      if (hit(s.time)) m.B3time.add(x.id);
      if (hit(s.time) || hit(evaluateGeo(x.a, x.b, S.relations, R).level)) m.B3.add(x.id);
      if (s.name) m.B6.add(x.id);
      if (ours.has(x.id)) m.B4.add(x.id);
    }
    return m;
  };
  const METHOD_NAMES: Record<string, string> = {
    B1: "same county + same in-service year",
    B1w: "same county + overlapping window years",
    B2: `sponsor rule alone: exact centers < ${R0} mi`,
    B3: "either place or time (literal OR)",
    B3time: "time alone (construction or schedule overlap possible)",
    B5: "B2 AND time possible or confirmed",
    B5c: "B2 AND time confirmed",
    B6: "shared facility name in both plan texts",
    B4: "GridLock engine",
  };

  /* ---------------- queue at 25 mi */
  const ms = full.matches;
  const ours = new Set(ms.map((m) => m.id));
  const M = methods(U, R0, ours);
  const byStatus = (xs: Match[]) => ({
    "needs-review": xs.filter((m) => m.reviewStatus === "needs-review").length,
    "known-coordination": xs.filter((m) => m.reviewStatus === "known-coordination").length,
    possible: xs.filter((m) => m.reviewStatus === "possible").length,
  });
  const region = (m: Match) => P.get(m.projectAId)!.region;
  const NR = (xs: Match[]) => xs.filter((m) => m.reviewStatus === "needs-review" && region(m) === FOCUS);
  const topLead = NR(ms)[0]?.id;
  const top10 = NR(ms).slice(0, 10).map((m) => m.id);
  const miles = (m: Match) => (m.geoDetail.center ? round(m.geoDetail.center.miles) : null);
  const queue = {
    universePairs: U.length,
    descGpcPairs: U.filter((x) => isDescGpc(x.id)).length,
    flagged: share(ms.length, U.length),
    descGpcFlagged: share(ms.filter((m) => isDescGpc(m.id)).length, U.filter((x) => isDescGpc(x.id)).length),
    byStatus: byStatus(ms),
    byRegion: count(ms.map(region)),
    byGeo: count(ms.map((m) => m.geo)),
    byGeoMethod: count(ms.map((m) => m.geoDetail.method)),
    byTime: count(ms.map((m) => m.time)),
    timeBasisSchedule: ms.filter((m) => m.time === "confirmed" && m.timeDetail.basis === "schedule").length,
    byBadge: count(ms.map((m) => m.badge)),
    withinSponsorRule: ms.filter((m) => m.geoDetail.center && m.geoDetail.center.miles < R0).length,
    beyondRadius: ms.filter((m) => m.beyondRadius).length,
    pastDueFlagged: ms.filter((m) => m.pastDue?.length).length,
    inServiceGap: {
      known: ms.filter((m) => m.timeDetail.inService).length,
      zeroAtStatedPrecision: ms.filter((m) => m.timeDetail.inService?.gapDays === 0).length,
      within365: ms.filter((m) => (m.timeDetail.inService?.gapDays ?? Infinity) <= 365).length,
    },
    allEvidenceVerified: ms.filter((m) => m.evidenceIds.every((e) => S.evidence[e]?.verifiedInSource)).length,
    needsReviewTop10: NR(ms)
      .slice(0, 10)
      .map((m, i) => ({ rank: i + 1, id: m.id, priority: m.priority, geo: m.geo, time: m.time, badge: m.badge, basis: m.timeDetail.basis ?? null, miles: miles(m), gapDays: m.timeDetail.inService?.gapDays ?? null, pastDue: !!m.pastDue })),
  };

  /* ---------------- baselines */
  const DG = new Set(U.filter((x) => isDescGpc(x.id)).map((x) => x.id));
  const baselines = Object.entries(M).map(([id, s]) => ({ id, name: METHOD_NAMES[id], flagged: s.size, pctOfUniverse: round((100 * s.size) / U.length, 1), descGpc: [...s].filter((x) => DG.has(x)).length }));
  const overlap = Object.fromEntries(Object.entries(M).map(([k1, s1]) => [k1, Object.fromEntries(Object.entries(M).map(([k2, s2]) => [k2, [...s1].filter((x) => s2.has(x)).length]))]));
  const b4notB2 = ms
    .filter((m) => !M.B2.has(m.id))
    .map((m) => ({ id: m.id, status: m.reviewStatus, geo: m.geo, method: m.geoDetail.method, miles: miles(m), beyondRadius: !!m.beyondRadius }));
  const b4notB2Summary = count(b4notB2.map((x) => (x.method === "shared-site" || x.method === "shared-endpoint" ? "shared facility" : x.method === "coarse" ? "county-level (possible)" : "location uncertainty (possible)")));
  const b2notB4 = [...M.B2].filter((id) => !ours.has(id));
  const descGpc = {
    pairs: DG.size,
    sharingACounty: [...DG].filter((id) => sig.get(id)!.sameCounty).length,
    sponsorRulePairs: [...M.B2].filter((id) => DG.has(id)).length,
    sponsorRulePairsSharingACounty: [...M.B2].filter((id) => DG.has(id) && sig.get(id)!.sameCounty).length,
    sponsorRulePairsDescInSC: [...M.B2].filter((id) => DG.has(id) && ![...countiesOf(descSide(id)!)].some((c) => c.endsWith("|GA"))).length,
    b1Pairs: [...M.B1].filter((id) => DG.has(id)),
  };

  /* ---------------- documented cross-utility interfaces (silver positives) */
  const posMap = new Map<string, { id: string; tier: Tier; kinds: string[] }>();
  const rank: Record<Tier, number> = { "A-physical": 0, "B-joint": 1, "C-portfolio": 2 };
  const addPos = (x: string, y: string, tier: Tier, kind: string) => {
    if (!P.has(x) || !P.has(y)) return;
    const id = x < y ? `${x}__${y}` : `${y}__${x}`;
    const cur = posMap.get(id);
    if (!cur) posMap.set(id, { id, tier, kinds: [kind] });
    else {
      cur.kinds.push(kind);
      if (rank[tier] < rank[cur.tier]) cur.tier = tier;
    }
  };
  for (const r of S.relations)
    if (r.kind !== "duplicate-mention")
      addPos(r.projectA, r.projectB, r.kind === "shared-site" || r.kind === "interconnects" ? "A-physical" : r.kind === "same-initiative" ? "B-joint" : "C-portfolio", `${r.id}:${r.kind}/${r.basis ?? "stated"}`);
  for (const p of S.projects)
    for (const c of p.knownCoordination) if (c.status === "known-joint" || c.status === "reported-coordination") addPos(p.id, c.partnerProjectId, "B-joint", `coordination:${c.status}`);
  const Uids = new Set(U.map((x) => x.id));
  const positives = [...posMap.values()].map((x) => {
    const [a, b] = x.id.split("__").map((i) => P.get(i)!);
    const why = !disjoint(a, b) ? "shared owner (internal context by design)" : excluded.has(a.id) || excluded.has(b.id) ? `archived project (${excluded.get(a.id) ?? excluded.get(b.id)})` : a.region !== b.region ? "cross-region" : null;
    return { ...x, inUniverse: Uids.has(x.id), outOfScope: why };
  });
  const inPos = positives.filter((x) => x.inUniverse);
  const recall = (s: Set<string>, tier?: Tier) => {
    const sub = inPos.filter((x) => !tier || x.tier === tier);
    return { hit: sub.filter((x) => s.has(x.id)).length, of: sub.length };
  };
  const recallBy = (s: Set<string>) => ({ all: recall(s), physical: recall(s, "A-physical"), joint: recall(s, "B-joint"), portfolio: recall(s, "C-portfolio") });
  const interfaces = {
    documented: positives.length,
    inUniverse: inPos.length,
    byTier: count(inPos.map((x) => x.tier)),
    outOfScope: count(positives.filter((x) => !x.inUniverse).map((x) => x.outOfScope ?? "other")),
    inferredRelations: inPos.filter((x) => x.kinds.some((k) => k.endsWith("/inferred"))).length,
    inFocusRegion: inPos.filter((x) => P.get(x.id.split("__")[0])!.region === FOCUS).length,
    recall: Object.fromEntries(Object.entries(M).map(([k, s]) => [k, recallBy(s)])),
    detail: inPos.map((x) => {
      const m = ms.find((y) => y.id === x.id);
      const s = sig.get(x.id)!;
      return { id: x.id, tier: x.tier, kinds: x.kinds, exactMiles: s.d === null ? null : round(s.d, 1), flaggedBy: Object.keys(M).filter((k) => M[k].has(x.id)), ours: m ? { status: m.reviewStatus, method: m.geoDetail.method } : null };
    }),
    caveat:
      "Circular by construction: the engine's shared-site rule reads the same relations used as positives. Ablations A3a/A3b separate the two effects. A design justification, not an accuracy estimate; no precision is claimed because unflagged pairs are not labeled negatives.",
  };

  /* ---------------- negative controls */
  const allPairs = pairsOf(S.projects, true);
  const archivedPairs = allPairs.filter((x) => excluded.has(x.a.id) || excluded.has(x.b.id));
  const nc1 = methods(archivedPairs, R0, new Set());
  const duePairs = U.filter((x) => dueIds.has(x.a.id) || dueIds.has(x.b.id));
  const dueMatches = ms.filter((m) => dueIds.has(m.projectAId) || dueIds.has(m.projectBId));
  const far = new Set(U.filter((x) => (sig.get(x.id)!.d ?? 0) > FAR_MILES).map((x) => x.id));
  const cross = pairsOf(eligible, false);
  const starterByRadius = [5, 10, 15, 20, 25, 30, 40, 50].map((R) => {
    const c = sponsorCheck(R);
    return { R, rowsFound: c.rows.filter((r) => r.ourMiles !== null).length, extra: c.extra.length };
  });
  const negativeControls = {
    archived: {
      what: "pairs with a project a source says is complete or cancelled (or a duplicate / unknown-status record): archived before pairing",
      projects: count(full.excludedProjects.map((x) => x.reason)),
      pairs: archivedPairs.length,
      flaggedBy: Object.fromEntries(["B1", "B1w", "B2", "B3", "B5"].map((k) => [k, nc1[k].size])),
      B4: ms.filter((m) => excluded.has(m.projectAId) || excluded.has(m.projectBId)).length,
    },
    pastDue: {
      what: "pairs with a plan whose in-service date passed without a completion source: kept (engine 1.2), TIME at most possible, −15 points",
      projects: dueIds.size,
      pairs: duePairs.length,
      B4flagged: dueMatches.length,
      B4timeConfirmed: dueMatches.filter((m) => m.time === "confirmed").length,
      B4badgeBoth: dueMatches.filter((m) => m.badge === "BOTH").length,
      B4missingFlag: dueMatches.filter((m) => !m.pastDue?.length).length,
      B3flagged: duePairs.filter((x) => M.B3.has(x.id)).length,
    },
    far: {
      what: `pairs whose exact centers are more than ${FAR_MILES} mi apart`,
      pairs: far.size,
      flaggedBy: Object.fromEntries(Object.entries(M).map(([k, s]) => [k, [...s].filter((id) => far.has(id)).length])),
      B4notSharedFacility: ms.filter((m) => far.has(m.id) && m.geoDetail.method !== "shared-site" && m.geoDetail.method !== "shared-endpoint").length,
      B4detail: ms.filter((m) => far.has(m.id)).map((m) => ({ id: m.id, method: m.geoDetail.method, miles: miles(m), status: m.reviewStatus })),
    },
    crossRegion: {
      what: "pairs from different regions (e.g. Georgia × Wisconsin)",
      pairs: cross.length,
      timeAloneWouldFlag: cross.filter((x) => hit(evaluateTime(x.a, x.b).level)).length,
      B4: ms.filter((m) => P.get(m.projectAId)!.region !== P.get(m.projectBId)!.region).length,
    },
    starterFile: { what: "sponsor starter file: pairs flagged that are not rows of its overlap table", byRadius: starterByRadius },
  };

  /* ---------------- sponsor worked example */
  const sc = sponsorCheck();
  const sheet = sponsorSheetCheck();
  const sponsor = {
    overlapTable: { rows: sc.rows, matched: sc.rows.filter((r) => r.ok).length, of: sc.rows.length, extra: sc.extra, allOk: sc.allOk },
    projectSheet: { matched: sheet.filter((r) => r.ok).length, of: sheet.length },
    replay: sponsorReplay(full, S).map((r) => ({ id: r.id, status: r.status, tab: r.tab ?? null, rank: r.rank ?? null, miles: r.miles === undefined ? null : round(r.miles), days: r.days ?? null, pastDue: !!r.pastDue, related: r.related?.matchId ?? null })),
  };

  /* ---------------- radius sensitivity */
  const sweep = RADII.map((R) => {
    const r = R === R0 ? full : run(S, R);
    const set = new Set(r.matches.map((m) => m.id));
    const mm = methods(U, R, set);
    return {
      R,
      flagged: r.matches.length,
      ...byStatus(r.matches),
      descGpc: r.matches.filter((m) => isDescGpc(m.id)).length,
      both: r.matches.filter((m) => m.badge === "BOTH").length,
      B2: mm.B2.size,
      B5: mm.B5.size,
      B2notInB4: [...mm.B2].filter((id) => !set.has(id)).length,
      recallB4: recall(set),
      recallB2: recall(mm.B2),
      top10KeptFrom25: NR(r.matches).slice(0, 10).filter((m) => top10.includes(m.id)).length,
      topLeadRank: NR(r.matches).findIndex((m) => m.id === topLead) + 1 || null,
      needsReviewTop1: NR(r.matches)[0]?.id ?? null,
    };
  });

  /* ---------------- ablations */
  const statusOf = new Map(ms.map((m) => [m.id, m.reviewStatus]));
  const ablations = ABLATIONS.map((a) => {
    const snap = structuredClone(S);
    a.transform(snap);
    const r: MatchRun = a.id === "A0" ? full : run(snap);
    const ids = new Set(r.matches.map((m) => m.id));
    return {
      id: a.id,
      name: a.name,
      how: a.how,
      flagged: r.matches.length,
      pairsEvaluated: r.pairsEvaluated,
      geoConfirmed: r.matches.filter((m) => m.geo === "confirmed").length,
      geoPossible: r.matches.filter((m) => m.geo === "possible").length,
      ...byStatus(r.matches),
      both: r.matches.filter((m) => m.badge === "BOTH").length,
      lost: [...ours].filter((id) => !ids.has(id)).length,
      gained: [...ids].filter((id) => !ours.has(id)).length,
      statusChanged: r.matches.filter((m) => statusOf.has(m.id) && statusOf.get(m.id) !== m.reviewStatus).map((m) => `${m.id}: ${statusOf.get(m.id)} → ${m.reviewStatus}`),
      recall: recallBy(ids),
      top10KeptFrom25: NR(r.matches).slice(0, 10).filter((m) => top10.includes(m.id)).length,
      topLeadRank: NR(r.matches).findIndex((m) => m.id === topLead) + 1 || null,
      sponsorOvl3Rank: NR(r.matches).findIndex((m) => m.id === "desc-06367-d-g__gpc-20065") + 1 || null,
    };
  });

  const ev = Object.values(S.evidence);
  return {
    meta: {
      snapshot: S.version,
      snapshotDate: S.snapshotDate,
      engine: full.engineVersion,
      radiusMiles: R0,
      focusRegion: FOCUS,
      projects: S.projects.length,
      eligible: eligible.length,
      archived: count(full.excludedProjects.map((x) => x.reason)),
      pastDue: dueIds.size,
      universe: "eligible projects × eligible projects, same region, no shared owner: exactly the engine's candidate pairs",
      counties: "US Census Bureau cb_2023_us_county_20m (data/eval/counties.json) + counties listed in the sources",
      evidence: { total: ev.length, verifiedInSource: ev.filter((e) => e.verifiedInSource).length, reviewedByHuman: ev.filter((e) => e.reviewedByHuman).length, sources: S.sources.length },
    },
    sponsor,
    queue,
    baselines,
    overlap,
    b4notB2: { summary: b4notB2Summary, pairs: b4notB2 },
    b2notB4,
    descGpc,
    interfaces,
    negativeControls,
    sweep,
    ablations,
    notRun: NOT_RUN,
  };
}

export type Evaluation = ReturnType<typeof evaluate>;

/* ------------------------------------------------------------ report */
const n = (x: number) => x.toLocaleString("en-US");
const frac = (r: { hit: number; of: number }) => `${r.hit}/${r.of}`;
const row = (cells: (string | number | null)[]) => `| ${cells.map((c) => (c === null ? "–" : String(c))).join(" | ")} |`;
const table = (head: string[], rows: (string | number | null)[][]) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

export function markdown(e: Evaluation): string {
  const q = e.queue;
  const b = Object.fromEntries(e.baselines.map((x) => [x.id, x]));
  const rc = e.interfaces.recall;
  const nc = e.negativeControls;
  return [
    "# GridLock Atlas: automated evaluation",
    "",
    `Generated by \`npm run eval\` on snapshot \`${e.meta.snapshot}\` (${e.meta.snapshotDate}), engine \`${e.meta.engine}\`, radius ${e.meta.radiusMiles} mi. No human labels: *documented interfaces* are relations the public filings state or imply, never "true matches"; unflagged pairs are not labeled negatives, so no precision is claimed. Evidence: ${n(e.meta.evidence.verifiedInSource)}/${n(e.meta.evidence.total)} excerpts re-found verbatim; ${e.meta.evidence.reviewedByHuman} human-reviewed.`,
    "",
    "## Headline",
    "",
    `- **Sponsor worked example:** overlap table ${e.sponsor.overlapTable.matched}/${e.sponsor.overlapTable.of} rows exact (±0.01 mi, to the day), ${e.sponsor.overlapTable.extra.length} extra pairs; project sheet ${e.sponsor.projectSheet.matched}/${e.sponsor.projectSheet.of} projects exact.`,
    `- **Selectivity:** ${n(q.flagged.k)} of ${n(q.flagged.n)} candidate pairs flagged (${q.flagged.pct}%); DESC × Georgia Power ${n(q.descGpcFlagged.k)} of ${n(q.descGpcFlagged.n)} (${q.descGpcFlagged.pct}%). A literal *either place or time* rule flags ${n(b.B3.flagged)} (${b.B3.pctOfUniverse}%).`,
    `- **County + year join:** ${b.B1.flagged} pairs, ${b.B1.descGpc} DESC × Georgia Power, against ${e.descGpc.sponsorRulePairs} DESC × Georgia Power pairs under the sponsor's 25-mile rule; only ${e.descGpc.sponsorRulePairsSharingACounty} of those share a county; in ${e.descGpc.sponsorRulePairsDescInSC} the DESC project lies entirely in South Carolina counties.`,
    `- **Documented interfaces (${e.interfaces.inUniverse} in scope, none in the Savannah River region):** the center rule alone keeps ${frac(rc.B2.all)}; the engine keeps ${frac(rc.B4.all)} (physical ${frac(rc.B4.physical)}). Circular: the engine reads the same filings' shared-facility statements (see A3a/A3b).`,
    `- **Negative controls:** ${nc.archived.B4} flagged pairs involve an archived (completed/cancelled) project (${n(nc.archived.pairs)} such pairs; the OR rule would flag ${n(nc.archived.flaggedBy.B3)}); ${nc.pastDue.B4timeConfirmed} past-due pairs get TIME confirmed; ${nc.far.B4notSharedFacility} pairs over ${FAR_MILES} mi are flagged without a shared facility; ${nc.crossRegion.B4} cross-region pairs.`,
    "",
    "## 1. Sponsor worked example (starter file)",
    "",
    table(
      ["Row", "Pair", "Sponsor mi", "Ours mi", "Sponsor days", "Ours days", "Exact"],
      e.sponsor.overlapTable.rows.map((r) => [r.id, r.pair, r.sponsorMiles, r.ourMiles, r.sponsorDays, r.ourDays, r.ok ? "yes" : "no"]),
    ),
    "",
    `Extra pairs by radius (NC4): ${nc.starterFile.byRadius.map((x) => `R=${x.R}: ${x.rowsFound}/6 rows, ${x.extra} extra`).join("; ")}.`,
    "",
    "Sponsor rows in today's plans:",
    "",
    table(
      ["Row", "Today", "Tab", "Rank", "Miles", "Days apart", "Past due"],
      e.sponsor.replay.map((r) => [r.id, r.status, r.tab, r.rank, r.miles, r.days, r.pastDue ? "yes" : ""]),
    ),
    "",
    `## 2. The ${e.meta.radiusMiles}-mile queue`,
    "",
    table(
      ["Measure", "Value"],
      [
        ["Flagged / candidate pairs", `${n(q.flagged.k)} / ${n(q.flagged.n)} (${q.flagged.pct}%)`],
        ["DESC × Georgia Power", `${n(q.descGpcFlagged.k)} / ${n(q.descGpcFlagged.n)} (${q.descGpcFlagged.pct}%)`],
        ["By status", Object.entries(q.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ")],
        ["By region", Object.entries(q.byRegion).map(([k, v]) => `${k} ${v}`).join(" · ")],
        ["Place", Object.entries(q.byGeoMethod).map(([k, v]) => `${k} ${v}`).join(" · ")],
        ["Time", `${Object.entries(q.byTime).map(([k, v]) => `${k} ${v}`).join(" · ")} (confirmed on a schedule basis: ${q.timeBasisSchedule})`],
        ["Badges", Object.entries(q.byBadge).map(([k, v]) => `${k} ${v}`).join(" · ")],
        [`Centers under ${e.meta.radiusMiles} mi (sponsor table rows)`, q.withinSponsorRule],
        ["Beyond the radius, kept for a shared facility", q.beyondRadius],
        ["With a past-due plan (flagged, TIME ≤ possible)", q.pastDueFlagged],
        ["In-service gap known / 0 days / ≤ 365 days", `${q.inServiceGap.known} / ${q.inServiceGap.zeroAtStatedPrecision} / ${q.inServiceGap.within365}`],
        ["Every cited excerpt verified", `${q.allEvidenceVerified}/${q.flagged.k}`],
      ],
    ),
    "",
    "Savannah River Needs-review top 10:",
    "",
    table(
      ["#", "Pair", "Priority", "GEO", "TIME", "Badge", "Miles", "Days apart"],
      q.needsReviewTop10.map((m) => [m.rank, m.id.replace("__", " × "), m.priority, m.geo, `${m.time}${m.basis === "schedule" ? " (schedule)" : ""}`, m.badge, m.miles, m.gapDays]),
    ),
    "",
    `## 3. Baselines at ${e.meta.radiusMiles} mi (${n(q.flagged.n)} candidate pairs)`,
    "",
    table(
      ["Id", "Method", "Flagged", "% of pairs", "DESC × GPC", "Documented interfaces", "Physical"],
      e.baselines.filter((x) => x.id !== "B3time").map((x) => [x.id, x.name, n(x.flagged), x.pctOfUniverse, x.descGpc, frac(rc[x.id].all), frac(rc[x.id].physical)]),
    ),
    "",
    `- B2 ⊆ B4: ${e.b2notB4.length} sponsor-rule pairs are missing from the engine's queue. The engine adds ${e.b4notB2.pairs.length}: ${Object.entries(e.b4notB2.summary).map(([k, v]) => `${v} ${k}`).join(", ")}.`,
    `- B3's time leg alone fires on ${n(b.B3time.flagged)} pairs. The challenge states both readings: flag overlap "either because the projects are physically close to each other, or because they're scheduled around the same time", and "treat geographic overlap as the primary signal".`,
    `- County join on DESC × Georgia Power: ${e.descGpc.sharingACounty} of ${n(e.descGpc.pairs)} pairs share any county; of the ${e.descGpc.sponsorRulePairs} under the sponsor rule, ${e.descGpc.sponsorRulePairsDescInSC} have the DESC project entirely in South Carolina.`,
    `- B6 (name join) needs no coordinates but joins different facilities that share a name and misses neighbors with different names.`,
    "",
    "## 4. Documented interfaces (recall, with the circularity caveat)",
    "",
    `${e.interfaces.documented} documented pairs; ${e.interfaces.inUniverse} are cross-utility candidate pairs (${Object.entries(e.interfaces.byTier).map(([k, v]) => `${v} ${k}`).join(", ")}; ${e.interfaces.inferredRelations} rest on an inferred relation; ${e.interfaces.inFocusRegion} in the Savannah River region). Out of scope: ${Object.entries(e.interfaces.outOfScope).map(([k, v]) => `${v} ${k}`).join(", ")}.`,
    "",
    table(
      ["Pair", "Tier", "Exact miles", "Flagged by", "Engine status"],
      e.interfaces.detail.map((x) => [x.id.replace("__", " × "), x.tier, x.exactMiles, x.flaggedBy.join(" "), x.ours ? `${x.ours.status} (${x.ours.method})` : "not flagged"]),
    ),
    "",
    `*${e.interfaces.caveat}*`,
    "",
    "## 5. Negative controls",
    "",
    table(
      ["Control", "Pairs", "B1", "B2", "B3 (OR)", "B5", "Engine"],
      [
        ["Archived project (complete/cancelled)", n(nc.archived.pairs), nc.archived.flaggedBy.B1, nc.archived.flaggedBy.B2, n(nc.archived.flaggedBy.B3), nc.archived.flaggedBy.B5, nc.archived.B4],
        [`Centers > ${FAR_MILES} mi`, n(nc.far.pairs), nc.far.flaggedBy.B1, nc.far.flaggedBy.B2, n(nc.far.flaggedBy.B3), nc.far.flaggedBy.B5, `${nc.far.flaggedBy.B4} (all shared facilities: ${nc.far.B4notSharedFacility === 0 ? "yes" : "no"})`],
        ["Cross-region", n(nc.crossRegion.pairs), null, null, `${n(nc.crossRegion.timeAloneWouldFlag)} (time alone)`, null, nc.crossRegion.B4],
      ],
    ),
    "",
    `Past-due plans (${nc.pastDue.projects} projects, ${n(nc.pastDue.pairs)} pairs): kept rather than dropped, since no source confirms completion. The engine flags ${nc.pastDue.B4flagged}, every one marked past due (${nc.pastDue.B4missingFlag} unmarked), ${nc.pastDue.B4timeConfirmed} with TIME confirmed, ${nc.pastDue.B4badgeBoth} with a BOTH badge.`,
    "",
    "## 6. Radius sensitivity",
    "",
    table(
      ["R (mi)", "Flagged", "Needs review", "Known", "Possible", "DESC × GPC", "BOTH", "B2", "B2 ⊄ B4", "Interfaces B4 / B2", "Top-10 kept", "Top lead rank"],
      e.sweep.map((s) => [s.R, s.flagged, s["needs-review"], s["known-coordination"], s.possible, s.descGpc, s.both, s.B2, s.B2notInB4, `${frac(s.recallB4)} / ${frac(s.recallB2)}`, s.top10KeptFrom25, s.topLeadRank]),
    ),
    "",
    `Top lead = Savannah River Needs-review #1 at ${e.meta.radiusMiles} mi (${q.needsReviewTop10[0]?.id.replace("__", " × ")}); top-10 kept = how many of the ${e.meta.radiusMiles}-mile Savannah River Needs-review top 10 stay in that radius's top 10.`,
    "",
    `## 7. Ablations at ${e.meta.radiusMiles} mi (snapshot transforms; engine code unchanged)`,
    "",
    table(
      ["Id", "Variant", "Flagged", "GEO conf / poss", "NR / known / possible", "BOTH", "Lost / gained", "Status changes", "Interfaces", "Top-10 kept", "Top lead", "OVL_3 rank"],
      e.ablations.map((a) => [a.id, a.name, a.flagged, `${a.geoConfirmed} / ${a.geoPossible}`, `${a["needs-review"]} / ${a["known-coordination"]} / ${a.possible}`, a.both, `${a.lost} / ${a.gained}`, a.statusChanged.length, frac(a.recall.all), a.top10KeptFrom25, a.topLeadRank, a.sponsorOvl3Rank]),
    ),
    "",
    ...e.ablations.map((a) => `- ${a.id}: ${a.how}.`),
    "",
    "Not run (each needs an engine code change):",
    "",
    ...e.notRun.map((x) => `- ${x}`),
    "",
  ].join("\n");
}

function main() {
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as Snapshot;
  const counties = JSON.parse(fs.readFileSync(path.join(OUT, "counties.json"), "utf8")).counties as County[];
  const e = evaluate(snap, counties);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "eval.json"), JSON.stringify(e, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "eval.md"), markdown(e));
  const q = e.queue;
  console.log(
    `eval: ${e.meta.snapshot} · ${q.flagged.k}/${q.flagged.n} pairs flagged · sponsor ${e.sponsor.overlapTable.matched}/${e.sponsor.overlapTable.of} exact · interfaces ${frac(e.interfaces.recall.B4.all)} (center rule ${frac(e.interfaces.recall.B2.all)}) → data/eval/eval.{json,md}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main();
