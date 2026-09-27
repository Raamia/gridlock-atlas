/*
 * Schedule what-if: move one project's published schedule by whole months and ask the engine again.
 *
 * Nothing here is a second timing model. The moved project's windows and dated claims are shifted on a copy, then the pair
 * goes back through the engine's own `evaluatePair` (construction windows, published schedules, the 30-day schedule rule,
 * the passed-date demotion), and the sentence is the timeline's own `overlapStatement`. So at 0 months the answer is exactly
 * the as-planned one, and at any other offset it is exactly what the engine would say about those dates.
 *
 * Honesty rules: precision and every window flag (openStart, openEnded, boundsOnly, continuous) are kept, so an uncertain
 * date stays uncertain; a source's own wording ("Spring 2028") is dropped once the date moves, so text is rebuilt from the
 * shifted dates; the far-future "end not published" sentinel never moves; a project with no published window is never
 * given one. No probability, expected value, sum or new dollar figure is produced: the impact line only says whether an
 * existing cited channel stays listed, with that channel's own label, value and basis.
 */
import { IDX, SNAPSHOT } from "@/lib/data";
import type { ConstructionWindow, DateBound, Match, Project, SignalLevel } from "@/lib/domain/types";
import { formatDate, formatPoint, formatSpan } from "@/lib/format";
import { formatUsd, formatUsdRange, impactChannels, type ChannelBasis } from "@/lib/impact";
import { evaluatePair } from "@/lib/matching/engine";
import { activeWindows, dayCount, durationText, MIN_SCHEDULE_OVERLAP_DAYS, scheduleWindows } from "@/lib/matching/time";
import { overlapStatement, pairDomain, type Domain, type OverlapStatement } from "@/components/timeline/model";

/** The slider's reach either way: three years. */
export const MAX_SHIFT_MONTHS = 36;

export type WhatIfMove = "a" | "b";

/** Open-ended windows carry a far-future end meaning "not published" (formatWindow treats ≥ 2090 the same way): never moved. */
const SENTINEL = "2090";
const DAY = 86_400_000;
const MONTH_DAYS = 30.4375;
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / DAY);
const later = (x: string, y: string) => (x > y ? x : y);
const earlier = (x: string, y: string) => (x < y ? x : y);

/** Whole months in [-36, 36]; anything that is not a number is "as planned". */
export function clampMonths(months: number): number {
  if (!Number.isFinite(months)) return 0;
  return Math.max(-MAX_SHIFT_MONTHS, Math.min(MAX_SHIFT_MONTHS, Math.round(months)));
}

/** "as planned" · "1 month later" · "12 months earlier" */
export function shiftLabel(months: number): string {
  const n = clampMonths(months);
  if (n === 0) return "as planned";
  const k = Math.abs(n);
  return `${k} ${k === 1 ? "month" : "months"} ${n > 0 ? "later" : "earlier"}`;
}

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An ISO date moved by whole calendar months. Month-aligned bounds stay aligned: the 1st stays the 1st and a month's last
 * day stays the last day ("2028-12-31" + 2 → "2029-02-28"); other days clamp to the target month's length.
 */
