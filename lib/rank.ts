import { IDX } from "@/lib/data";
import type { Match, MatchRun, ReviewStatus } from "@/lib/domain/types";

/**
 * One rank number everywhere (list row "#01", inspector "#01 of 95", Method "#N", CSV `queue_rank`).
 *
 * A pair's rank is its 1-based position within its review-status tab (`reviewStatus`), counted over the region's
 * UNFILTERED pairs in engine priority order (the order of `run.matches`). Filters, focus and the Utility select never
 * renumber rows: gaps (02, 03, 06…) are expected.
 *
 * Same semantics as `lib/export.ts` (`queue_rank`, computed over `regionExports(run, region)`'s matches) and
 * `lib/sponsor.ts` (`queueRank`, computed within the pair's own region); `tests/rank.test.ts` pins both equalities.
 * Region "all" numbers each tab across every region, exactly like `regionExports(run, "all")`.
 */

/** The three review-status tabs, in display order. */
export const REVIEW_TABS: readonly ReviewStatus[] = ["needs-review", "known-coordination", "possible"];

/** A tab id as the list uses it: a review status, or the legacy cross-cutting "conflicts" view. */
export type RankTab = ReviewStatus | "conflicts";

const regionOf = (projectId: string): string | undefined => IDX.project(projectId)?.region;

/** Whether a flagged pair belongs to the region on screen ("all" = every region). Pairs never cross regions. */
export function inRegion(m: Match, region: string): boolean {
  return region === "all" || regionOf(m.projectAId) === region;
}

interface RegionIndex {
  matches: Match[];
  ranks: Map<string, number>;
  totals: Record<ReviewStatus, number>;
  conflicts: number;
}

// runs are immutable once received; cache per run object and region so rows can call these freely
const cache = new WeakMap<MatchRun, Map<string, RegionIndex>>();

function indexRegion(run: MatchRun, region: string): RegionIndex {
  let byRegion = cache.get(run);
  if (!byRegion) cache.set(run, (byRegion = new Map()));
  const hit = byRegion.get(region);
  if (hit) return hit;
  const matches = run.matches.filter((m) => inRegion(m, region));
  const totals: Record<ReviewStatus, number> = { "needs-review": 0, "known-coordination": 0, possible: 0 };
  const ranks = new Map<string, number>();
  let conflicts = 0;
  for (const m of matches) {
    totals[m.reviewStatus] += 1;
    ranks.set(m.id, totals[m.reviewStatus]);
    if (m.conflicts.length > 0) conflicts++;
  }
  const idx = { matches, ranks, totals, conflicts };
  byRegion.set(region, idx);
  return idx;
}

/** matchId → 1-based rank within its review-status tab of the region's unfiltered list (engine priority order). */
export function queueRank(run: MatchRun, region: string): Map<string, number> {
  return indexRegion(run, region).ranks;
}

/** The rank of one pair in the region on screen, or undefined when the pair is not in that region's run. */
export function rankOf(run: MatchRun, region: string, matchId: string): number | undefined {
  return indexRegion(run, region).ranks.get(matchId);
}

/** "#01"-style label: at least two digits, mono in the UI. */
export function rankLabel(rank: number): string {
  return String(rank).padStart(2, "0");
}

/** Unfiltered pair count of a tab in the region ("conflicts" = pairs with any source conflict). */
export function tabTotal(run: MatchRun, region: string, tab: RankTab): number {
  const idx = indexRegion(run, region);
  return tab === "conflicts" ? idx.conflicts : idx.totals[tab];
}

/** Unfiltered counts of the three review-status tabs in the region. */
export function tabTotals(run: MatchRun, region: string): Record<ReviewStatus, number> {
  return { ...indexRegion(run, region).totals };
}

/** Every flagged pair of the region, unfiltered, in engine priority order. */
export function regionMatches(run: MatchRun, region: string): Match[] {
  return indexRegion(run, region).matches;
}

/** The first review-status tab with at least one pair in the region (Needs review when all are empty). */
export function firstNonEmptyTab(run: MatchRun, region: string): ReviewStatus {
  const totals = indexRegion(run, region).totals;
  return REVIEW_TABS.find((t) => totals[t] > 0) ?? "needs-review";
}
