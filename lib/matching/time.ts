import type { CompletionClaim, ConstructionWindow, DateBound, Project, SignalLevel, TimeDetail } from "@/lib/domain/types";
import { displayTitle, formatSpan, precisionLabel } from "@/lib/format";

const PRECISION_RANK: Record<DateBound["precision"], number> = { day: 0, month: 1, quarter: 2, half: 3, year: 4 };

/** Construction-phase windows that are still current (superseded claims are kept for history only). */
export function activeWindows(project: Project): ConstructionWindow[] {
  return project.constructionWindows.filter((w) => !w.supersededBy && w.phase !== "preconstruction" && w.phase !== "scheduled");
}

/** Current published schedules (implementation start → in-service): evaluated apart from construction windows. */
export function scheduleWindows(project: Project): ConstructionWindow[] {
  return project.constructionWindows.filter((w) => !w.supersededBy && w.phase === "scheduled");
}

/** Certain schedule overlap shorter than this is a sliver of date precision ("Dec 31, 2027 → Jan 1, 2028"), not a shared build window. */
export const MIN_SCHEDULE_OVERLAP_DAYS = 30;

/** The coarsest precision across every start and end bound of the windows. */
export function coarsest(windows: ConstructionWindow[]): DateBound["precision"] {
  let best: DateBound["precision"] = "day";
  for (const w of windows) {
    for (const b of [w.start, w.end]) {
      if (PRECISION_RANK[b.precision] > PRECISION_RANK[best]) best = b.precision;
    }
  }
  return best;
}

const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);

const IN_SERVICE = /in-service|in service|need date|completion|complete|energiz|operation/i;
/** A required-by date ("no later than June 1, 2034") bounds the schedule; it is not a forecast in-service date. */
export const DEADLINE = /deadline|no later than/i;

/** "1 day", "396 days" */
export const dayWord = (n: number): string => (n === 1 ? "day" : "days");
export const dayCount = (n: number): string => `${n.toLocaleString("en-US")} ${dayWord(n)}`;

/**
 * A current in-service / completion forecast that is also the end bound of an active TIME window: the window comes from the
 * claim's own source (or cites the same excerpt) and its end range holds the date — DESC budget windows and the Dominion page
 * window end at the SCRTP planned in-service date, GPC Start → SERTP windows at the SERTP year, PSC/NSPW windows at the
 * completion quarter. Earlier editions and required-by deadlines never bound a window.
 */
export function endsWindow(p: Project, c: CompletionClaim): boolean {
  if (c.current === false || DEADLINE.test(c.label)) return false;
  const d = c.date.latest;
  // a bounds-only window's end was widened back to its start; compare against the end period the source states
  return activeWindows(p).some(
    (w) =>
      (w.claimSourceId === c.claimSourceId || w.evidenceIds.some((e) => c.evidenceIds.includes(e))) &&
      (w.boundsOnly ? periodStart(w.end.latest, w.end.precision) : w.end.earliest) <= d &&
      d <= w.end.latest,
  );
}

/** First day of the period (year, half, quarter, month) that contains `iso`. */
function periodStart(iso: string, p: DateBound["precision"]): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (p === "year") return `${y}-01-01`;
  if (p === "half") return `${y}-${m <= 6 ? "01" : "07"}-01`;
  if (p === "quarter") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  if (p === "month") return `${iso.slice(0, 7)}-01`;
  return iso;
}

const spanMs = (b: DateBound) => Date.parse(b.latest) - Date.parse(b.earliest);

/** The current in-service / need date claim (claims are stored current-first by the snapshot builder); a forecast beats a deadline.
 *  When the current forecasts agree (one lies inside every other: "Sep 2028" inside "2028"), the most precise one is used, the same
 *  value the conflict card shows; when they disagree, the first-listed (newest) claim stays current. */
