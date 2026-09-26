/**
 * Build data/snapshot.json from verified research clusters (data/research/*.json).
 *
 *   npx tsx scripts/build-snapshot.ts
 *
 * - merges source metadata from the fetch cache (sha256, retrieval time, pages)
 * - assigns stable evidence ids and RE-CHECKS every excerpt verbatim against cached text
 *   (the research agents' own "verified" flag is not trusted)
 * - normalizes projects/places/windows/relations into the app's domain model
 * - applies human review marks from data/review-log.json
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CompletionClaim,
  ConstructionWindow,
  CoordinationClaim,
  Evidence,
  ExtractionRun,
  ImpactAssumption,
  Place,
  Project,
  Region,
  Relation,
  Snapshot,
  SourceDocument,
} from "../lib/domain/types";
import { UTILITIES, UTILITY_ALIASES } from "../lib/data/utilities";
import { locate, readMeta, ROOT } from "./source-cache";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = any;

const SNAPSHOT_DATE = "2026-09-26";
const RESEARCH = path.join(ROOT, "data", "research");
const OVERRIDES = path.join(ROOT, "data", "overrides.json");
const REVIEW_LOG = path.join(ROOT, "data", "review-log.json");
const EXTRACTIONS = path.join(ROOT, "data", "extractions");

const overrides: {
  projectAliases?: Record<string, string>;
  drop?: string[];
  projectPatches?: Record<string, Partial<Project>>;
  windowPatches?: Record<string, Partial<ConstructionWindow>>;
} = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, "utf8")) : {};
const alias = (id: string) => overrides.projectAliases?.[id] ?? id;

const reviewed = new Set<string>(fs.existsSync(REVIEW_LOG) ? (JSON.parse(fs.readFileSync(REVIEW_LOG, "utf8")).reviewedEvidenceIds ?? []) : []);

const clusters: R[] = fs
  .readdirSync(RESEARCH)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(RESEARCH, f), "utf8")));

const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

/* --------------------------------- evidence --------------------------------- */

const evidence: Record<string, Evidence> = {};
const stats = { total: 0, found: 0, notFound: 0, noCache: 0 };

function ev(list: R[] | undefined): string[] {
  const ids: string[] = [];
  for (const e of list ?? []) {
    if (!e?.sourceId || !e?.exactExcerpt) continue;
    const excerpt = String(e.exactExcerpt).trim();
    const id = "ev-" + crypto.createHash("sha1").update(`${e.sourceId}|${e.page ?? ""}|${excerpt}`).digest("hex").slice(0, 12);
    if (!evidence[id]) {
      const loc = locate(e.sourceId, excerpt);
      stats.total++;
      let verified = false;
      let page: number | undefined = typeof e.page === "number" ? e.page : undefined;
      if (loc.status === "found") {
        stats.found++;
        verified = true;
        // trust the text, not the claim: if the cited page is wrong, anchor to where the excerpt is
        if (page !== undefined && !loc.pages.includes(page)) {
          const actual = loc.pages.find((p) => p !== null);
          warn(`page corrected ${e.sourceId} p.${page} -> p.${actual}: "${excerpt.slice(0, 50)}…"`);
          page = actual ?? page;
        }
      } else if (loc.status === "not-found") {
        stats.notFound++;
        warn(`excerpt NOT located in ${e.sourceId}: "${excerpt.slice(0, 70)}…"`);
      } else {
        stats.noCache++;
        warn(`no cached text for ${e.sourceId}`);
      }
      evidence[id] = {
        id,
        sourceId: e.sourceId,
        page,
        printedPage: e.printedPage || undefined,
        section: e.section || undefined,
        exactExcerpt: excerpt,
        supports: e.supports ?? "",
        extractionMethod: "agent-assisted",
        reviewedByHuman: reviewed.has(id),
        verifiedInSource: verified,
      };
    }
    ids.push(id);
  }
  return [...new Set(ids)];
}

/* ---------------------------------- sources ---------------------------------- */

