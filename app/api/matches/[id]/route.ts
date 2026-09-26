import { SNAPSHOT } from "@/lib/data/snapshot";
import { runMatching } from "@/lib/matching/engine";

/** One fully joined pair: reasons, precision, source claims and known-coordination status. */
export async function GET(req: Request, ctx: RouteContext<"/api/matches/[id]">) {
  const { id } = await ctx.params;
  const threshold = Number(new URL(req.url).searchParams.get("threshold") ?? 25);
  const run = runMatching(SNAPSHOT, { thresholdMiles: Number.isFinite(threshold) ? threshold : 25, listExclusions: false });
  const match = run.matches.find((m) => m.id === id);
  if (!match) return Response.json({ error: "No candidate pair with that id in this run" }, { status: 404 });

  const projects = [match.projectAId, match.projectBId].map((pid) => SNAPSHOT.projects.find((p) => p.id === pid)!);
  const evidence = Object.fromEntries(match.evidenceIds.map((e) => [e, SNAPSHOT.evidence[e]]));
  const sourceIds = new Set(Object.values(evidence).map((e) => e.sourceId));
  for (const p of projects) p.sourceIds.forEach((s) => sourceIds.add(s));
  return Response.json({
    match,
    projects,
    utilities: SNAPSHOT.utilities.filter((u) => projects.some((p) => p.owners.some((o) => o.utilityId === u.id))),
    evidence,
    sources: SNAPSHOT.sources.filter((s) => sourceIds.has(s.id)),
    snapshotDate: SNAPSHOT.snapshotDate,
    engineVersion: run.engineVersion,
  });
}