export function currentInService(p: Project) {
  const isd = p.completionClaims.filter((c) => IN_SERVICE.test(c.label));
  const cur = isd.filter((c) => c.current !== false);
  const forecasts = cur.filter((c) => !DEADLINE.test(c.label));
  const within = (x: (typeof cur)[number], y: (typeof cur)[number]) => y.date.earliest <= x.date.earliest && x.date.latest <= y.date.latest;
  const refined = forecasts.filter((c) => forecasts.every((o) => within(c, o))).sort((x, y) => spanMs(x.date) - spanMs(y.date))[0];
  return refined ?? forecasts[0] ?? cur[0] ?? isd[0] ?? p.completionClaims[0];
}

const DAY = 86_400_000;
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / DAY);

/** "18 months" · "45 days" */
export function durationText(n: number): string {
  return n < 60 ? dayCount(n) : `${Math.round(n / 30.4375)} months`;
}

/**
 * Published schedules (phase "scheduled": implementation start → current in-service), compared with the same interval math as
 * construction windows. Confirmed only when every combination is certain to overlap for at least MIN_SCHEDULE_OVERLAP_DAYS;
 * the certain span is where both schedules run whatever the stated precision, never a claim that crews work at the same time.
 */
export function evaluateSchedule(a: Project, b: Project): TimeDetail["schedule"] {
  const sa = scheduleWindows(a);
  const sb = scheduleWindows(b);
  if (!sa.length || !sb.length) return undefined;
  let start: string | undefined;
  let end: string | undefined;
  for (const x of sa)
    for (const y of sb) {
      const hs = max(x.start.latest, y.start.latest);
      const he = min(x.end.earliest, y.end.earliest);
      start = start ? max(start, hs) : hs;
      end = end ? min(end, he) : he;
    }
  const n = start && end && start <= end ? days(start, end) : 0;
  return {
    windowIdsA: sa.map((w) => w.id),
    windowIdsB: sb.map((w) => w.id),
    ...(n > 0 ? { overlap: { start: start!, end: end! } } : {}),
    days: n,
    confirmed: n >= MIN_SCHEDULE_OVERLAP_DAYS,
  };
}
/**
 * Sponsor's secondary signal: days between in-service dates. With day-precision dates this is the plain
 * difference; with coarser claims ("2028", "Q3 2029") it is the gap between the nearest edges of the two
 * ranges (0 when they overlap), and it is flagged coarse so the UI never shows false day-level precision.
 */
function inServiceGap(a: Project, b: Project): TimeDetail["inService"] {
  const x = currentInService(a);
  const y = currentInService(b);
  if (!x || !y) return undefined;
  const t = (iso: string) => Date.parse(iso);
  const exact = x.date.precision === "day" && y.date.precision === "day" && x.date.earliest === x.date.latest && y.date.earliest === y.date.latest;
  let gap: number;
  if (exact) gap = Math.abs(t(x.date.earliest) - t(y.date.earliest));
  else if (x.date.latest < y.date.earliest) gap = t(y.date.earliest) - t(x.date.latest);
  else if (y.date.latest < x.date.earliest) gap = t(x.date.earliest) - t(y.date.latest);
  else gap = 0;
  return {
    a: x.date.earliest,
    b: y.date.earliest,
    gapDays: Math.round(gap / DAY),
    labelA: x.label,
    labelB: y.label,
    boundA: x.date,
    boundB: y.date,
    coarse: !exact,
  };
}

export interface TimeResult {
  level: SignalLevel;
  reason: string;
  detail: TimeDetail;
}

/** Windows grouped by source: within one source they are components/phases of the work (a union);
 *  across sources they are alternative claims that must all be satisfied for a confirmed overlap. */
export function windowsBySource(p: Project): ConstructionWindow[][] {
  const groups = new Map<string, ConstructionWindow[]>();
  for (const w of activeWindows(p)) groups.set(w.claimSourceId, [...(groups.get(w.claimSourceId) ?? []), w]);
  return [...groups.values()];
}

/**
 * Per-source window groups for display: groups from one publisher with identical bounds are shown once,
 * keeping every source id (e.g. a page and its info sheet that repeat the same schedule).
 */
