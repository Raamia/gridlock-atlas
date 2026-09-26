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
import { facilityWords } from "../lib/matching/geo";
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
  // public-disclosure documents carry CEII banners; a quote must never reproduce one
  if (/\bCEII\b|critical energy infrastructure/i.test(e.exactExcerpt)) fail.push(`evidence ${e.id}: excerpt quotes a CEII label`);
  const loc = locate(e.sourceId, e.exactExcerpt);
  if (loc.status === "no-cache") {
    cacheMissing++;
    // without the cache we can only trust the build-time check — and must not trust anything it did not pass
    if (!e.verifiedInSource) fail.push(`evidence ${e.id}: not verified at build time and no cache to re-check`);
  }
  else if (loc.status === "not-found") fail.push(`evidence ${e.id}: excerpt not in ${e.sourceId}: "${e.exactExcerpt.slice(0, 60)}…"`);
  else if (!e.verifiedInSource) warn.push(`evidence ${e.id}: located now but flagged unverified in snapshot (rebuild)`);
}

// model-extraction runs: a field marked "located" must still be found verbatim in its source; runs never add facts
let extractionFields = 0;
for (const r of snap.extractionRuns) {
  if (!sources.has(r.sourceId)) warn.push(`extraction ${r.id}: source ${r.sourceId} is not in the registry`);
  for (const f of r.fields.filter((f) => f.located)) {
    extractionFields++;
    const loc = f.excerpt ? locate(r.sourceId, f.excerpt) : { status: "not-found" as const };
    if (loc.status === "not-found") fail.push(`extraction ${r.id}: ${f.field} is marked located but its excerpt is not in ${r.sourceId}`);
  }
}

const has = (ids: string[] | undefined) => (ids ?? []).some((id) => snap.evidence[id]);
for (const p of snap.projects) {
  if (!has(p.titleEvidenceIds)) fail.push(`${p.id}: title has no evidence`);
  if (!p.owners.every((o) => has(o.evidenceIds))) fail.push(`${p.id}: an owner has no evidence`);
  if (!has(p.status.evidenceIds)) fail.push(`${p.id}: status has no evidence`);
  for (const w of p.constructionWindows) if (!has(w.evidenceIds)) fail.push(`${p.id}: window ${w.id} has no evidence`);
  // a DESC budget-year window cites the budget cells it is built from: its start year and, for openStart, the 'Previous' column
  for (const w of p.constructionWindows.filter((w) => w.claimSourceId.startsWith("desc-scrtp") && w.phase === "unknown")) {
    const y = w.start.latest.slice(0, 4);
    const ex = w.evidenceIds.map((id) => snap.evidence[id]?.exactExcerpt ?? "");
    if (!ex.some((x) => new RegExp(`(^|\\s)${y}(\\s|$)`).test(x))) fail.push(`${p.id}: budget window ${w.id} cites no ${y} amount`);
    if (w.openStart && !ex.some((x) => x.includes("Previous"))) fail.push(`${p.id}: budget window ${w.id} cites no 'Previous' amount`);
  }
  // a published schedule starts from a published start (GPC Start Date) or spending (DESC), never from an in-service date alone
  for (const w of p.constructionWindows.filter((w) => w.phase === "scheduled")) {
    const ex = w.evidenceIds.map((id) => snap.evidence[id]?.exactExcerpt ?? "");
    if (!ex.some((x) => /Start Date|Previous|\$\d/.test(x))) fail.push(`${p.id}: schedule ${w.id} cites no start (Start Date or spending)`);
  }
  for (const d of p.disagreements ?? []) for (const side of d.sides) if (!has(side.evidenceIds)) fail.push(`${p.id}: ${d.field} disagreement side "${side.value}" has no evidence`);
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
for (const n of snap.contextNotes ?? []) if (!n.evidenceIds.every((id) => snap.evidence[id]?.verifiedInSource)) fail.push(`context note ${n.id}: an excerpt is not verified`);
// the sponsor asked teams to check for a newer source: the Savannah River corpus must carry that check, cited
if (snap.regions.some((r) => r.id === "southeast") && !snap.contextNotes?.some((n) => n.id === "newest-source-check-desc")) fail.push("southeast: newest-source check note missing");

// data quality: one facility name, one place — a name geocoded to points far apart is either two facilities or an error
const byName = new Map<string, { id: string; lat: number; lon: number }[]>();
for (const p of snap.projects)
  for (const pl of p.places.filter((x) => x.precision === "named-facility")) {
    const name = pl.detail ?? pl.label;
    const key = `${p.region}|${name.toLowerCase().replace(/[^a-z0-9()]+/g, " ").trim()}|${facilityWords(pl.label)}`;
    byName.set(key, [...(byName.get(key) ?? []), { id: `${p.id}/${pl.id}`, lat: pl.lat, lon: pl.lon }]);
  }
const mi = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  3958.8 * 2 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * Math.PI) / 360) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(((b.lon - a.lon) * Math.PI) / 360) ** 2));
for (const [key, pts] of byName)
  for (const x of pts.slice(1)) if (mi(pts[0], x) > 0.3) warn.push(`place name "${key.split("|")[1]}" geocoded ${mi(pts[0], x).toFixed(2)} mi apart: ${pts[0].id} vs ${x.id}`);

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
if (snap.extractionRuns.length) console.log(`extraction: ${snap.extractionRuns.length} model runs, ${extractionFields} located fields re-checked`);
if (cacheMissing)
  console.log(`note: source cache absent for ${cacheMissing} excerpts — relied on build-time verification (run npm run sources:fetch for a full re-check)`);
for (const w of warn.slice(0, 20)) console.log(`warn  ${w}`);
for (const f of fail) console.log(`FAIL  ${f}`);
console.log(fail.length ? `\n${fail.length} failures` : "\naudit passed");
process.exit(fail.length ? 1 : 0);
