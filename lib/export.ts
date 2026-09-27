import { IDX, SNAPSHOT } from "@/lib/data";
import type { DateBound, ExcludedProject, Match, MatchRun, Place, Project } from "@/lib/domain/types";
import { precisionLabel } from "@/lib/format";
import { centerOf } from "@/lib/matching/geo";
import { currentInService } from "@/lib/matching/time";
import { beyondRuleReason, sponsorOverlaps, sponsorRows, withinSponsorRule } from "@/lib/sponsor";

const cell = (v: string | number | undefined | null) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (head: string[], rows: (string | number | undefined | null)[][]) => [head.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";

/** A date bound as the source stated it: the day, or "earliest..latest (precision)" for coarser claims. */
const bound = (b: DateBound) => (b.precision === "day" && b.earliest === b.latest ? b.earliest : `${b.earliest}..${b.latest} (${precisionLabel(b.precision)})`);
const utilityOf = (p: Project) => p.owners.map((o) => IDX.utility(o.utilityId)?.name ?? o.utilityId).join(" + ");
const confidenceOf = (pl?: Place) => (!pl ? "" : pl.precision === "locality" ? "town-level" : pl.confidence === "lower-confidence" ? "lower-confidence" : "confirmed");

/** The sponsor's overlap-table columns (Projects_Overlaps.xlsx → "overlaps" sheet), exactly. */
export const SPONSOR_OVERLAP_HEAD = ["overlap_id", "distance_mi", "time_gap (day)", "utility_a", "project_id_a", "project_name_a", "utility_b", "project_id_b", "project_name_b"];
/** The sponsor's project-table columns (Projects_Overlaps.xlsx → "projects" sheet) before the overlap_1..n columns. */
export const SPONSOR_PROJECT_HEAD = ["project_id", "utility", "state", "project_name", "name_a", "lat_a", "lon_a", "name_b", "lat_b", "lon_b", "lat_center", "lon_center", "in_service_date", "overlap_count"];

/**
 * The overlap table in the sponsor's columns, followed by Atlas's own.
 *
 * sponsorOnly: exactly the challenge rule — pairs whose closest project points are under 25 mi apart, closest first, numbered
 * OVL_1… in that order (as in the starter file). Otherwise every flagged pair in priority order: rows inside the rule keep
 * their OVL id, the others are EXT_n with the reason they were flagged anyway (sponsor_rule, beyond_rule_reason).
 *
 * priority_rank is the pair's place in the given (priority) order; queue_rank is its card number within its review_status
 * tab when no queue filters are active. project_id_* are the app's unique ids; pair_id opens the pair at /?pair=… (plus
 * &r=<review_radius_mi> when the radius is not 25); docket_* keep the plan's own labels. location_confidence is the weakest
 * point behind the two project geometries. time_gap (day) is exact only when time_gap_basis is "exact": "at-least" is the gap between
 * the nearest edges of coarse (year/half-year/quarter/month) dates, and "ranges-overlap" means the stated ranges overlap (0).
 * in_service_a/b are each project's current in-service claim whenever one is published, even when the other side's is not
 * (then time_gap and time_gap_basis are blank).
 */
export function overlapTableCsv(matches: Match[], opts: { sponsorOnly?: boolean } = {}): string {
  const head = [
    ...SPONSOR_OVERLAP_HEAD,
    "priority_rank",
    "queue_rank",
    "priority",
    "geo_signal",
    "geo_method",
    "coordination_tier",
    "distance_basis_a",
    "distance_basis_b",
    "distance_estimated",
    "legacy_center_distance_mi",
    "location_confidence",
    "review_radius_mi",
    "time_signal",
    "review_status",
    "source_conflicts",
    "time_gap_basis",
    "in_service_a",
    "in_service_b",
    "docket_a",
    "docket_b",
    "pair_id",
    ...(opts.sponsorOnly ? [] : ["sponsor_rule", "beyond_rule_reason"]),
  ];
  const perTab: Record<string, number> = {};
  const ranks = new Map(matches.map((m, i) => [m.id, { priority: i + 1, queue: (perTab[m.reviewStatus] = (perTab[m.reviewStatus] ?? 0) + 1) }]));
  const rule = sponsorRows(matches);
  const ovl = new Map(rule.map((m, i) => [m.id, `OVL_${i + 1}`]));
  let ext = 0;
  const rows = (opts.sponsorOnly ? rule : matches).map((m) => {
    const a = IDX.project(m.projectAId);
    const b = IDX.project(m.projectBId);
    const g = m.timeDetail.inService;
    const c = m.geoDetail.closest;
    const weakest = !c ? "" : c.anyLocality ? "town-level" : c.lowConfidence ? "lower-confidence" : "confirmed";
    return [
      ovl.get(m.id) ?? `EXT_${++ext}`,
      c ? c.miles.toFixed(2) : "",
      g?.gapDays ?? "",
      utilityOf(a),
      a.id,
      a.title,
      utilityOf(b),
      b.id,
      b.title,
      ranks.get(m.id)!.priority,
      ranks.get(m.id)!.queue,
      m.priority,
      m.geo,
      m.geoDetail.method,
      c?.tier ?? "",
      c?.basisA ?? "",
      c?.basisB ?? "",
      c?.approximate ? "yes" : "no",
      m.geoDetail.center?.miles.toFixed(2) ?? "",
      weakest,
      m.geoDetail.thresholdMiles,
      m.time,
      m.reviewStatus,
      m.conflicts.length,
      g ? (!g.coarse ? "exact" : g.gapDays === 0 ? "ranges-overlap" : "at-least") : "",
      // the same claims the gap is computed from (inServiceGap reads currentInService)
      ...[a, b].map((p) => {
        const isd = currentInService(p);
        return isd ? bound(isd.date) : "";
      }),
      a.docketId ?? "",
      b.docketId ?? "",
      m.id,
      ...(opts.sponsorOnly ? [] : [withinSponsorRule(m) ? "yes" : "no", beyondRuleReason(m, SNAPSHOT.relations) ?? ""]),
    ];
  });
  return csv(head, rows);
}

/**
 * The project table in the sponsor's columns (Projects_Overlaps.xlsx → "projects" sheet), then Atlas's own. name_a/name_b
 * are the two points the engine centers the project on (its two named terminals, or its one located point) and
 * lat_center/lon_center follow the starter file's formula. overlap_1..n are partner project ids in the order of the
 * sponsor-format overlap table (overlap_ids gives those rows' OVL ids), so only pairs under 25 mi count. engine_status is
 * "eligible" or why the engine set the project aside (e.g. past-in-service: the planned date passed, completion unconfirmed).
 */
export function projectTableCsv(projects: Project[], matches: Match[], excluded: ExcludedProject[] = []): string {
  const overlaps = sponsorOverlaps(matches);
  const k = Math.max(3, ...projects.map((p) => overlaps.get(p.id)?.length ?? 0));
  const status = new Map(excluded.map((x) => [x.projectId, x.reason]));
  const head = [
    ...SPONSOR_PROJECT_HEAD,
    ...Array.from({ length: k }, (_, i) => `overlap_${i + 1}`),
    "overlap_ids",
    "location_confidence_a",
    "location_confidence_b",
    "coordinate_source_a",
    "coordinate_source_b",
    "in_service_source",
    "engine_status",
    "docket",
  ];
  const num = (v: number) => String(+v.toFixed(7));
  const rows = [...projects]
    .sort((x, y) => utilityOf(x).localeCompare(utilityOf(y)) || x.id.localeCompare(y.id))
    .map((p) => {
      const c = centerOf(p);
      const [x, y] = c?.places ?? [];
      const isd = currentInService(p);
      const ov = overlaps.get(p.id) ?? [];
      const point = (pl?: Place) => (pl ? [pl.label, pl.lat, pl.lon] : ["", "", ""]);
      return [
        p.id,
        utilityOf(p),
        p.states.join(" / "),
        p.title,
        ...point(x),
        ...point(y),
        c ? num(c.lonlat[1]) : "",
        c ? num(c.lonlat[0]) : "",
        isd ? bound(isd.date) : "",
        ov.length,
        ...Array.from({ length: k }, (_, i) => ov[i]?.partner ?? ""),
        ov.map((o) => o.overlapId).join(" "),
        confidenceOf(x),
        confidenceOf(y),
        x?.coordinateSource ?? "",
        y?.coordinateSource ?? "",
        isd ? (IDX.source(isd.claimSourceId)?.title ?? isd.claimSourceId) : "",
        status.get(p.id) ?? "eligible",
        p.docketId ?? "",
      ];
    });
  return csv(head, rows);
}

/** The three CSV exports for the region on screen (region "all": every region): file name, row count and contents. */
export function regionExports(run: MatchRun, region: string) {
  const inRegion = (id: string) => region === "all" || IDX.project(id)?.region === region;
  const matches = run.matches.filter((m) => inRegion(m.projectAId));
  const projects = SNAPSHOT.projects.filter((p) => inRegion(p.id));
  const tag = `${region}${run.thresholdMiles !== 25 ? `-${run.thresholdMiles}mi` : ""}`;
  return {
    overlaps: { name: `atlas-overlaps-${tag}.csv`, rows: sponsorRows(matches).length, csv: () => overlapTableCsv(matches, { sponsorOnly: true }) },
    flagged: { name: `atlas-flagged-pairs-${tag}.csv`, rows: matches.length, csv: () => overlapTableCsv(matches) },
    projects: { name: `atlas-projects-${tag}.csv`, rows: projects.length, csv: () => projectTableCsv(projects, matches, run.excludedProjects) },
  };
}