export function displayWindowGroups(p: Project, publisherOf: (sourceId: string) => string | undefined): { ws: ConstructionWindow[]; sourceIds: string[] }[] {
  const out = new Map<string, { ws: ConstructionWindow[]; sourceIds: string[] }>();
  for (const g of windowsBySource(p)) {
    const key = `${publisherOf(g[0].claimSourceId) ?? g[0].claimSourceId}|${g.map((w) => `${w.start.earliest}/${w.start.latest}/${w.end.earliest}/${w.end.latest}`).sort().join()}`;
    const hit = out.get(key);
    if (hit) hit.sourceIds.push(g[0].claimSourceId);
    else out.set(key, { ws: g, sourceIds: [g[0].claimSourceId] });
  }
  return [...out.values()];
}

/** The secondary-signal sentence appended to every TIME reason. */
function gapNote(g: TimeDetail["inService"]): string {
  if (!g) return "";
  if (!g.coarse) return ` In-service dates are ${dayCount(g.gapDays)} apart (secondary signal).`;
  return g.gapDays === 0
    ? " Published in-service dates overlap at their stated precision (secondary signal)."
    : ` In-service dates are at least ${dayCount(g.gapDays)} apart at their stated precision (secondary signal).`;
}

/**
 * TIME: construction windows first (plan.md §8, below); when they leave overlap "possible" or "unknown", published schedules
 * (start → in-service) that certainly overlap for at least MIN_SCHEDULE_OVERLAP_DAYS confirm it on a "schedule" basis.
 * A construction "no-match" is never overridden, and the reason never calls a schedule overlap a construction overlap.
 */
export function evaluateTime(a: Project, b: Project): TimeResult {
  const t = evaluateConstruction(a, b);
  if (t.level === "confirmed") t.detail.basis = "construction";
  const schedule = evaluateSchedule(a, b);
  if (!schedule) return t;
  t.detail.schedule = schedule;
  if (t.level === "confirmed" || t.level === "no-match" || !schedule.confirmed) return t;
  const o = schedule.overlap!;
  return {
    level: "confirmed",
    reason: `Published schedules overlap (start → in-service) for ${durationText(schedule.days)} (${formatSpan(o, "month")}); field-work dates are not published.${gapNote(t.detail.inService)}`,
    detail: { ...t.detail, basis: "schedule", confirmedOverlap: o },
  };
}

/**
 * Reported-window overlap test from plan.md §8.
 *
 * Each window is start ∈ [S_earliest, S_latest], end ∈ [E_earliest, E_latest].
 *   confirmed: max(S_latest_A, S_latest_B) ≤ min(E_earliest_A, E_earliest_B)  (and both phases continuous)
 *   possible:  max(S_earliest_A, S_earliest_B) ≤ min(E_latest_A, E_latest_B)
 * A source may publish several component windows (e.g. substation vs line work): a source-pair
 * overlaps if any of its components do. Different sources are alternative claims: the result is
 * confirmed only if every source combination confirms, possible if any overlaps, no-match if none.
 * Missing windows yield "unknown", never "no overlap".
 */
