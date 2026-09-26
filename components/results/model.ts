/**
 * Presentational numbers and copy for the Opportunities panel (pre-run hero, results, rows, export menu).
 * Pure functions over the snapshot and a run; memoised per region / run. Display strings that vitest pins
 * (format, describe, selectors, export, sponsor) are reused as they are — this file only composes them.
 */
import { IDX, SNAPSHOT } from "@/lib/data";
import BASELINES from "@/data/eval/eval.json";
import type { Match, MatchRun, Project, ReviewStatus } from "@/lib/domain/types";
import { geoShort, inServicePhrase } from "@/lib/describe";
import { formatDate, formatMilesNear, formatSpan, precisionLabel } from "@/lib/format";
import { FOCAL_UTILITIES, overviewRole } from "@/lib/mapdata";
import { regionMatches } from "@/lib/rank";
import { ownerNames } from "@/lib/selectors";
import { beyondRuleReason, SPONSOR_RADIUS_MILES, sponsorCheck, sponsorReplay, sponsorSheetCheck } from "@/lib/sponsor";

export const fmt = (n: number) => n.toLocaleString("en-US");

/* ─────────────────────────────── region, before a run ─────────────────────────────── */

/** The engine's eligibility rule (lib/matching/engine `exclusionFor`): no duplicate, and a status sources establish. */
const ELIGIBLE = new Set(["proposed", "approved", "construction"]);
const eligible = (p: Project) => !p.duplicateOf && ELIGIBLE.has(p.status.value);

export function regionLabel(region: string): string {
  return region === "all" ? "All regions" : (SNAPSHOT.regions.find((r) => r.id === region)?.label ?? region);
}

export function regionProjects(region: string): Project[] {
  return SNAPSHOT.projects.filter((p) => region === "all" || p.region === region);
}

const pairsCache = new Map<string, number>();
/**
 * Cross-utility pairs the engine will check in the region (eligible projects, same region, no shared owner) — the same
 * number the results sub-line shows after the run (regionPairCounts().evaluated), so "7,830" can morph from one to the other.
 */
export function pairsToCheck(region: string): number {
  const hit = pairsCache.get(region);
  if (hit !== undefined) return hit;
  const regions = region === "all" ? SNAPSHOT.regions.map((r) => r.id) : [region];
  let n = 0;
  for (const r of regions) {
    const ps = SNAPSHOT.projects.filter((p) => p.region === r && eligible(p));
    for (let i = 0; i < ps.length; i++) {
      const owners = new Set(ps[i].owners.map((o) => o.utilityId));
      for (let j = i + 1; j < ps.length; j++) if (!ps[j].owners.some((o) => owners.has(o.utilityId))) n++;
    }
  }
  pairsCache.set(region, n);
  return n;
}

/** Sources cited by the region's plans (the hero's 103 is the whole snapshot; this is for its tooltip). */
export function regionSourceCount(region: string): number {
  return region === "all" ? SNAPSHOT.sources.length : new Set(regionProjects(region).flatMap((p) => p.sourceIds)).size;
}

export const SNAPSHOT_DATE = formatDate(SNAPSHOT.snapshotDate);
export const SOURCE_COUNT = SNAPSHOT.sources.length;

/** "Dominion Energy SC", "Georgia Power", "Dairyland Power Cooperative" → short enough for a sentence (as the header legend). */
export function utilityName(id: string): string {
  const u = IDX.utility(id);
  if (!u) return id;
  const name = u.name.replace(/ South Carolina$/, " SC");
  return name.length <= 20 ? name : u.shortName;
}

export interface UtilityPlans {
  id: string;
  name: string;
  /** a / b = the region's focal pair (the map's two hues), other = grey. */
  hue: "a" | "b" | "other";
  projects: Project[];
  /** The document most of its plans are cited from ("separate plans, separate documents"). */
  doc?: string;
}

