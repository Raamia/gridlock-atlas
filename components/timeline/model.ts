/*
 * Pure data → geometry helpers for the timeline dock (overview strip + pair Gantt). Presentation only: every date string
 * comes from the pinned lib helpers (formatBound, formatSpan, formatWindow, precisionLabel), never re-worded here.
 */
import { IDX, SNAPSHOT } from "@/lib/data";
import type { CompletionClaim, ConstructionWindow, DateBound, Match, MatchRun, Project } from "@/lib/domain/types";
import { formatSpan, precisionLabel } from "@/lib/format";
import { FOCAL_UTILITIES, overviewRole } from "@/lib/mapdata";
import { activeWindows, currentInService, dayCount, durationText, scheduleWindows } from "@/lib/matching/time";

export const SNAP_ISO = SNAPSHOT.snapshotDate;
export const SNAP_YEAR = Number(SNAP_ISO.slice(0, 4));

/** A calendar domain: Jan 1 of `y0` → Jan 1 of `y1` (exclusive). */
export interface Domain {
  y0: number;
  y1: number;
}

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

/** Position of an ISO date in the domain, 0…1 (unclamped). */
export function frac(iso: string, d: Domain): number {
  const a = Date.UTC(d.y0, 0, 1);
  const b = Date.UTC(d.y1, 0, 1);
  return (ms(iso) - a) / (b - a);
}

/** Percentage position clamped to the domain (for CSS `left`/`width`). */
export function pct(iso: string, d: Domain): number {
  return Math.max(0, Math.min(100, frac(iso, d) * 100));
}

export function years(d: Domain): number[] {
  return Array.from({ length: Math.max(0, d.y1 - d.y0) }, (_, i) => d.y0 + i);
}

/** Days a bound spans (0 for an exact day). */
export function spanDays(b: { earliest: string; latest: string }): number {
  return Math.round((ms(b.latest) - ms(b.earliest)) / DAY);
}

/** A bound stated to the day draws as a crisp tick; anything coarser (month, quarter, half, year) as a fuzzy band (T7). */
export function isCrisp(b: { earliest: string; latest: string }): boolean {
  return spanDays(b) <= 1;
}

/* ───────────────────────────────────── overview: planned in-service years ───────────────────────────────────── */

export type RowKey = "a" | "b" | "other";
export const ROW_COLOR: Record<RowKey, string> = { a: "var(--util-a)", b: "var(--util-b)", other: "var(--util-other)" };

export interface InServiceTick {
  project: Project;
  row: RowKey;
  claim: CompletionClaim;
  /** crisp tick at the midpoint, or a fuzzy band earliest → latest */
  crisp: boolean;
  /** the date lies outside the drawn domain and is pinned to its edge */
  pinned: "start" | "end" | null;
}

export interface InServiceRow {
  key: RowKey;
  label: string;
  /** full label for the title attribute (region "All" joins every region's focal utility) */
  title: string;
  ticks: InServiceTick[];
}

export interface InServiceModel {
  rows: InServiceRow[];
  domain: Domain;
  /** projects drawn (with a current in-service / need date) */
  dated: number;
  /** projects in the region that publish no in-service date (not drawn) */
  undated: number;
}

const NOT_PLANNED = new Set(["complete", "cancelled"]);

function utilityShort(id: string): string {
  return IDX.utility(id)?.shortName ?? id;
}

function rowLabels(region: string): Record<RowKey, { label: string; title: string }> {
  const focal = region === "all" ? Object.values(FOCAL_UTILITIES) : FOCAL_UTILITIES[region] ? [FOCAL_UTILITIES[region]] : [];
  const names = (i: 0 | 1) => [...new Set(focal.map((f) => utilityShort(f[i])))];
  const a = names(0);
  const b = names(1);
  return {
    a: { label: a.join(" · ") || "Utility A", title: a.join(" · ") },
    b: { label: b.join(" · ") || "Utility B", title: b.join(" · ") },
    other: { label: "Other", title: "Other utilities (grey on the map)" },
  };
}

/**
 * One tick per planned project at its current in-service / need date (currentInService — the same claim the inspector and
 * the engine's secondary signal use). Completed or cancelled projects are not "planned" and are left out, before and after
 * a run, so the axis never jumps on Compare.
 */