function evaluateConstruction(a: Project, b: Project): TimeResult {
  const ga = windowsBySource(a);
  const gb = windowsBySource(b);
  const wa = ga.flat();
  const wb = gb.flat();
  const base: TimeDetail = {
    combinations: ga.length * gb.length,
    confirmedCombinations: 0,
    possibleCombinations: 0,
    windowIdsA: wa.map((w) => w.id),
    windowIdsB: wb.map((w) => w.id),
    precision: coarsest([...wa, ...wb]),
    continuityCaveat: false,
    inService: inServiceGap(a, b),
  };
  const gap = gapNote(base.inService);

  if (!wa.length || !wb.length) {
    const missing = [!wa.length ? displayTitle(a) : null, !wb.length ? displayTitle(b) : null].filter(Boolean).join(" and ");
    return {
      level: "unknown",
      reason: `No construction window published for ${missing}; window overlap is unknown, not ruled out.${gap}`,
      detail: base,
    };
  }

  let possibleStart: string | undefined;
  let possibleEnd: string | undefined;
  let coreStart: string | undefined;
  let coreEnd: string | undefined;
  for (const xs of ga) {
    for (const ys of gb) {
      let level: "confirmed" | "possible" | "none" = "none";
      let comboCoreStart: string | undefined;
      let comboCoreEnd: string | undefined;
      for (const x of xs) {
        for (const y of ys) {
          const hs = max(x.start.latest, y.start.latest);
          const he = min(x.end.earliest, y.end.earliest);
          const hard = hs <= he;
          const soft = max(x.start.earliest, y.start.earliest) <= min(x.end.latest, y.end.latest);
          if (!soft) continue; // hard ⊂ soft for well-formed windows; malformed ones never count
          if (hard && x.continuous && y.continuous) {
            level = "confirmed";
            comboCoreStart = comboCoreStart ? min(comboCoreStart, hs) : hs;
            comboCoreEnd = comboCoreEnd ? max(comboCoreEnd, he) : he;
          } else {
            if (level === "none") level = "possible";
            if (hard) base.continuityCaveat = true;
          }
          if (soft) {
            const s0 = max(x.start.earliest, y.start.earliest);
            const e0 = min(x.end.latest, y.end.latest);
            possibleStart = possibleStart ? min(possibleStart, s0) : s0;
            possibleEnd = possibleEnd ? max(possibleEnd, e0) : e0;
          }
        }
      }
      if (level === "confirmed") {
        base.confirmedCombinations++;
        coreStart = coreStart ? max(coreStart, comboCoreStart!) : comboCoreStart;
        coreEnd = coreEnd ? min(coreEnd, comboCoreEnd!) : comboCoreEnd;
      } else if (level === "possible") base.possibleCombinations++;
    }
  }
  if (possibleStart && possibleEnd) base.possibleOverlap = { start: possibleStart, end: possibleEnd };

  const n = base.combinations;
  const combos = n === 1 ? "" : ` under all ${n} source combinations`;

  if (base.confirmedCombinations === n) {
    if (coreStart && coreEnd && coreStart <= coreEnd) base.confirmedOverlap = { start: coreStart, end: coreEnd };
    return {
      level: "confirmed",
      reason: `Reported construction windows overlap in ${formatSpan(base.confirmedOverlap ?? base.possibleOverlap!, base.precision)}${combos}.${gap}`,
      detail: base,
    };
  }

  if (base.confirmedCombinations + base.possibleCombinations > 0) {
    const why = base.continuityCaveat
      ? "a source does not describe one continuous construction phase"
      : base.confirmedCombinations > 0
        ? `${base.confirmedCombinations} of ${n} source combinations overlap for certain`
        : `overlap depends on where ${precisionLabel(base.precision)}-precision dates fall`;
    return {
      level: "possible",
      reason: `Construction windows may overlap (${formatSpan(base.possibleOverlap!, base.precision)}); ${why}.${gap}`,
      detail: base,
    };
  }

  const aEnd = wa.map((w) => w.end.latest).reduce(max);
  const bEnd = wb.map((w) => w.end.latest).reduce(max);
  const [first, second] = aEnd <= bEnd ? [a, b] : [b, a];
  const all = [...wa, ...wb];
  // DESC budget-year windows (not continuous, phase unknown) and GPC Start→Need bounds are derived bounds, not published construction dates;
  // a source may still publish a construction start (Dominion "Q1 2025 … construction … begin") whose end is only bounded
  const derived = all.some((w) => w.boundsOnly || !w.continuous || w.phase !== "general-construction");
  const somePublished = all.some((w) => w.phase === "general-construction");
  const lead = !derived
    ? "Published construction windows do not overlap"
    : somePublished
      ? "Schedule bounds do not overlap (construction dates are only partly published; budget years, start-to-need dates or in-service dates bound the rest)"
      : "Schedule bounds do not overlap (budget years or start-to-need-date bounds; no construction dates are published)";
  return {
    level: "no-match",
    reason: `${lead}: ${displayTitle(first)}'s window ends before ${displayTitle(second)}'s begins.${gap}`,
    detail: base,
  };
}
