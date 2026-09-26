import { SNAPSHOT } from "@/lib/data/snapshot";
import { runMatching } from "@/lib/matching/engine";

/** Every id in any `…evidenceIds` array under a value (match, projects), however deeply nested. */
function evidenceIdsIn(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => evidenceIdsIn(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (/evidenceids$/i.test(k) && Array.isArray(x)) x.forEach((id) => typeof id === "string" && out.add(id));
      else evidenceIdsIn(x, out);
    }
  return out;
}

/** One fully joined pair: reasons, precision, source claims and known-coordination status, with every cited excerpt. */
export async function GET(req: Request, ctx: RouteContext<"/api/matches/[id]">) {
  const { id } = await ctx.params;
  const threshold = Number(new URL(req.url).searchParams.get("threshold") ?? 25);
  const run = runMatching(SNAPSHOT, { thresholdMiles: Number.isFinite(threshold) ? threshold : 25, listExclusions: false });
  const match = run.matches.find((m) => m.id === id);
  if (!match) return Response.json({ error: "No candidate pair with that id in this run" }, { status: 404 });

  const projects = [match.projectAId, match.projectBId].map((pid) => SNAPSHOT.projects.find((p) => p.id === pid)!);
  // relations, places, superseded claims and conflict sides cite excerpts that match.evidenceIds does not list
  const relations = SNAPSHOT.relations.filter((r) => match.geoDetail.relationIds.includes(r.id));
  const ids = evidenceIdsIn([match, projects, relations]);
  const evidence = Object.fromEntries([...ids].filter((e) => SNAPSHOT.evidence[e]).map((e) => [e, SNAPSHOT.evidence[e]]));
  const sourceIds = new Set(Object.values(evidence).map((e) => e.sourceId));
  for (const p of projects) p.sourceIds.forEach((s) => sourceIds.add(s));
  return Response.json({
    match,
    projects,
    relations,
    utilities: SNAPSHOT.utilities.filter((u) => projects.some((p) => p.owners.some((o) => o.utilityId === u.id))),
    evidence,
    sources: SNAPSHOT.sources.filter((s) => sourceIds.has(s.id)),
    snapshotDate: SNAPSHOT.snapshotDate,
    engineVersion: run.engineVersion,
  });
}
