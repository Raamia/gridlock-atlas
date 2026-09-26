/**
 * Data audit (plan.md §12.2): every displayed fact has resolvable evidence, every excerpt exists
 * verbatim in the cached source text, every cited source has a hash, and featured pairs behave.
 *
 *   npx tsx scripts/audit-data.ts        exits 1 on any hard failure
 */
import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "../lib/domain/types";
import { runMatching } from "../lib/matching/engine";
import { locate, ROOT } from "./source-cache";

const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshot.json"), "utf8")) as Snapshot;
const fail: string[] = [];
const warn: string[] = [];

const sources = new Map(snap.sources.map((s) => [s.id, s]));
for (const s of snap.sources) {
  if (!/^[0-9a-f]{64}$/.test(s.sha256)) fail.push(`source ${s.id}: missing sha256`);
  if (!s.url.startsWith("http")) fail.push(`source ${s.id}: no public URL`);
}

let cacheMissing = 0;
for (const e of Object.values(snap.evidence)) {
  if (!sources.has(e.sourceId)) fail.push(`evidence ${e.id}: unknown source ${e.sourceId}`);
  if (e.exactExcerpt.split(/\s+/).length > 60) warn.push(`evidence ${e.id}: excerpt longer than 60 words`);
  const loc = locate(e.sourceId, e.exactExcerpt);
  if (loc.status === "no-cache") {
    cacheMissing++;
    // without the cache we can only trust the build-time check — and must not trust anything it did not pass
    if (!e.verifiedInSource) fail.push(`evidence ${e.id}: not verified at build time and no cache to re-check`);
  }
  else if (loc.status === "not-found") fail.push(`evidence ${e.id}: excerpt not in ${e.sourceId}: "${e.exactExcerpt.slice(0, 60)}…"`);
  else if (!e.verifiedInSource) warn.push(`evidence ${e.id}: located now but flagged unverified in snapshot (rebuild)`);
}

const has = (ids: string[] | undefined) => (ids ?? []).some((id) => snap.evidence[id]);
for (const p of snap.projects) {
  if (!has(p.titleEvidenceIds)) fail.push(`${p.id}: title has no evidence`);
  if (!p.owners.every((o) => has(o.evidenceIds))) fail.push(`${p.id}: an owner has no evidence`);
  if (!has(p.status.evidenceIds)) fail.push(`${p.id}: status has no evidence`);
  for (const w of p.constructionWindows) if (!has(w.evidenceIds)) fail.push(`${p.id}: window ${w.id} has no evidence`);
  for (const c of p.completionClaims) if (!has(c.evidenceIds)) fail.push(`${p.id}: completion ${c.id} has no evidence`);
  // absence claims ("not found in sources") are notes, not facts; documented coordination needs a quote
  for (const c of p.knownCoordination) {
    if ((c.status === "known-joint" || c.status === "reported-coordination") && !has(c.evidenceIds)) fail.push(`${p.id}: coordination claim has no evidence`);
  }
  for (const pl of p.places) {
    if (!pl.coordinateSource) fail.push(`${p.id}: place ${pl.label} has no coordinate source`);
    if (!Number.isFinite(pl.lat) || !Number.isFinite(pl.lon)) fail.push(`${p.id}: place ${pl.label} has no coordinates`);
  }
  if (p.route && p.route.precision !== "official-gis" && !/schematic|approximate|not survey/i.test(p.route.caveat)) {
    fail.push(`${p.id}: digitized route lacks an approximate/schematic caveat`);
  }
  for (const f of p.facts) if (!has(f.evidenceIds)) fail.push(`${p.id}: fact "${f.label}" has no evidence`);
  for (const c of p.counties) if (!has(c.evidenceIds)) fail.push(`${p.id}: county ${c.name} has no evidence`);
}
for (const r of snap.relations) if (!has(r.evidenceIds)) fail.push(`relation ${r.id}: no evidence`);

const run = runMatching(snap, { now: "audit", listExclusions: false });
const find = (a: string, b: string) => run.matches.find((m) => [m.projectAId, m.projectBId].sort().join() === [a, b].sort().join());
const featured = find("dpc-alma-blair", "xcel-wwtc");
if (snap.projects.some((p) => p.id === "dpc-alma-blair") && snap.projects.some((p) => p.id === "xcel-wwtc")) {
  if (!featured) fail.push("featured pair Dairyland × Xcel WWTC not flagged");
  else if (featured.reviewStatus !== "known-coordination") fail.push(`featured pair status is ${featured.reviewStatus}, expected known-coordination`);
}
for (const m of run.matches) {
  if (m.reviewStatus === "needs-review" && m.coordination.some((c) => c.scope === "resource-sharing")) fail.push(`${m.id}: needs-review but resource sharing documented`);
}

const verified = Object.values(snap.evidence).filter((e) => e.verifiedInSource).length;
const total = Object.keys(snap.evidence).length;
console.log(`snapshot ${snap.version}: ${snap.projects.length} projects, ${snap.sources.length} sources, ${total} excerpts (${verified} verbatim-verified)`);
console.log(`engine: ${run.pairsEvaluated} pairs evaluated → ${run.matches.length} candidates`);
if (cacheMissing)
  console.log(`note: source cache absent for ${cacheMissing} excerpts — relied on build-time verification (run npm run sources:fetch for a full re-check)`);
for (const w of warn.slice(0, 20)) console.log(`warn  ${w}`);
for (const f of fail) console.log(`FAIL  ${f}`);
console.log(fail.length ? `\n${fail.length} failures` : "\naudit passed");
process.exit(fail.length ? 1 : 0);