const sources = new Map<string, SourceDocument>();
for (const c of clusters) {
  for (const s of c.sources ?? []) {
    const meta = readMeta(s.id);
    if (!meta) {
      warn(`source ${s.id} has no cache metadata; skipped`);
      continue;
    }
    const prev = sources.get(s.id);
    sources.set(s.id, {
      id: s.id,
      publisher: s.publisher || meta.publisher,
      title: s.title || meta.title,
      url: meta.url,
      sourceType: (s.sourceType || meta.sourceType) as SourceDocument["sourceType"],
      publishedAt: s.publishedAt || prev?.publishedAt || meta.publishedAt || undefined,
      updatedAt: s.updatedAt || prev?.updatedAt || meta.updatedAt || undefined,
      documentDateNote: s.documentDateEvidence || prev?.documentDateNote,
      retrievedAt: meta.retrievedAt,
      sha256: meta.sha256,
      mimeType: meta.mimeType,
      pageCount: meta.pageCount ?? undefined,
      bytes: meta.bytes,
    });
  }
}

/* --------------------------------- projects --------------------------------- */

const REGION_OF: Record<string, string> = {
  SC: "southeast",
  GA: "southeast",
  WI: "upper-midwest",
  MN: "upper-midwest",
  IA: "upper-midwest",
  ND: "upper-midwest",
  SD: "upper-midwest",
  IL: "upper-midwest",
  MI: "upper-midwest",
  TX: "southern-plains",
  OK: "southern-plains",
  NM: "southern-plains",
  KS: "southern-plains",
};
const STATE_ABBR: Record<string, string> = { "South Carolina": "SC", Georgia: "GA", Wisconsin: "WI", Minnesota: "MN", Iowa: "IA", "North Dakota": "ND", "South Dakota": "SD", Texas: "TX", Oklahoma: "OK", Illinois: "IL" };
const abbr = (s: string) => STATE_ABBR[s] ?? s;

/** "Beckham (Beckham County) Substation, OG&E, Beckham County, OK" → "Beckham Substation" */
function shortLabel(raw: string): string {
  let t = raw.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  t = t.split(" / ")[0].trim();
  for (const sep of [". ", "; ", ": "]) if (t.length > 34 && t.includes(sep)) t = t.split(sep)[0].trim();
  if (t.length > 34 && t.includes(", ")) t = t.split(", ")[0].trim();
  if (t.length > 40) t = t.slice(0, 38).replace(/\s+\S*$/, "") + "…";
  return t || raw;
}

function words(s: string) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["substation", "station", "the", "and", "new", "kv"].includes(w)));
}

const projects = new Map<string, Project>();
const coordinationRaw: { from: string; c: R }[] = [];

