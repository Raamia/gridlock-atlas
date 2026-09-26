import type { NextRequest } from "next/server";
import { SNAPSHOT } from "@/lib/data/snapshot";
import { runMatching } from "@/lib/matching/engine";

/**
 * Runs the deterministic comparison engine over the frozen snapshot.
 * Optional filters narrow the result but never silently drop TIME-only candidates:
 * `flag` must be requested explicitly to filter by signal.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const threshold = Number(q.get("threshold") ?? 25);
  const thresholdMiles = Number.isFinite(threshold) ? Math.min(250, Math.max(1, threshold)) : 25;
  const run = runMatching(SNAPSHOT, { thresholdMiles, listExclusions: false });

  const utilityA = q.get("utilityA");
  const utilityB = q.get("utilityB");
  const region = q.get("region");
  const year = q.get("year");
  const owners = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)?.owners.map((o) => o.utilityId) ?? [];
  const regionOf = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)?.region;

  run.matches = run.matches.filter((m) => {
    const oa = owners(m.projectAId);
    const ob = owners(m.projectBId);
    if (utilityA && !oa.includes(utilityA) && !ob.includes(utilityA)) return false;
    if (utilityB && !oa.includes(utilityB) && !ob.includes(utilityB)) return false;
    if (region && regionOf(m.projectAId) !== region && regionOf(m.projectBId) !== region) return false;
    if (year) {
      const o = m.timeDetail.possibleOverlap;
      if (!o || o.start.slice(0, 4) > year || o.end.slice(0, 4) < year) return false;
    }
    return true;
  });

  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
