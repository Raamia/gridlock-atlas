import { SNAPSHOT } from "@/lib/data";
import type { ConstructionWindow, DateBound, Match, Project } from "@/lib/domain/types";
import { formatBound, formatDate, formatSpan, formatWindow } from "@/lib/format";
import { activeWindows, currentInService, dayCount, scheduleWindows } from "@/lib/matching/time";
import type { CloseupModel, Side, V2 } from "./model";

/*
 * The close-up's vertical time axis: height above the plinth is TIME, the plinth itself stays the to-scale map.
 * Each project with a mapped center gets a pillar at its pin: a stalk up to its current in-service / need date (the
 * engine's secondary signal: a bead when the source states a day, a band across the stated month/quarter/half/year
 * otherwise), and a tube over the published work windows the engine compared for this pair. A gold bridge spans the
 * heights where those windows overlap; a bracket measures the in-service gap. The glass sheet is the snapshot date.
 *
 * Height is display only: it never feeds distance, overlap or ranking, and every date drawn comes from the snapshot at
 * the precision the source states (an open start is drawn fading, never as a start date).
 */

/** Scene units from the ground to the top of the axis (the plinth radius is 10). */
export const TIME_H = 5.6;
/** The in-service gap bracket stands this far off the A–B line, toward the side-on camera (scene units). */
export const GAP_OFFSET = 0.6;
const DAY = 86_400_000;
/** Never draw an axis shorter than this, so a single-year pair still reads as a column of time. */
const MIN_YEARS = 3;
/** A window ending this late is open-ended ("from Fall 2027"), not a date. */
const OPEN_END = "2090";

export type TimeTone = "schedule" | "construction" | "window";

export interface TimeIsd {
  /** Heights (scene units) of the stated bound's earliest and latest day: equal for a day-precision date. */
  from: number;
  to: number;
  crisp: boolean;
  /** "Dec 1, 2026", "Q3 2029", "2028" — at the precision the source states. */
  text: string;
}

export interface TimeBar {
  from: number;
  to: number;
  /** Work began before the first year the source itemizes: `from` is only where the fade starts, not a start date. */
  openStart: boolean;
  /** No end is published ("from Fall 2027"): the tube fades out at the top of the axis. */
  openEnd: boolean;
  tone: TimeTone;
  /** "Published schedule · 2021–Dec 2026" */
  text: string;
}

export interface TimePillar {
  side: Side;
  at: V2;
  owner: string;
  title: string;
  isd: TimeIsd | null;
  bar: TimeBar | null;
  /** Height of the pillar's top (the highest thing drawn on it). */
  top: number;
}

export interface TimeOverlap {
  from: number;
  to: number;
  confirmed: boolean;
  /** "Schedules overlap · 2025–2026" / "Windows may overlap · 2027–2029" */
  text: string;
  /** "published schedules" / "construction windows" — for sentences. */
  noun: string;
  span: string;
}

export interface TimeGap {
  from: number;
  to: number;
  days: number;
  /** A stated month/quarter/year on either side: the gap is a minimum ("at least"). */
  coarse: boolean;
  text: string;
}

export interface TimeTick {
  y: number;
  year: number;
  label: boolean;
}

export interface TimeEvent {
  y: number;
  side: Side | "both" | "snapshot";
  text: string;
}

export interface TimeModel {
  /** The year at ground level (1 January). An axis origin, not a date assigned to a project. */
  epoch: number;
  /** Years from the ground to the top of the axis. */
  years: number;
  unitsPerYear: number;
  height: number;
  pillars: TimePillar[];
  snapshot: { y: number; text: string };
  overlap: TimeOverlap | null;
  gap: TimeGap | null;
  /** The year ruler: stands on the plinth rim, beyond B (or east), so a side-on view reads A · B · axis. */
  axis: { at: V2; ticks: TimeTick[] };
  events: TimeEvent[];
  /** Camera azimuth (THREE spherical theta) that looks side-on at the pair with A on the left. */
  sideAzimuth: number;
  /** Where the pair's time story sits: midpoint between the pillars. */
  mid: V2;
  /** Projects drawn without a date (owner names) — said, not hidden. */
  undated: string[];
  /** Projects with no mapped center (county-level only): no pillar, but their date is still said. */
  unplaced: { side: Side; owner: string; isd: string | null }[];
}

const ms = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const yearOf = (iso: string) => Number(iso.slice(0, 4));

function windowsFor(p: Project, ids: string[] | undefined): ConstructionWindow[] {
  const byId = ids?.length ? p.constructionWindows.filter((w) => ids.includes(w.id)) : [];
  if (byId.length) return byId;
  // the engine compared nothing for this side (TIME unknown): show what the project publishes, schedules first
  const sched = scheduleWindows(p);
  return sched.length ? sched : activeWindows(p);
}