export function inServiceModel(region: string, run: MatchRun | null): InServiceModel {
  const excluded = new Set(run?.excludedProjects.map((x) => x.projectId) ?? []);
  const projects = SNAPSHOT.projects.filter((p) => (region === "all" || p.region === region) && !NOT_PLANNED.has(p.status.value) && !excluded.has(p.id));
  const raw: { project: Project; row: RowKey; claim: CompletionClaim }[] = [];
  let undated = 0;
  for (const p of projects) {
    const claim = currentInService(p);
    if (!claim) {
      undated++;
      continue;
    }
    const role = overviewRole(p);
    raw.push({ project: p, row: role === "u1" ? "a" : role === "u2" ? "b" : "other", claim });
  }
  const ys = raw.flatMap((t) => [Number(t.claim.date.earliest.slice(0, 4)), Number(t.claim.date.latest.slice(0, 4))]);
  const lo = Math.max(SNAP_YEAR - 6, Math.min(SNAP_YEAR, ...ys));
  const hi = Math.min(SNAP_YEAR + 12, Math.max(SNAP_YEAR + 1, ...ys));
  const domain: Domain = { y0: lo, y1: hi + 1 };
  const labels = rowLabels(region);
  const rows: InServiceRow[] = (["a", "b", "other"] as RowKey[])
    .map((key) => ({
      key,
      ...labels[key],
      ticks: raw
        .filter((t) => t.row === key)
        .map((t) => {
          const f0 = frac(t.claim.date.earliest, domain);
          const f1 = frac(t.claim.date.latest, domain);
          return { ...t, crisp: isCrisp(t.claim.date), pinned: f1 < 0 ? ("start" as const) : f0 > 1 ? ("end" as const) : null };
        })
        // earliest first, so later (overlapping) ticks paint on top in reading order
        .sort((x, y) => x.claim.date.earliest.localeCompare(y.claim.date.earliest)),
    }))
    // A and B always (the region's two plans); "Other" only when the region has other owners
    .filter((r) => r.key !== "other" || r.ticks.length > 0);
  return { rows, domain, dated: raw.length, undated };
}

/** Horizontal extent of a tick in the domain (0…1): crisp ticks collapse to their midpoint. */
export function tickExtent(t: InServiceTick, d: Domain): [number, number] {
  const a = Math.max(0, Math.min(1, frac(t.claim.date.earliest, d)));
  const b = Math.max(0, Math.min(1, frac(t.claim.date.latest, d)));
  if (t.crisp || t.pinned) {
    const m = (a + b) / 2;
    return [m, m];
  }
  return [a, b];
}

/** Flagged pairs per project in run priority order (run.matches is already sorted), restricted to `pairIds` when given. */
export function pairsByProject(matches: Match[]): Map<string, Match[]> {
  const out = new Map<string, Match[]>();
  for (const m of matches) {
    for (const id of [m.projectAId, m.projectBId]) {
      const list = out.get(id);
      if (list) list.push(m);
      else out.set(id, [m]);
    }
  }
  return out;
}

/* ─────────────────────────────────────────────── pair Gantt ─────────────────────────────────────────────── */

/** The pair's domain: windows, published schedules and every claim (incl. earlier editions), whole years, ≥4 years wide. */
export function pairDomain(a: Project, b: Project): Domain {
  const ys: number[] = [SNAP_YEAR];
  const floor = SNAP_YEAR - 3;
  const y = (iso: string) => Number(iso.slice(0, 4));
  for (const p of [a, b]) {
    // a start the source leaves open ("before 2026", a start range years wide) fades in from the axis edge instead of
    // stretching the axis back to it
    for (const w of [...activeWindows(p), ...scheduleWindows(p)]) ys.push(...(w.openStart ? [] : [y(w.start.earliest)]), y(w.end.latest));
    for (const c of p.completionClaims) ys.push(y(c.date.earliest), y(c.date.latest));
  }
  // open-ended windows carry a far-future sentinel end ("not published"): never stretch the axis to it
  const finite = ys.filter((y) => y < 2090);
  const lo = Math.max(floor, Math.min(...finite));
  let hi = Math.min(SNAP_YEAR + 12, Math.max(...finite)) + 1;
  if (hi - lo < 4) hi = lo + 4;
  return { y0: lo, y1: hi };
}

