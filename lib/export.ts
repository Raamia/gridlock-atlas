import { IDX } from "@/lib/data";
import type { Match } from "@/lib/domain/types";

const cell = (v: string | number | undefined | null) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The flagged pairs as the sponsor's overlap table (Projects_Overlaps.xlsx → "overlaps" sheet columns),
 * followed by GridLock's own columns. Rows keep the queue's ranking.
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
    "rank",
    "priority",
    "geo_signal",
    "geo_method",
    "time_signal",
    "review_status",
    "source_conflicts",
  ];
  const rows = matches.map((m, i) => {
    const a = IDX.project(m.projectAId);
    const b = IDX.project(m.projectBId);
    const util = (p: typeof a) => p.owners.map((o) => IDX.utility(o.utilityId)?.name ?? o.utilityId).join(" + ");
    return [
      `OVL_${i + 1}`,
      m.geoDetail.center ? m.geoDetail.center.miles.toFixed(2) : "",
      m.timeDetail.inService?.gapDays ?? "",
      util(a),
      a.docketId ?? a.id,
      a.title,
      util(b),
      b.docketId ?? b.id,
      b.title,
      i + 1,
      m.priority,
      m.geo,
      m.geoDetail.method,
      m.time,
      m.reviewStatus,
      m.conflicts.length,
    ]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n") + "\n";
}