const plansCache = new Map<string, UtilityPlans[]>();
/** Every utility with projects in the region: the focal two first, then by project count. */
export function utilityPlans(region: string): UtilityPlans[] {
  const hit = plansCache.get(region);
  if (hit) return hit;
  const by = new Map<string, Project[]>();
  for (const p of regionProjects(region)) for (const o of p.owners) by.set(o.utilityId, [...(by.get(o.utilityId) ?? []), p]);
  const focalIds = region === "all" ? Object.values(FOCAL_UTILITIES).flat() : (FOCAL_UTILITIES[region] ?? []);
  const hueOf = (id: string): UtilityPlans["hue"] => {
    for (const [a, b] of region === "all" ? Object.values(FOCAL_UTILITIES) : FOCAL_UTILITIES[region] ? [FOCAL_UTILITIES[region]] : []) {
      if (id === a) return "a";
      if (id === b) return "b";
    }
    return "other";
  };
  const out = [...by.entries()]
    .map(([id, projects]) => {
      const cites = new Map<string, number>();
      for (const p of projects) for (const s of p.sourceIds) cites.set(s, (cites.get(s) ?? 0) + 1);
      const top = [...cites.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      const title = top ? IDX.source(top)?.title : undefined;
      return { id, name: IDX.utility(id)?.name ?? id, hue: hueOf(id), projects, doc: title?.split(" — ").pop() };
    })
    .sort((x, y) => {
      const fx = focalIds.indexOf(x.id);
      const fy = focalIds.indexOf(y.id);
      if (fx !== fy) return (fx < 0 ? 99 : fx) - (fy < 0 ? 99 : fy);
      return y.projects.length - x.projects.length || x.name.localeCompare(y.name);
    });
  plansCache.set(region, out);
  return out;
}

/** One status vocabulary for plan lists: "Proposed", "In progress", "10-year plan". */
export function statusLabel(p: Project): string {
  const l = p.status.label?.trim();
  if (l) {
    if (/Ten-Year Plan/i.test(l)) return "10-year plan";
    if (/SERTP/i.test(l)) return "SERTP plan";
    return l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
  }
  const v = p.status.value;
  return v === "construction" ? "In construction" : v.charAt(0).toUpperCase() + v.slice(1);
}

/* ─────────────────────────────── the result headline ─────────────────────────────── */

export interface Headline {
  /** The display number: pairs whose centers are inside Sperry's rule (or the smaller review radius), else every flagged pair. */
  big: number;
  label: string;
  evaluated: number;
  flagged: number;
  /** Why the rest are flagged although outside the rule, e.g. "12 possible, on uncertain locations". */
  rest: string[];
  /** "A naive close-or-same-time rule flags 4,563 of these pairs (58%)." — only where the committed baseline covers the region at 25 mi. */
  naive: string | null;
}

const within = (m: Match, mi: number) => !!m.geoDetail.center && m.geoDetail.center.miles < mi;
const viaFacility = (m: Match) => m.geoDetail.method === "shared-site" || m.geoDetail.method === "shared-endpoint";

export function headline(run: MatchRun, region: string, evaluated: number): Headline {
  const ms = regionMatches(run, region);
  const r = run.thresholdMiles;
  const rule = Math.min(r, SPONSOR_RADIUS_MILES);
  const inside = ms.filter((m) => within(m, rule));
  const others = ms.filter((m) => !within(m, rule));
  const facility = others.filter(viaFacility).length;
  const uncertain = others.filter((m) => !viaFacility(m) && m.geo === "possible").length;
  const wider = others.length - facility - uncertain;
  const rest: string[] = [];
  if (wider) rest.push(`${fmt(wider)} at ${SPONSOR_RADIUS_MILES}–${r}\u00a0mi`);
  if (uncertain) rest.push(`${fmt(uncertain)} possible, on uncertain locations`);
  if (facility && inside.length) rest.push(`${fmt(facility)} through shared facilities beyond ${rule}\u00a0mi`);

  let big = inside.length;
  let label = r >= SPONSOR_RADIUS_MILES ? `within Sperry’s ${SPONSOR_RADIUS_MILES} miles` : `within ${r} miles`;
  if (!inside.length && ms.length) {
    big = ms.length;
    label = facility === ms.length ? `flagged through shared facilities beyond ${rule} mi` : `flagged beyond ${rule} mi, each with a reason`;
  } else if (!ms.length) {
    label = `pairs flagged at ${r} mi`;
  }
  return { big, label, evaluated, flagged: ms.length, rest, naive: naiveLine(region, r, evaluated) };
}

function naiveLine(region: string, r: number, evaluated: number): string | null {
  if (r !== BASELINES.meta.radiusMiles) return null;
  const b3 = BASELINES.baselines.find((b) => b.id === "B3");
  if (!b3) return null;
  let k: number;
  let n: number;
  if (region === BASELINES.meta.focusRegion) [k, n] = [b3.descGpc, BASELINES.descGpc.pairs];
  else if (region === "all") [k, n] = [b3.flagged, BASELINES.queue.universePairs];
  else return null;
  // the committed baseline must describe exactly the pairs on screen
  if (n !== evaluated) return null;
  return `A naive close-or-same-time rule flags ${fmt(k)} of these pairs (${Math.round((k / n) * 100)}%).`;
}

/* ─────────────────────────────── Sperry proof + replay ─────────────────────────────── */

let proof: { ok: boolean; rows: number; projects: number } | null = null;
/** "6/6 overlap rows · 10/10 project rows" when the starter file reproduces exactly (no run needed). */
export function sperryProof() {
  if (!proof) {
    const c = sponsorCheck();
    const sheet = sponsorSheetCheck();
    proof = { ok: c.allOk && sheet.every((s) => s.ok), rows: c.rows.length, projects: sheet.length };
  }
  return proof;
}

export const PROOF_TEXT = (p: { rows: number; projects: number }) =>
  `✓ Reproduces Sperry’s worked example · ${p.rows}/${p.rows} overlap rows · ${p.projects}/${p.projects} project rows`;

export interface SperryTag {
  id: string;
  tooltip: string;
}

const replayCache = new WeakMap<MatchRun, Map<string, SperryTag>>();
/** matchId → "Sperry OVL_3" for the starter file's rows that are in today's queue. */
export function sperryTags(run: MatchRun): Map<string, SperryTag> {
  const hit = replayCache.get(run);
  if (hit) return hit;
  const out = new Map<string, SperryTag>();
  for (const row of sponsorReplay(run, SNAPSHOT)) {
    if (row.status !== "in-queue" || !row.matchId) continue;
    const today =
      row.miles !== undefined && row.days !== undefined ? `; ${row.miles.toFixed(2)} mi / ${row.daysAtLeast ? "≥" : ""}${fmt(row.days)} d on today’s plans` : "";
    out.set(row.matchId, { id: row.id, tooltip: `Row ${row.id} of Sperry’s worked example: ${row.sponsorMiles} mi / ${fmt(row.sponsorDays)} d in the starter file${today}` });
  }
  replayCache.set(run, out);
  return out;
}

/* ─────────────────────────────────────── rows ─────────────────────────────────────── */

export type Hue = "a" | "b" | "other";

export interface RowOwner {
  hue: Hue;
  /** Visible mono label: the owner in the dot's colour, plus "+N" co-owners. */
  label: string;
  /** Every owner's full name (tooltip + screen readers). */
  full: string;
}

/**
 * Row owner codes where the short name would eat the title in a 360px rail ("Georgia Power" → "GPC", as in its own
 * plan's project titles). The full name is always in the tooltip and read by screen readers.
 */
const ROW_CODE: Record<string, string> = { gpc: "GPC", "minnesota-power": "MP", gre: "GRE", "itc-midwest": "ITC", "gridliance-heartland": "GridLiance", "transource-ok": "Transource" };

/** The owner a row line names: the region's focal owner the dot is coloured for, else the first owner. */
export function rowOwner(p: Project): RowOwner {
  const role = overviewRole(p);
  const focal = FOCAL_UTILITIES[p.region];
  const hue: Hue = role === "u1" ? "a" : role === "u2" ? "b" : "other";
  const main = hue === "a" ? focal![0] : hue === "b" ? focal![1] : p.owners[0]?.utilityId;
  const short = (main && (ROW_CODE[main] ?? IDX.utility(main)?.shortName)) ?? main ?? "—";
  const more = p.owners.length - 1;
  return { hue, label: (more > 0 ? `${short} +${more}` : short).replace(/ · /g, "·"), full: ownerNames(p, IDX) };
}

export type FactState = "confirmed" | "possible" | "none";
export interface Fact {
  state: FactState;
  text: string;
  mono: boolean;
  tooltip: string;
}

/** "2025–2026" → "2025–26" (the facts column is narrow; tooltips keep the full span). */
function compactYears(span: { start: string; end: string }): string {
  const a = span.start.slice(0, 4);
  const z = span.end.slice(0, 4);
  return a === z ? a : a.slice(0, 2) === z.slice(0, 2) ? `${a}–${z.slice(2)}` : `${a}–${z}`;
}

/** Place fact: the distance between centers, or the shared facility itself. */
export function placeFact(m: Match): Fact {
  const d = m.geoDetail;
  const g = geoShort(m);
  const state: FactState = m.geo === "confirmed" ? "confirmed" : m.geo === "possible" ? "possible" : "none";
  if (d.method === "shared-site" || d.method === "shared-endpoint") return { state, text: g.text, mono: false, tooltip: g.title };
  if (d.method === "measured" && d.center) {
    const c = d.center;
    const range = `${c.lowMiles.toFixed(1)}–${c.highMiles.toFixed(1)} mi with location uncertainty`;
    return {
      state,
      text: formatMilesNear(c.miles, d.thresholdMiles),
      mono: true,
      tooltip: `Centers ${g.text} · ${state === "possible" ? `range ${range}; treat as a lead to verify` : range}`,
    };
  }
  if (d.method === "coarse") return { state, text: "County-level", mono: false, tooltip: "County-level only — no project center, so no mileage" };
  return { state, text: "Location unknown", mono: false, tooltip: "Location unknown" };
}

/** Time fact: "2025–26" (published schedules overlap), "2028" (may overlap), or text only (no overlap / unknown). */
export function timeFact(m: Match): Fact {
  const t = m.timeDetail;
  const revised = m.conflicts.length > 0 && m.conflicts.every((c) => c.versionOnly);
  const note = revised ? " · Date revised: a newer edition of the plan moved a date; both are kept." : "";
  const gap = t.inService ? ` · ${inServicePhrase(m)}` : "";
  if (m.time === "confirmed" && t.confirmedOverlap) {
    if (t.basis === "schedule") {
      const months = t.schedule?.days ? Math.round(t.schedule.days / 30.44) : null;
      return {
        state: "confirmed",
        text: compactYears(t.confirmedOverlap),
        mono: true,
        tooltip: `Published schedules (start → in-service) overlap${months ? ` for ${months} months` : ""} (${formatSpan(t.confirmedOverlap, "month")}); field-work dates are not published${note}`,
      };
    }
    return { state: "confirmed", text: compactYears(t.confirmedOverlap), mono: true, tooltip: `Published construction windows overlap ${formatSpan(t.confirmedOverlap, t.precision)}${note}` };
  }
  if (m.time === "possible" && t.possibleOverlap) {
    return {
      state: "possible",
      text: compactYears(t.possibleOverlap),
      mono: true,
      tooltip: `Construction windows may overlap ${formatSpan(t.possibleOverlap, t.precision)} · ${precisionLabel(t.precision)} precision${note}`,
    };
  }
  if (m.time === "no-match") return { state: "none", text: "No overlap", mono: false, tooltip: `No overlap: published windows do not overlap${gap}${note}` };
  return { state: "none", text: "Unknown", mono: false, tooltip: `Timing unknown: no published construction window — overlap unknown, not ruled out${gap}${note}` };
}

/** Chip line facts (only when present). */
export function rowFlags(m: Match): { disputed: boolean; revised: boolean; pastDue: boolean; beyond: { text: string; tooltip: string } | null } {
  const disputed = m.conflicts.some((c) => !c.versionOnly);
  const revised = !disputed && m.conflicts.length > 0;
  const c = m.geoDetail.center;
  let beyond: { text: string; tooltip: string } | null = null;
  if (c && c.miles >= SPONSOR_RADIUS_MILES) {
    const reason =
      m.geoDetail.method === "shared-site" ? "shared site" : m.geoDetail.method === "shared-endpoint" ? "same terminal" : m.geo === "possible" ? "uncertain location" : null;
    if (reason) beyond = { text: `Beyond ${SPONSOR_RADIUS_MILES} mi · ${reason}`, tooltip: capitalize(beyondRuleReason(m, SNAPSHOT.relations) ?? "") };
  }
  return { disputed, revised, pastDue: !!m.pastDue?.length, beyond };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ─────────────────────────────── tabs, known elsewhere ─────────────────────────────── */

export const TAB_TOOLTIP: Record<ReviewStatus, string> = {
  "needs-review": "Needs review — the reviewed sources are silent; status unknown, not “uncoordinated”",
  "known-coordination": "Known coordination — a documented interface, not a new discovery",
  possible: "Possible — thin evidence; verify location and timing before any outreach",
};

/** "8 documented interfaces are in Upper Midwest and Southern Plains" — where Known coordination lives when this region has none. */
export function knownElsewhere(run: MatchRun, region: string): { text: string; region: string } | null {
  if (region === "all") return null;
  const others = SNAPSHOT.regions
    .filter((r) => r.id !== region)
    .map((r) => ({ id: r.id, label: r.label, n: regionMatches(run, r.id).filter((m) => m.reviewStatus === "known-coordination").length }))
    .filter((r) => r.n > 0)
    .sort((x, y) => y.n - x.n);
  if (!others.length) return null;
  const total = others.reduce((s, r) => s + r.n, 0);
  const names = others.map((r) => r.label);
  const where = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { text: `${total} documented ${total === 1 ? "interface is" : "interfaces are"} in ${where}`, region: others[0].id };
}