for (const c of clusters) {
  for (const p of c.projects ?? []) {
    const id = alias(p.id);
    if (overrides.drop?.includes(id)) continue;
    if (projects.has(id)) {
      warn(`duplicate project id ${id} in cluster ${c.cluster}; keeping first`);
      continue;
    }
    const places: Place[] = (p.places ?? []).map((pl: R, i: number) => ({
      id: pl.id || `${id}-place-${i}`,
      label: shortLabel(pl.label),
      detail: shortLabel(pl.label) !== pl.label ? pl.label : undefined,
      kind: pl.kind,
      precision: pl.precision,
      lat: Number(pl.lat),
      lon: Number(pl.lon),
      uncertaintyMeters: Number(pl.uncertaintyMeters) || (pl.precision === "county" ? 30000 : pl.precision === "locality" ? 8000 : 1000),
      coordinateSource: pl.coordinateSource,
      evidenceIds: ev(pl.evidence),
      ...(pl.role ? { role: pl.role } : {}),
      ...(pl.confidence ? { confidence: pl.confidence } : {}),
    }));
    const windows: ConstructionWindow[] = (p.constructionWindows ?? []).map((w: R, i: number) => {
      // a start milestone with no published end ("construction begins Fall 2027") arrives as a far-future end
      const openEnded = String(w.end?.latest ?? "") >= "2090";
      return {
      id: `${id}:w${i + 1}`,
      claimSourceId: w.claimSourceId,
      phase: w.phase,
      start: w.start,
      end: openEnded ? { earliest: w.start.earliest, latest: "2099-12-31", precision: "year" } : w.end,
      continuous: openEnded ? false : w.continuous !== false,
      ...(openEnded ? { openEnded: true } : {}),
      ...(w.boundsOnly ? { boundsOnly: true } : {}),
      evidenceIds: ev(w.evidence),
      note: w.note || undefined,
      ...(overrides.windowPatches?.[`${id}:w${i + 1}`] ?? {}),
      };
    });
    // a window whose start is after its end cannot be used (source inconsistency) — keep the claim out, say so
    for (let i = windows.length - 1; i >= 0; i--) {
      const w = windows[i];
      if (w.start.earliest > w.end.latest) {
        warn(`${id}: window ${w.id} starts after it ends; dropped`);
        windows.splice(i, 1);
      }
    }
    // bounds-only windows: the source dates the envelope (start … "by"/need date), not the field work inside it
    for (const w of windows) {
      if (!w.boundsOnly) continue;
      w.start = { earliest: w.start.earliest, latest: w.end.latest, precision: w.start.precision };
      w.end = { earliest: w.start.earliest, latest: w.end.latest, precision: w.end.precision };
    }
    const completion: CompletionClaim[] = (p.completionClaims ?? [])
      .map((cc: R, i: number) => ({
        id: `${id}:c${i + 1}`,
        claimSourceId: cc.claimSourceId,
        label: cc.label,
        date: cc.date,
        evidenceIds: ev(cc.evidence),
        ...(cc.current === false ? { current: false } : {}),
      }))
      // current claims first: the engine reads the first in-service claim as the current one
      .sort((x: CompletionClaim, y: CompletionClaim) => Number(x.current === false) - Number(y.current === false));
    for (const k of p.knownCoordination ?? []) coordinationRaw.push({ from: id, c: k });

    const states = [...new Set<string>((p.states ?? []).map(abbr))];
    const route =
      p.route?.available && (p.route.waypoints?.length ?? 0) > 1
        ? {
            precision: p.route.precision === "official-gis" ? ("official-gis" as const) : ("official-map-digitized" as const),
            description: p.route.description ?? "",
            coordinates: p.route.waypoints.map((w: R) => [Number(w.lon), Number(w.lat)] as [number, number]),
            waypointNames: p.route.waypoints.map((w: R) => w.name),
            evidenceIds: ev(p.route.evidence),
            caveat: /schematic|approximate|not survey/i.test(p.route.caveat ?? "")
              ? p.route.caveat
              : `Schematic / not survey accurate.${p.route.caveat ? ` ${p.route.caveat}` : ""}`,
          }
        : undefined;

    const project: Project = {
      id,
      title: p.title,
      shortTitle: p.shortTitle || p.title,
      titleEvidenceIds: ev(p.titleEvidence),
      parentInitiative: p.parentInitiative || undefined,
      docketId: p.docketId || undefined,
      summary: p.summary ?? "",
      owners: (p.owners ?? []).map((o: R) => ({ utilityId: UTILITY_ALIASES[o.utilityId] ?? o.utilityId, evidenceIds: ev(o.evidence) })),
      status: { value: p.status?.value ?? "unknown", label: p.status?.label || undefined, asOf: p.status?.asOf || undefined, evidenceIds: ev(p.status?.evidence) },
      states,
      counties: (p.counties ?? []).map((co: R) => ({ name: co.name, state: abbr(co.state), evidenceIds: ev(co.evidence) })),
      facts: (p.facts ?? []).map((f: R) => ({ key: f.key, label: f.label, value: f.value, evidenceIds: ev(f.evidence) })),
      places,
      route,
      constructionWindows: windows,
      completionClaims: completion,
      knownCoordination: [],
      caveats: p.caveats ?? [],
      sourceIds: [],
      region: p.region ?? REGION_OF[states[0]] ?? "other",
      ...(overrides.projectPatches?.[id] ?? {}),
    };
    projects.set(id, project);
  }
}

// coordination claims must point at a project in the snapshot
for (const { from, c } of coordinationRaw) {
  const partner = alias(c.partner);
  const p = projects.get(from);
  if (!p) continue;
  if (!projects.has(partner)) {
    warn(`coordination ${from} -> ${c.partner} dropped: partner project not in snapshot`);
    continue;
  }
  const claim: CoordinationClaim = { partnerProjectId: partner, status: c.status, scope: c.scope, description: c.description, evidenceIds: ev(c.evidence) };
  p.knownCoordination.push(claim);
}

/* --------------------------------- relations --------------------------------- */