function toneOf(ws: ConstructionWindow[]): TimeTone {
  if (ws.every((w) => w.phase === "scheduled")) return "schedule";
  if (ws.some((w) => w.phase === "general-construction")) return "construction";
  return "window";
}

const TONE_TEXT: Record<TimeTone, string> = {
  schedule: "Published schedule",
  construction: "Construction window",
  window: "Published work window",
};

interface RawBar {
  start: string;
  end: string | null;
  openStart: boolean;
  /** The envelope as published: "before 2023 → Dec 1, 2026", "2026–Sep 2028", "from Fall 2027". */
  text: string;
  tone: TimeTone;
}

function envelope(ws: ConstructionWindow[]): RawBar | null {
  if (!ws.length) return null;
  const first = [...ws].sort((x, y) => x.start.earliest.localeCompare(y.start.earliest))[0];
  const open = ws.some((w) => w.openEnded || w.end.latest >= OPEN_END);
  const last = [...ws].filter((w) => !w.openEnded && w.end.latest < OPEN_END).sort((x, y) => y.end.latest.localeCompare(x.end.latest))[0];
  const endB: DateBound | null = open || !last ? null : last.end;
  return {
    // an open start is only published as "before YYYY": the fade begins at 1 January of that year, never earlier
    start: first.openStart ? `${yearOf(first.start.latest)}-01-01` : first.start.earliest,
    end: endB?.latest ?? null,
    openStart: !!first.openStart,
    text: formatWindow(first.start, endB ?? first.end, !endB, first.openStart),
    tone: toneOf(ws),
  };
}