export type StatementTone = "overlap" | "muted";

export interface OverlapStatement {
  /** the headline sentence (the kept strings: "Possible overlap … · year precision" / "Overlap guaranteed in …") */
  text: string;
  tone: StatementTone;
  /** amber band to draw over the windows (hatched = possible; `core` solid = guaranteed on a construction basis) */
  band: { start: string; end: string } | null;
  core: { start: string; end: string } | null;
  /** schedule-basis overlap to draw on the schedule lines (published start → in-service, not field work) */
  schedule: { start: string; end: string } | null;
}

/**
 * What the pair's windows say about overlap, in the engine's own terms (T1–T3, T7): a construction-basis overlap keeps the
 * original band strings; a schedule-basis TIME is never called a construction overlap (T2) — it reads "Schedules overlap …"
 * and the caption adds "field-work dates are not published".
 */
export function overlapStatement(m: Match): OverlapStatement {
  const t = m.timeDetail;
  const o = t.possibleOverlap ?? null;
  const p = t.precision;
  const sched = t.schedule?.overlap ?? null;
  if (m.time === "confirmed" && t.basis === "schedule" && t.confirmedOverlap) {
    const days = t.schedule?.days;
    return {
      text: `Schedules overlap ${formatSpan(t.confirmedOverlap, "month")}${days ? ` · ${durationText(days)}` : ""}`,
      tone: "overlap",
      band: o,
      core: null,
      schedule: t.confirmedOverlap,
    };
  }
  if (m.time === "confirmed" && o) {
    const core = t.confirmedOverlap ?? null;
    return {
      text: `Overlap guaranteed in ${formatSpan(core ?? o, p)} · possible ${formatSpan(o, p)} · ${precisionLabel(p)} precision`,
      tone: "overlap",
      band: o,
      core,
      schedule: null,
    };
  }
  if ((m.time === "possible" || m.time === "confirmed") && o) {
    return { text: `Possible overlap ${formatSpan(o, p)} · ${precisionLabel(p)} precision`, tone: "overlap", band: o, core: null, schedule: null };
  }
  if (m.time === "possible" && sched) {
    // a schedule overlap that a passed in-service date demoted to "possible"
    return { text: `Possible overlap ${formatSpan(sched, "month")} · published schedules only`, tone: "overlap", band: null, core: null, schedule: sched };
  }
  if (m.time === "no-match") return { text: "No overlap in the published windows", tone: "muted", band: null, core: null, schedule: null };
  return { text: "Timing unknown · a construction window is not published", tone: "muted", band: null, core: null, schedule: null };
}

/** The caption under the Gantt: basis caveat, the sponsor's secondary signal (in-service gap), passed dates. */
export function pairCaption(m: Match, shortOf: (id: string) => string): string[] {
  const t = m.timeDetail;
  const out: string[] = [];
  if (t.basis === "schedule" || (m.time === "possible" && !t.possibleOverlap && t.schedule?.overlap)) out.push("Schedules run start → in-service; field-work dates are not published");
  const g = t.inService;
  if (g) {
    if (g.coarse && g.gapDays === 0) out.push("In-service ranges overlap at stated precision");
    else out.push(`In-service ${g.coarse ? "≥" : ""}${dayCount(g.gapDays)} apart`);
  }
  for (const d of m.pastDue ?? []) out.push(`Date passed for ${shortOf(d.projectId)}: completion not confirmed`);
  return out;
}

/** Does this window group only bound the work (budget years, start + need date) rather than date it? */
export function isCoarseGroup(ws: ConstructionWindow[]): boolean {
  return ws.some((w) => !w.continuous || w.boundsOnly);
}

/** In-service / completion bound as a [lo, hi] fraction pair plus its midpoint. */
export function boundExtent(b: DateBound, d: Domain): { lo: number; hi: number; mid: number } {
  const lo = frac(b.earliest, d);
  const hi = frac(b.latest, d);
  return { lo, hi, mid: (lo + hi) / 2 };
}
