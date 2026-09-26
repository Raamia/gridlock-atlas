import { IDX } from "@/lib/data";
import type { DateBound, Match } from "@/lib/domain/types";

const cell = (v: string | number | undefined | null) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A date bound as the source stated it: the day, or "earliest..latest (precision)" for coarser claims. */
const bound = (b: DateBound) => (b.precision === "day" && b.earliest === b.latest ? b.earliest : `${b.earliest}..${b.latest} (${b.precision})`);

/**
 * The flagged pairs as the sponsor's overlap table (Projects_Overlaps.xlsx → "overlaps" sheet columns),
 * followed by GridLock's own columns. Rows are in global priority order (priority_rank); queue_rank is the
 * card number within the pair's review_status tab when no queue filters are active. project_id_* are the
 * app's unique ids (pair_id opens the pair at /?pair=…); docket_* keep the plan's own labels.
 * time_gap (day) is exact only when time_gap_basis is "exact": "at-least" is the gap between the nearest
 * edges of coarse (year/quarter/month) dates, and "ranges-overlap" means the stated ranges overlap (0).
 */
export function overlapTableCsv(matches: Match[]): string {
  const head = [
    "overlap_id",
    "distance_mi",
    "time_gap (day)",
    "utility_a",
    "project_id_a",
    "project_name_a",
    "utility_b",
    "project_id_b",
    "project_name_b",
    "priority_rank",
    "queue_rank",
    "priority",
    "geo_signal",
    "geo_method",
    "time_signal",
    "review_status",
    "source_conflicts",
    "time_gap_basis",
    "in_service_a",
    "in_service_b",
    "docket_a",
    "docket_b",
    "pair_id",
  ];
  const perTab: Record<string, number> = {};
  const rows = matches.map((m, i) => {
    const a = IDX.project(m.projectAId);
    const b = IDX.project(m.projectBId);
    const util = (p: typeof a) => p.owners.map((o) => IDX.utility(o.utilityId)?.name ?? o.utilityId).join(" + ");
    const g = m.timeDetail.inService;
    const queueRank = (perTab[m.reviewStatus] = (perTab[m.reviewStatus] ?? 0) + 1);
    return [
      `OVL_${i + 1}`,
      m.geoDetail.center ? m.geoDetail.center.miles.toFixed(2) : "",
      g?.gapDays ?? "",
      util(a),
      a.id,
      a.title,
      util(b),
      b.id,
      b.title,
      i + 1,
      queueRank,
      m.priority,
      m.geo,
      m.geoDetail.method,
      m.time,
      m.reviewStatus,
      m.conflicts.length,
      g ? (!g.coarse ? "exact" : g.gapDays === 0 ? "ranges-overlap" : "at-least") : "",
      g ? bound(g.boundA) : "",
      g ? bound(g.boundB) : "",
      a.docketId ?? "",
      b.docketId ?? "",
      m.id,
    ]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n") + "\n";
}