/** Build the time axis for a pair's close-up. Pure (no DOM, no three). */
export function buildTimeModel(m: Match, pa: Project, pb: Project, cu: CloseupModel): TimeModel {
  const t = m.timeDetail;
  const sched = t.basis === "schedule";
  const idsA = sched ? t.schedule?.windowIdsA : t.windowIdsA;
  const idsB = sched ? t.schedule?.windowIdsB : t.windowIdsB;
  const sides = [
    { side: "a" as const, p: pa, cp: cu.a, bound: t.inService?.boundA ?? currentInService(pa)?.date, bar: envelope(windowsFor(pa, idsA)) },
    { side: "b" as const, p: pb, cp: cu.b, bound: t.inService?.boundB ?? currentInService(pb)?.date, bar: envelope(windowsFor(pb, idsB)) },
  ];

  const overlapSpan = t.confirmedOverlap ?? t.possibleOverlap ?? (sched ? t.schedule?.overlap : undefined);
  const snapIso = SNAPSHOT.snapshotDate;

  // ---- the axis domain: every date drawn, plus the snapshot ----
  const dates: string[] = [snapIso];
  for (const s of sides) {
    if (s.bound) dates.push(s.bound.earliest, s.bound.latest);
    if (s.bar) {
      dates.push(s.bar.start);
      if (s.bar.end) dates.push(s.bar.end);
    }
  }
  if (overlapSpan) dates.push(overlapSpan.start, overlapSpan.end);
  const y0 = Math.min(...dates.map(yearOf));
  // the open-start fade needs a year of room under it
  const fadeRoom = sides.some((s) => s.bar?.openStart && yearOf(s.bar.start) === y0) ? 1 : 0;
  const epoch = y0 - fadeRoom;
  let top = Math.max(...dates.map(yearOf)) + 1;
  if (top - epoch < MIN_YEARS) top = epoch + MIN_YEARS;
  const years = top - epoch;
  const unitsPerYear = TIME_H / years;
  // calendar-exact: 1 January of every year sits exactly on its tick, whatever the leap years
  const at = (t: number) => {
    const y = new Date(t).getUTCFullYear();
    const y0 = Date.UTC(y, 0, 1);
    const frac = (t - y0) / (Date.UTC(y + 1, 0, 1) - y0);
    return Math.max(0, Math.min(TIME_H, (y - epoch + frac) * unitsPerYear));
  };
  const h = (iso: string) => at(ms(iso));
  // a stated bound's latest day is the START of that day; draw through its end so "2028" fills the whole year
  const hEnd = (iso: string) => at(ms(iso) + DAY);

  // ---- pillars ----
  const pillars: TimePillar[] = [];
  const undated: string[] = [];
  const unplaced: TimeModel["unplaced"] = [];
  for (const s of sides) {
    if (!s.cp.center) {
      unplaced.push({ side: s.side, owner: s.cp.owner, isd: s.bound ? formatBound(s.bound) : null });
      continue;
    }
    const crisp = !!s.bound && s.bound.precision === "day" && s.bound.earliest === s.bound.latest;
    const isd: TimeIsd | null = s.bound ? { from: h(s.bound.earliest), to: crisp ? h(s.bound.earliest) : hEnd(s.bound.latest), crisp, text: formatBound(s.bound) } : null;
    const bar: TimeBar | null = s.bar
      ? {
          from: h(s.bar.start),
          to: s.bar.end ? hEnd(s.bar.end) : TIME_H,
          openStart: s.bar.openStart,
          openEnd: !s.bar.end,
          tone: s.bar.tone,
          text: `${TONE_TEXT[s.bar.tone]} · ${s.bar.text}`,
        }
      : null;
    if (!isd && !bar) undated.push(s.cp.owner);
    // an undated pillar is a short stub: the pin's place, with nothing to rise to
    const top = isd || bar ? Math.max(isd?.to ?? 0, bar && !bar.openEnd ? bar.to : 0) : 0.3;
    pillars.push({ side: s.side, at: s.cp.center, owner: s.cp.owner, title: s.cp.title, isd, bar, top });
  }

  // ---- overlap and gap (only between two drawn pillars) ----
  const both = pillars.length === 2;
  let overlap: TimeOverlap | null = null;
  if (both && overlapSpan && m.time !== "no-match") {
    const confirmed = m.time === "confirmed" && (!!t.confirmedOverlap || (sched && !!t.schedule?.confirmed));
    const noun = sched ? "published schedules" : "construction windows";
    const span = formatSpan(overlapSpan, sched ? "month" : t.precision);
    overlap = {
      from: h(overlapSpan.start),
      to: hEnd(overlapSpan.end),
      confirmed,
      noun,
      span,
      text: `${sched ? "Schedules" : "Windows"} ${confirmed ? "overlap" : "may overlap"} · ${span}`,
    };
  }
  let gap: TimeGap | null = null;
  const g = t.inService;
  if (both && g && g.gapDays > 0) {
    const [ia, ib] = [pillars[0].isd, pillars[1].isd];
    if (ia && ib) {
      // measured between the nearest stated edges, exactly as the engine does
      const [from, to] = ia.to <= ib.from ? [ia.to, ib.from] : ib.to <= ia.from ? [ib.to, ia.from] : [Math.min(ia.from, ib.from), Math.max(ia.from, ib.from)];
      gap = { from, to, days: g.gapDays, coarse: g.coarse, text: `${g.coarse ? "≥ " : ""}${dayCount(g.gapDays)} apart in service` };
    }
  }

  // ---- axis ----
  const [pA, pB] = [pillars.find((p) => p.side === "a"), pillars.find((p) => p.side === "b")];
  let ux = 1;
  let uz = 0;
  if (pA && pB) {
    const dx = pB.at.x - pA.at.x;
    const dz = pB.at.z - pA.at.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.3) {
      ux = dx / len;
      uz = dz / len;
    }
  }
  const R = 10 * 0.92;
  const axisAt = { x: ux * R, z: uz * R };
  const every = years <= 8 ? 1 : years <= 16 ? 2 : 5;
  const ticks: TimeTick[] = [];
  for (let y = epoch; y <= top; y++) ticks.push({ y: (y - epoch) * unitsPerYear, year: y, label: (y - epoch) % every === 0 });

  // ---- events for the sweep's running caption ----
  const events: TimeEvent[] = [{ y: h(snapIso), side: "snapshot", text: `Snapshot · ${formatDate(snapIso)}` }];
  for (const p of pillars) {
    if (p.bar && !p.bar.openStart) events.push({ y: p.bar.from, side: p.side, text: `${p.owner} · ${TONE_TEXT[p.bar.tone].toLowerCase()} opens` });
    if (p.isd) events.push({ y: p.isd.from, side: p.side, text: `${p.owner} · in service ${p.isd.text}` });
  }
  if (overlap) events.push({ y: overlap.from, side: "both", text: overlap.confirmed ? "Both run at once" : "They may run at once" });
  events.sort((x, y) => x.y - y.y);

  const mid = pA && pB ? { x: (pA.at.x + pB.at.x) / 2, z: (pA.at.z + pB.at.z) / 2 } : (pA ?? pB)?.at ?? { x: 0, z: 0 };

  return {
    epoch,
    years,
    unitsPerYear,
    height: TIME_H,
    pillars,
    snapshot: { y: h(snapIso), text: `Snapshot · ${formatDate(snapIso)}` },
    overlap,
    gap,
    axis: { at: axisAt, ticks },
    events,
    // camera direction ⟂ A→B, on the side where A reads left of B (THREE spherical theta = atan2(x, z))
    sideAzimuth: Math.atan2(-uz, ux),
    mid,
    undated,
    unplaced,
  };
}

/** The year (fractional) at a height, for the sweep's running counter. */
export function yearAt(tm: TimeModel, y: number): number {
  return tm.epoch + y / tm.unitsPerYear;
}