const relations: Relation[] = [];
const relKey = new Set<string>();
for (const c of clusters) {
  for (const r of c.relations ?? []) {
    const a = alias(r.projectA);
    const b = alias(r.projectB);
    if (!projects.has(a) || !projects.has(b)) {
      warn(`relation ${r.projectA} × ${r.projectB} (${r.kind}) dropped: project missing`);
      continue;
    }
    const key = [a, b].sort().join("|") + "|" + r.kind;
    const ids = ev(r.evidence);
    if (relKey.has(key)) {
      const existing = relations.find((x) => [x.projectA, x.projectB].sort().join("|") + "|" + x.kind === key)!;
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...ids])];
      continue;
    }
    relKey.add(key);
    const both = [projects.get(a)!, projects.get(b)!];
    // the place that best matches the stated site (most shared distinctive words)
    const want = words(r.siteLabel ?? "");
    let sitePlace: Place | undefined;
    let best = 0;
    for (const pl of both.flatMap((p) => p.places)) {
      const score = [...words(pl.detail ?? pl.label)].filter((w) => want.has(w)).length;
      if (score > best) {
        best = score;
        sitePlace = pl;
      }
    }
    relations.push({
      id: `rel-${relations.length + 1}`,
      projectA: a,
      projectB: b,
      kind: r.kind,
      siteLabel: r.siteLabel ? shortLabel(r.siteLabel) : undefined,
      siteDetail: r.siteLabel && shortLabel(r.siteLabel) !== r.siteLabel ? r.siteLabel : undefined,
      basis: /\binferr?|\bimpl(y|ies|ied)\b|no single document|no source names/i.test(r.description ?? "") ? "inferred" : "stated",
      sitePlaceId: sitePlace?.id,
      description: r.description,
      evidenceIds: ids,
    });
  }
}

/* ------------------------- source ids per project, audit ------------------------- */

for (const p of projects.values()) {
  const ids = new Set<string>();
  const all = [
    ...p.titleEvidenceIds,
    ...p.status.evidenceIds,
    ...p.owners.flatMap((o) => o.evidenceIds),
    ...p.places.flatMap((x) => x.evidenceIds),
    ...p.constructionWindows.flatMap((x) => x.evidenceIds),
    ...p.completionClaims.flatMap((x) => x.evidenceIds),
    ...p.knownCoordination.flatMap((x) => x.evidenceIds),
    ...(p.route?.evidenceIds ?? []),
    ...p.facts.flatMap((f) => f.evidenceIds),
    ...p.counties.flatMap((f) => f.evidenceIds),
  ];
  for (const id of all) ids.add(evidence[id].sourceId);
  for (const w of p.constructionWindows) ids.add(w.claimSourceId);
  for (const c of p.completionClaims) ids.add(c.claimSourceId);
  p.sourceIds = [...ids].filter((s) => sources.has(s));
  for (const s of ids) if (!sources.has(s)) warn(`${p.id} cites unknown source ${s}`);
}

/* ---------------------------------- regions ---------------------------------- */

function bbox(ps: Project[]): [number, number, number, number] {
  const pts = ps.flatMap((p) => [...p.places.map((pl) => [pl.lon, pl.lat]), ...(p.route?.coordinates ?? [])]);
  const xs = pts.map((x) => x[0]);
  const ys = pts.map((x) => x[1]);
  const pad = 0.6;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}
const regions: Region[] = [];
const se = [...projects.values()].filter((p) => p.region === "southeast" && p.places.length);
if (se.length) regions.push({ id: "southeast", label: "Savannah River · SC–GA", bbox: bbox(se) });
const um = [...projects.values()].filter((p) => p.region === "upper-midwest");
const sp = [...projects.values()].filter((p) => p.region === "southern-plains");
if (um.length) regions.push({ id: "upper-midwest", label: "Upper Midwest", bbox: bbox(um) });
if (sp.length) regions.push({ id: "southern-plains", label: "Southern Plains", bbox: bbox(sp) });

/* ------------------------------- extraction runs ------------------------------- */

const extractionRuns: ExtractionRun[] = [];
if (fs.existsSync(EXTRACTIONS)) {
  for (const f of fs.readdirSync(EXTRACTIONS).filter((x) => x.endsWith(".json")).sort()) {
    extractionRuns.push(JSON.parse(fs.readFileSync(path.join(EXTRACTIONS, f), "utf8")));
  }
}

