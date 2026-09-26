import type { ConstructionWindow, DateBound, Project, SignalLevel, TimeDetail } from "@/lib/domain/types";
import { formatSpan } from "@/lib/format";

const PRECISION_RANK: Record<DateBound["precision"], number> = { day: 0, month: 1, quarter: 2, year: 3 };

/** Construction-phase windows that are still current (superseded claims are kept for history only). */
export function activeWindows(project: Project): ConstructionWindow[] {
  return project.constructionWindows.filter((w) => !w.supersededBy && w.phase !== "preconstruction");
}

function coarsest(windows: ConstructionWindow[]): DateBound["precision"] {
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

/** The current in-service / need date claim (claims are stored current-first by the snapshot builder). */
export function currentInService(p: Project) {
  return p.completionClaims.find((c) => IN_SERVICE.test(c.label)) ?? p.completionClaims[0];
}

const DAY = 86_400_000;
function inServiceGap(a: Project, b: Project): TimeDetail["inService"] {
  const x = currentInService(a);
  const y = currentInService(b);
  if (!x || !y) return undefined;
  const gap = Math.round(Math.abs(Date.parse(x.date.earliest) - Date.parse(y.date.earliest)) / DAY);
  return { a: x.date.earliest, b: y.date.earliest, gapDays: gap, labelA: x.label, labelB: y.label };
}

export interface TimeResult {
  level: SignalLevel;
  reason: string;
  detail: TimeDetail;
}

/**
 * Reported-window overlap test from plan.md §8.
 *
 * Each window is start ∈ [S_earliest, S_latest], end ∈ [E_earliest, E_latest].
 *   confirmed: max(S_latest_A, S_latest_B) ≤ min(E_earliest_A, E_earliest_B)
 *   possible:  max(S_earliest_A, S_earliest_B) ≤ min(E_latest_A, E_latest_B)
 * With several current claims per project we evaluate every combination:
 * confirmed only if all combinations confirm, possible if any overlap, no-match if none.
 * Missing windows yield "unknown", never "no overlap".
 */
export function evaluateTime(a: Project, b: Project): TimeResult {
  const wa = activeWindows(a);
  const wb = activeWindows(b);
  const base: TimeDetail = {
    combinations: wa.length * wb.length,
    confirmedCombinations: 0,
    possibleCombinations: 0,
    windowIdsA: wa.map((w) => w.id),
    windowIdsB: wb.map((w) => w.id),
    precision: coarsest([...wa, ...wb]),
    continuityCaveat: false,
    inService: inServiceGap(a, b),
  };
  const gapNote = base.inService ? ` In-service dates are ${base.inService.gapDays.toLocaleString("en-US")} days apart (secondary signal).` : "";

  if (!wa.length || !wb.length) {
    const missing = [!wa.length ? a.shortTitle : null, !wb.length ? b.shortTitle : null].filter(Boolean).join(" and ");
    return {
      level: "unknown",
      reason: `No construction window published for ${missing}; window overlap is unknown, not ruled out.${gapNote}`,
      detail: base,
    };
  }

  let possibleStart: string | undefined;
  let possibleEnd: string | undefined;
  for (const x of wa) {
    for (const y of wb) {
      const hardOverlap = max(x.start.latest, y.start.latest) <= min(x.end.earliest, y.end.earliest);
      const softOverlap = max(x.start.earliest, y.start.earliest) <= min(x.end.latest, y.end.latest);
      if (hardOverlap && x.continuous && y.continuous) base.confirmedCombinations++;
      else if (hardOverlap || softOverlap) {
        base.possibleCombinations++;
        if (hardOverlap) base.continuityCaveat = true;
      }
      if (softOverlap) {
        const s = max(x.start.earliest, y.start.earliest);
        const e = min(x.end.latest, y.end.latest);
        possibleStart = possibleStart ? min(possibleStart, s) : s;
        possibleEnd = possibleEnd ? max(possibleEnd, e) : e;
      }
    }
  }
  if (possibleStart && possibleEnd) base.possibleOverlap = { start: possibleStart, end: possibleEnd };

  const all = [...wa, ...wb];
  const n = base.combinations;
  const combos = n === 1 ? "" : ` under all ${n} published claim combinations`;

  if (base.confirmedCombinations === n) {
    const coreStart = all.map((w) => w.start.latest).reduce(max);
    const coreEnd = all.map((w) => w.end.earliest).reduce(min);
    if (coreStart <= coreEnd) base.confirmedOverlap = { start: coreStart, end: coreEnd };
    return {
      level: "confirmed",
      reason: `Both reported construction windows cover ${formatSpan(base.possibleOverlap!, base.precision)}${combos}.${gapNote}`,
      detail: base,
    };
  }

  if (base.confirmedCombinations + base.possibleCombinations > 0) {
    const why = base.continuityCaveat
      ? "a source does not describe one continuous construction phase"
      : base.confirmedCombinations > 0
        ? `${base.confirmedCombinations} of ${n} claim combinations overlap for certain`
        : `overlap depends on where ${base.precision}-precision dates fall`;
    return {
      level: "possible",
      reason: `Construction windows may overlap (${formatSpan(base.possibleOverlap!, base.precision)}); ${why}.${gapNote}`,
      detail: base,
    };
  }

  const aEnd = wa.map((w) => w.end.latest).reduce(max);
  const bEnd = wb.map((w) => w.end.latest).reduce(max);
  const [first, second] = aEnd <= bEnd ? [a, b] : [b, a];
  return {
    level: "no-match",
    reason: `Published construction windows do not overlap: ${first.shortTitle} ends before ${second.shortTitle} starts.${gapNote}`,
    detail: base,
  };
}