export function shiftIso(iso: string, months: number): string {
  if (!months || iso >= SENTINEL) return iso;
  const y = Number(iso.slice(0, 4));
  const m0 = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const t = y * 12 + m0 + months;
  const ny = Math.floor(t / 12);
  const nm = t - ny * 12;
  const nd = d === daysInMonth(y, m0) ? daysInMonth(ny, nm) : Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${pad(nm + 1)}-${pad(nd)}${iso.slice(10)}`;
}

/** Both ends of a bound moved; precision kept; the source's own wording dropped once the date has moved. */
function shiftBound(b: DateBound, months: number): DateBound {
  if (!months) return b;
  return { earliest: shiftIso(b.earliest, months), latest: shiftIso(b.latest, months), precision: b.precision };
}

/** Does the project publish anything the what-if can move (a current construction window or a published schedule)? */
export function canMove(p: Project): boolean {
  return activeWindows(p).length + scheduleWindows(p).length > 0;
}

/**
 * A copy of the project with its whole published timeline moved: every window (start and end ranges) and every dated
 * completion / in-service claim, so the schedule still ends at its own in-service date. Ids, sources and flags are kept.
 */
export function shiftProject(p: Project, months: number): Project {
  const n = clampMonths(months);
  if (!n || !canMove(p)) return p;
  const w = (x: ConstructionWindow): ConstructionWindow => ({ ...x, start: shiftBound(x.start, n), end: shiftBound(x.end, n) });
  return {
    ...p,
    constructionWindows: p.constructionWindows.map(w),
    completionClaims: p.completionClaims.map((c) => ({ ...c, date: shiftBound(c.date, n) })),
  };
}

export interface WhatIfSide {
  /** The project as the what-if draws it (the moved one shifted, the other as published). */
  project: Project;
  /** The project as published (for the moved one's dashed "as planned" outline). */
  original: Project;
  /** Current construction windows and published schedules: shifted and as published. */
  windows: ConstructionWindow[];
  originalWindows: ConstructionWindow[];
  moved: boolean;
}

export interface WhatIfResult {
  move: WhatIfMove;
  /** Clamped whole months (0 when the moved project has nothing to move). */
  months: number;
  /** The moved project publishes a window or schedule; false → "No published schedule to move". */
  movable: boolean;
  level: SignalLevel;
  /** The timeline's own sentence for the shifted dates ("Schedules overlap Jun 2025–Dec 2027 · 30 months"). */
  statement: string;
  /** The engine's full TIME reason for the shifted dates (tooltip). */
  reason: string;
  /** One short follow-up line: how much of a certain overlap is still ahead, how far apart the windows are, why timing stays unknown. */
  detail: string | null;
  /** Span both certainly cover (confirmed only). */
  overlap: { start: string; end: string } | null;
  /** Months of certain overlap (the statement's own rounding); null unless confirmed. */
  overlapMonths: number | null;
  /** Months of that certain overlap on or after the snapshot date; past months don't help anyone. Null unless confirmed. */
  overlapFromSnapshotMonths: number | null;
  /** Days behind overlapFromSnapshotMonths (the text uses the same day/month wording as the statement). */
  overlapFromSnapshotDays: number | null;
  /** No overlap: the nearest the windows come at their widest reading, in whole months (a floor). Null otherwise. */
  gapMonths: number | null;
  gapDays: number | null;
  /** The pair with the shifted dates, as the engine evaluates it (TIME fields replaced; everything else as the run has it). */
  match: Match;
  st: OverlapStatement;
  a: WhatIfSide;
  b: WhatIfSide;
}

const monthsOf = (d: number) => Math.round(d / MONTH_DAYS);
/** A floor, for "at least … apart": a 47-day gap never reads as "2 months". */
const monthsFloor = (d: number) => Math.floor(d / MONTH_DAYS);
const atLeast = (d: number) => (d < 60 ? dayCount(d) : `${monthsFloor(d)} months`);

function side(original: Project, project: Project, moved: boolean): WhatIfSide {
  const ws = (p: Project) => [...activeWindows(p), ...scheduleWindows(p)];
  return { project, original, windows: ws(project), originalWindows: ws(original), moved };
}

/** The nearest two projects' current windows come at their widest reading (days), when no combination can overlap. */
function nearestGap(a: Project, b: Project): number | null {
  let best: number | null = null;
  for (const x of activeWindows(a))
    for (const y of activeWindows(b)) {
      const s = later(x.start.earliest, y.start.earliest);
      const e = earlier(x.end.latest, y.end.latest);
      if (s > e) best = best === null ? days(e, s) : Math.min(best, days(e, s));
    }
  return best;
}

/**
 * Move project A or B by `months` (clamped to ±36) and re-run the engine's pair evaluation on the shifted copy.
 * months = 0 reproduces the as-planned TIME level and overlap statement exactly.
 */
export function whatIf(m: Match, move: WhatIfMove, months: number): WhatIfResult {
  const a0 = IDX.project(m.projectAId);
  const b0 = IDX.project(m.projectBId);
  const moved0 = move === "a" ? a0 : b0;
  const movable = canMove(moved0);
  const n = movable ? clampMonths(months) : 0;
  const a = move === "a" ? shiftProject(a0, n) : a0;
  const b = move === "b" ? shiftProject(b0, n) : b0;

  // always the engine's own answer, at 0 months too (the tests hold it to the run's): geography does not depend on dates,
  // so a flagged pair always evaluates again
  const e = evaluatePair(a, b, SNAPSHOT, m.geoDetail.thresholdMiles);
  if (!e) throw new Error(`what-if: ${m.id} no longer evaluates`);
  const match: Match = { ...m, time: e.time, timeReason: e.timeReason, timeDetail: e.timeDetail, pastDue: e.pastDue };
  const st = overlapStatement(match);
  const t = match.timeDetail;
  const certain = match.time === "confirmed" ? (t.confirmedOverlap ?? null) : null;
  const certainDays = certain ? (t.basis === "schedule" && t.schedule ? t.schedule.days : days(certain.start, certain.end)) : null;
  const snap = SNAPSHOT.snapshotDate;
  const aheadDays = certain ? Math.max(0, days(later(certain.start, snap), certain.end)) : null;
  const gapDays = match.time === "no-match" ? nearestGap(a, b) : null;

  let detail: string | null = null;
  const snapText = `the snapshot (${formatDate(snap)})`;
  if (!movable) detail = "No published schedule to move";
  else if (certain && aheadDays !== null) detail = aheadDays > 0 ? `${durationText(aheadDays)} of it on or after ${snapText}` : `All of it before ${snapText}`;
  else if (gapDays !== null) detail = `At least ${atLeast(gapDays)} apart, even at the widest reading of the published dates`;
  else if (match.time === "possible" && match.pastDue?.length) {
    // the engine's passed-date rule (pairCaption's words): a schedule that may already be over cannot confirm
    const names = match.pastDue.map((d) => IDX.project(d.projectId)?.shortTitle ?? d.projectId).join(" and ");
    detail = `Date passed for ${names}: completion not confirmed, so timing is at most possible`;
  } else if (match.time === "unknown") {
    const other = move === "a" ? b0 : a0;
    if (!canMove(other)) detail = `No schedule is published for ${other.shortTitle}, so moving the other project cannot settle the timing`;
    else if (t.schedule) {
      detail = t.schedule.days > 0 ? `Published schedules overlap only ${dayCount(t.schedule.days)} (under ${MIN_SCHEDULE_OVERLAP_DAYS} days)` : "Published schedules do not overlap";
    }
  }

  return {
    move,
    months: n,
    movable,
    level: match.time,
    statement: st.text,
    reason: match.timeReason,
    detail,
    overlap: certain,
    overlapMonths: certainDays === null ? null : monthsOf(certainDays),
    overlapFromSnapshotMonths: aheadDays === null ? null : monthsOf(aheadDays),
    overlapFromSnapshotDays: aheadDays,
    gapMonths: gapDays === null ? null : monthsFloor(gapDays),
    gapDays,
    match,
    st,
    a: side(a0, a, move === "a" && n !== 0),
    b: side(b0, b, move === "b" && n !== 0),
  };
}

/**
 * One calendar axis for the whole card: the pair's own domain, widened to hold either project moved the full ±36 months,
 * so the axis never jumps while the slider moves or the moved project is switched.
 */
export function whatIfDomain(m: Match): Domain {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const ds = [pairDomain(a, b)];
  for (const k of [-MAX_SHIFT_MONTHS, MAX_SHIFT_MONTHS]) ds.push(pairDomain(shiftProject(a, k), b), pairDomain(a, shiftProject(b, k)));
  return { y0: Math.min(...ds.map((d) => d.y0)), y1: Math.max(...ds.map((d) => d.y1)) };
}

export interface WhatIfImpact {
  /** The channel's own label, value text and basis (Impact section wording). */
  label: string;
  value: string;
  basis: ChannelBasis;
  dollars?: string;
  /** Whether the engine's impact model still lists the channel for the shifted dates. */
  applies: boolean;
  /** "applies" (as planned) · "still applies" · "does not apply" */
  verdict: string;
  why: string;
  text: string;
}

/**
 * The timing-dependent impact channel under the what-if: the staging / one-mobilization channel is listed only while the
 * two schedules are not ruled apart (lib/impact: m.time !== "no-match"). Reports whether it still is, with the channel's own
 * label, value and basis — never a new figure, a difference, a sum or a likelihood. Null when the pair has no such channel.
 */
export function whatIfImpact(r: WhatIfResult): WhatIfImpact | null {
  const listed = impactChannels(r.match).find((c) => c.key === "staging");
  // the channel as the Impact section would list it whenever timing allows (its value does not depend on the dates)
  const c = listed ?? impactChannels({ ...r.match, time: "unknown" }).find((x) => x.key === "staging");
  if (!c) return null;
  const value = !c.usd ? "" : c.upTo ? `up to ≈ ${formatUsd(c.usd[1])}` : `≈ ${formatUsdRange(c.usd)}`;
  const t = r.match.timeDetail;
  const what = t.basis === "schedule" ? "published schedules" : "construction windows";
  let why: string;
  if (!listed) why = "no months together";
  else if (r.overlap && r.overlapFromSnapshotDays) why = `${what} overlap ${durationText(r.overlapFromSnapshotDays)} from ${formatPoint(later(r.overlap.start, SNAPSHOT.snapshotDate), "month")}`;
  else if (r.overlap) why = `${what} overlap only before the snapshot`;
  else if (r.level === "possible") {
    const o = t.possibleOverlap ?? t.schedule?.overlap;
    why = o ? `overlap is possible (${formatSpan(o, t.possibleOverlap ? t.precision : "month")}), not certain` : "overlap is possible, not certain";
  } else why = "timing is unknown, not ruled out";
  const verdict = !listed ? "does not apply" : r.months === 0 ? "applies" : "still applies";
  return {
    label: c.label,
    value,
    basis: c.basis,
    dollars: c.dollars,
    applies: !!listed,
    verdict,
    why,
    text: `${c.label} · ${value ? `${value} · ` : ""}${c.basis}: ${verdict} — ${why}`,
  };
}