/* ------------------------------ impact assumptions ------------------------------ */

const COST_FILE = path.join(ROOT, "data", "region-b", "cost.json");
const assumptions: ImpactAssumption[] = [];
if (fs.existsSync(COST_FILE)) {
  const cost = JSON.parse(fs.readFileSync(COST_FILE, "utf8"));
  for (const s of cost.sources ?? []) {
    const meta = readMeta(s.id);
    if (!meta || sources.has(s.id)) continue;
    sources.set(s.id, {
      id: s.id, publisher: s.publisher || meta.publisher, title: s.title || meta.title, url: meta.url, sourceType: s.sourceType || meta.sourceType,
      publishedAt: s.publishedAt || meta.publishedAt || undefined, retrievedAt: meta.retrievedAt, sha256: meta.sha256, mimeType: meta.mimeType,
      pageCount: meta.pageCount ?? undefined, bytes: meta.bytes,
    });
  }
  for (const a of cost.assumptions ?? []) {
    const ids = ev([{ sourceId: a.sourceId, page: a.page, section: a.section, exactExcerpt: a.exactExcerpt, supports: a.label }]);
    if (!ids.length || !evidence[ids[0]].verifiedInSource) {
      warn(`assumption ${a.key} dropped: excerpt not located`);
      continue;
    }
    assumptions.push({ key: a.key, label: a.label, low: a.low ?? undefined, typical: a.typical, high: a.high ?? undefined, unit: a.unit, evidenceIds: ids, note: a.note ?? "" });
  }
}

/* ----------------------------------- write ----------------------------------- */

const usedSources = new Set([...Object.values(evidence).map((e) => e.sourceId), ...[...projects.values()].flatMap((p) => p.sourceIds)]);
// region B planning documents are cited even when only through parsed fields
for (const id of ["desc-scrtp-2026-2030", "desc-scrtp-2025-2029", "desc-scrtp-2024-2028", "gpc-irp-2025-vol3"]) if (sources.has(id)) usedSources.add(id);
const utilityIds = new Set([...projects.values()].flatMap((p) => p.owners.map((o) => o.utilityId)));
for (const u of utilityIds) if (!UTILITIES.some((x) => x.id === u)) warn(`utility ${u} missing from lib/data/utilities.ts`);

const body = {
  snapshotDate: SNAPSHOT_DATE,
  regions,
  utilities: UTILITIES.filter((u) => utilityIds.has(u.id)),
  sources: [...sources.values()].filter((s) => usedSources.has(s.id)).sort((a, b) => a.id.localeCompare(b.id)),
  evidence,
  projects: [...projects.values()],
  relations,
  extractionRuns,
  assumptions,
  unresolved: clusters.flatMap((c) => (c.unresolved ?? []).map((note: string) => ({ cluster: c.cluster, note }))),
};
const version = `snap-${SNAPSHOT_DATE}-${crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 8)}`;
const snapshot: Snapshot = { version, generatedAt: new Date().toISOString(), ...body };

fs.writeFileSync(path.join(ROOT, "data", "snapshot.json"), JSON.stringify(snapshot, null, 1));
fs.writeFileSync(
  path.join(ROOT, "data", "manifest.json"),
  JSON.stringify(
    snapshot.sources.map((s) => ({
      id: s.id,
      url: s.url,
      publisher: s.publisher,
      title: s.title,
      sourceType: s.sourceType,
      retrievedAt: s.retrievedAt,
      sha256: s.sha256,
      ...(readMeta(s.id) && (readMeta(s.id) as unknown as { localCopy?: boolean }).localCopy ? { localCopy: true } : {}),
    })),
    null,
    1,
  ),
);

console.log(`snapshot ${version}`);
console.log(`  ${snapshot.projects.length} projects · ${snapshot.utilities.length} utilities · ${snapshot.sources.length} sources · ${relations.length} relations`);
console.log(`  evidence ${stats.total}: ${stats.found} located verbatim, ${stats.notFound} NOT located, ${stats.noCache} without cache`);
if (warnings.length) {
  console.log(`\n${warnings.length} warnings:`);
  for (const w of warnings) console.log("  - " + w);
}
