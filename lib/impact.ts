import { IDX, SNAPSHOT } from "@/lib/data";
import type { ImpactAssumption, Match, Project } from "@/lib/domain/types";
import { displayTitle } from "@/lib/format";

/**
 * Illustrative impact calculator (sponsor bonus: "a rough cost/impact estimate for at least one
 * flagged opportunity"). Every default is a sourced assumption from the snapshot; the result is a
 * transparent scenario with ranges — never presented as a measured or promised saving.
 */

export function assumption(key: string): ImpactAssumption | undefined {
  return SNAPSHOT.assumptions?.find((a) => a.key === key);
}

export function voltageOf(p: Project): number | null {
  const f = p.facts.find((x) => x.key === "voltageKv");
  const fromFact = f ? firstNumber(f.value) : null;
  if (fromFact) return fromFact;
  const kv = [...p.title.matchAll(/(\d{2,3})\s*-?\s*kv/gi)].map((m) => Number(m[1]));
  return kv.length ? Math.max(...kv) : null;
}

/** First number in free text: "approximately 80 miles" → 80, "~190" → 190, "105-108 miles" → 105. */
function firstNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function lengthOf(p: Project): number | null {
  const f = p.facts.find((x) => x.key === "lengthMiles");
  return f ? firstNumber(f.value) : null;
}

/** Dollar amounts in free text: "$5,376,418", "188796752", "$483.3 million", "$540 million to $580 million", ">1200000000",
 *  "more than $1 billion" → low/high (atLeast for a floor); null when no amount is stated (e.g. "Redacted"). */
export function parseUsd(text: string): { low: number; high: number; atLeast: boolean } | null {
  const nums = [...text.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(billion|million)?/gi)]
    .map((m) => Number(m[1]) * (/^b/i.test(m[2] ?? "") ? 1e9 : m[2] ? 1e6 : 1))
    .filter((n) => n >= 1e5);
  if (!nums.length) return null;
  return { low: Math.min(...nums), high: Math.max(...nums), atLeast: /^\s*(>|≥|more than|over|at least)/i.test(text) };
}

export interface CostRange {
  low: number;
  high: number;
  atLeast: boolean;
  label: string;
  evidenceIds: string[];
}

/** The project's current published cost (superseded or pre-decision estimates are skipped). */
export function costRange(p: Project): CostRange | null {
  for (const f of p.facts) {
    if (f.key !== "costUsd" || /superseded|pre-decision/i.test(f.label)) continue;
    const r = parseUsd(f.value);
    if (r) return { ...r, label: f.label, evidenceIds: f.evidenceIds };
  }
  return null;
}

/** The published cost, or the low end of a published range. */
export function costOf(p: Project): number | null {
  return costRange(p)?.low ?? null;
}

const NO_NEW_CORRIDOR =
  /\b(rebuild|rebuilding|rebuilt|reconductor(ing)?|restring(ing)?|reactors?|(auto ?)?transformers?|(auto ?)?banks?|relay|breakers?|capacitors?|modif(y|ied|ication))\b|\bupgrade\b[^.]{0,40}\b(ACSR|ACSS|conductor)\b/i;
const NEW_LINE = /\b(new|construct(ing)?|build)\b[^.]{0,60}\b(line|tap)\b/i;
// a substation or switching station named in the title, with no line or tap in it, is site work (a bare "substation" in the
// summary is not: new lines often run between substations)
const SITE_TITLE = /\b(substation|sub|switching station)\b/i;
const LINE_WORD = /\b(lines?|tap)\b/i;

/** Equipment or a substation at a site, or a rebuild/reconductor on existing right-of-way: no new corridor to share. */
export function needsNewCorridor(p: Project): boolean {
  const scope = `${p.title}. ${p.summary}`;
  if (NEW_LINE.test(scope)) return true;
  if (SITE_TITLE.test(p.title) && !LINE_WORD.test(p.title)) return false;
  return !NO_NEW_CORRIDOR.test(scope);
}

export type VoltageClass = "115" | "230" | "345" | "500" | "765";

function bucket(kv: number | null): VoltageClass {
  if (!kv || kv <= 161) return "115";
  if (kv <= 230) return "230";
  if (kv <= 345) return "345";
  if (kv <= 500) return "500";
  return "765";
}

const DOWN: VoltageClass[] = ["765", "500", "345", "230", "115"];
/** The class's own published value, else the nearest lower class that has one (never a higher class's value). */
function pick(prefix: string, cls: VoltageClass): ImpactAssumption | undefined {
  return DOWN.slice(DOWN.indexOf(cls)).map((c) => assumption(`${prefix}.${c}`)).find(Boolean);
}
const classOf = (a: ImpactAssumption | undefined) => a?.key.split(".")[1] as VoltageClass | undefined;

function stateOf(p: Project): string {
  return p.states[0] ?? "";
}

export interface ImpactDefaults {
  /** Voltage class of the pair (the higher voltage). */
  voltageClass: VoltageClass;
  /** Class the right-of-way width actually comes from (the nearest lower published class when the pair's own is not published). */
  widthClass: VoltageClass | undefined;
  /** Class the mobilization cost actually comes from (MISO publishes none above 500 kV). */
  mobilClass: VoltageClass | undefined;
  state: string;
  sharedMiles: number;
  sharedMilesNote: string;
  rowWidthFt: ImpactAssumption | undefined;
  landValue: ImpactAssumption | undefined;
  easement: ImpactAssumption | undefined;
  /** Cost of one crew/equipment mobilization for this voltage class (MISO cost guide). */
  mobilization: ImpactAssumption | undefined;
  /** Regulator statement that co-building avoids a second mobilization. */
  avoidedMobilizations: ImpactAssumption | undefined;
  lineCost: ImpactAssumption | undefined;
  voltageKv: number | null;
  lengthA: number | null;
  lengthB: number | null;
  costA: number | null;
  costB: number | null;
}

export function impactDefaults(m: Match): ImpactDefaults {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const va = voltageOf(a);
  const vb = voltageOf(b);
  const voltageKv = va && vb ? Math.max(va, vb) : (va ?? vb);
  const lengthA = lengthOf(a);
  const lengthB = lengthOf(b);
  const known = [lengthA, lengthB].filter((x): x is number => x !== null);
  // a shared corridor needs two new lines of published length that are not simply joined end to end; anything less defaults to 0
  const noCorridor = [a, b].filter((p) => !needsNewCorridor(p));
  const endToEnd = m.geoDetail.method === "shared-site" || m.geoDetail.method === "shared-endpoint";
  const meetAt = SNAPSHOT.relations.find((r) => m.geoDetail.relationIds.includes(r.id) && r.siteLabel)?.siteLabel ?? m.geoDetail.sharedEndpoint?.labelA ?? "a shared facility";
  const sharedMiles = !noCorridor.length && !endToEnd && known.length === 2 ? Math.min(...known) : 0;
  const sharedMilesNote =
    noCorridor.length === 2
      ? "Neither project needs a new corridor — set a length to explore."
      : noCorridor.length === 1
        ? `${displayTitle(noCorridor[0])} needs no new corridor (substation or equipment work, or a rebuild or reconductor on existing right-of-way) — set a length to explore.`
        : endToEnd
          ? `The projects meet at ${meetAt}; no source describes a shared parallel corridor — set a length to explore.`
          : known.length === 2
            ? "Default: the shorter of the two published line lengths."
            : known.length === 1
              ? "Only one source publishes a line length — set a corridor length to explore."
              : "Neither source publishes a line length — set a corridor length to explore.";
  const b2 = bucket(voltageKv);
  const state = stateOf(a) || stateOf(b);
  const rowWidthFt = pick("rowWidthFt", b2);
  const mobilization = pick("mobilizationCostPerProject", b2);
  return {
    voltageClass: b2,
    widthClass: classOf(rowWidthFt),
    mobilClass: classOf(mobilization),
    state,
    sharedMiles,
    sharedMilesNote,
    rowWidthFt,
    landValue: assumption(`landValuePerAcre.${state}`) ?? assumption(`landValuePerAcre.${stateOf(b)}`),
    easement: assumption("easementShare") ?? assumption("easementShare.misoConvention"),
    mobilization,
    avoidedMobilizations: assumption("avoidedMobilizations"),
    lineCost: pick("lineCostPerMile", b2),
    voltageKv,
    lengthA,
    lengthB,
    costA: costOf(a),
    costB: costOf(b),
  };
}

export interface ImpactInputs {
  sharedMiles: number;
  rowWidthFt: number;
  landValuePerAcre: number;
  easementShare: number;
}

export interface ImpactResult {
  acres: number;
  landValueUsd: number;
  acresRange?: [number, number];
  landValueRange?: [number, number];
}

const SQFT_PER_ACRE = 43_560;

/** Land that one shared corridor would avoid encumbering twice: miles × width → acres → easement value. */
export function computeImpact(i: ImpactInputs, d?: ImpactDefaults): ImpactResult {
  const acres = (i.sharedMiles * 5280 * i.rowWidthFt) / SQFT_PER_ACRE;
  const landValueUsd = acres * i.landValuePerAcre * i.easementShare;
  const out: ImpactResult = { acres, landValueUsd };
  if (d?.rowWidthFt?.low && d.rowWidthFt.high) {
    const lo = (i.sharedMiles * 5280 * d.rowWidthFt.low) / SQFT_PER_ACRE;
    const hi = (i.sharedMiles * 5280 * d.rowWidthFt.high) / SQFT_PER_ACRE;
    out.acresRange = [lo, hi];
    const vLo = d.landValue?.low ?? i.landValuePerAcre;
    const vHi = d.landValue?.high ?? i.landValuePerAcre;
    const eLo = i.easementShare;
    const eHi = i.easementShare;
    out.landValueRange = [lo * vLo * eLo, hi * vHi * eHi];
  }
  return out;
}

export function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function formatUsdRange([lo, hi]: [number, number], atLeast = false): string {
  const a = formatUsd(lo);
  const b = formatUsd(hi);
  return `${atLeast ? "≥ " : ""}${a === b ? a : `${a}–${b}`}`;
}

/* ------------------------------ impact channels ------------------------------ */

export type WorkKind = "line-new" | "line-rebuild" | "substation-new" | "substation-upgrade";

// "Construct Deerfield Switching Station", "Atomic Road 115/12kV Sub: Construct"
const NEW_SITE = /\b(construct|new|build)\b(?:(?!\blines?\b)[^.]){0,40}\b(switching station|substation|sub)\b|\b(sub|substation)\b[^.]{0,30}\bconstruct\b/i;
const REBUILD_TITLE = /\b(rebuild|reconductor|restring|upgrade)\b/i;
const SITE_EQUIPMENT = /\b(auto ?transformers?|transformers?|autobanks?|banks?|reactors?|breakers?|relays?|capacitors?|expand existing)\b/i;

/** What kind of field work a project is, which decides its mobilization cost and which channels apply. */
export function workKind(p: Project): WorkKind {
  const scope = `${p.title}. ${p.summary}`;
  if (needsNewCorridor(p)) return "line-new";
  if (NEW_SITE.test(scope)) return "substation-new";
  if (SITE_TITLE.test(p.title) && !LINE_WORD.test(p.title)) return "substation-upgrade";
  if (REBUILD_TITLE.test(p.title)) return "line-rebuild";
  return SITE_TITLE.test(p.title) || SITE_EQUIPMENT.test(scope) ? "substation-upgrade" : "line-rebuild";
}

const MISO_KV = [69, 115, 138, 161, 230, 345, 500, 765];
/** A MISO table value for the voltage's own class, else the nearest lower class carried; `lowest` also allows the lowest
 *  published class for voltages below it (labelled so), never any other higher class. */
function misoPick(key: (kv: number) => string, kv: number | null, lowest = false): { a: ImpactAssumption; kv: number } | undefined {
  const own = MISO_KV.filter((c) => c <= (kv ?? 0)).reverse();
  for (const c of lowest ? [...own, MISO_KV[0]] : own) {
    const a = assumption(key(c));
    if (a) return { a, kv: c };
  }
  return undefined;
}

const utilityShort = (p: Project) => p.owners.map((o) => IDX.utility(o.utilityId)?.shortName ?? o.utilityId).join(" · ");

function mobilizationOf(p: Project): { a: ImpactAssumption; text: string } | undefined {
  const k = workKind(p);
  if (k === "substation-new" || k === "substation-upgrade") {
    const a = assumption(k === "substation-new" ? "mobilizationSubstation.newSite" : "mobilizationSubstation.existingSite");
    return a && { a, text: k === "substation-new" ? "substation, new site" : "substation, existing-site upgrade" };
  }
  const kv = voltageOf(p);
  const m = misoPick((c) => `mobilizationCostPerProject.${c}`, kv, true);
  if (!m) return undefined;
  const cls = !kv ? ", voltage not published: the lowest class" : m.kv === kv ? "" : m.kv > kv ? ", the lowest class MISO publishes" : ", nearest lower published class";
  return { a: m.a, text: `${m.kv} kV line${cls}` };
}

export type ChannelBasis = "stated" | "conditional" | "context";

export interface ChannelPart {
  projectId: string;
  /** Published cost, or a labelled mileage proxy (`proxy`), in that part's own dollar basis. */
  usd?: [number, number];
  atLeast?: boolean;
  proxy?: boolean;
  text: string;
  evidenceIds: string[];
  assumptions: ImpactAssumption[];
}

export interface ImpactChannel {
  key: "corridor" | "shared-terminal" | "staging" | "spare-transformer" | "outage" | "capital-in-scope";
  label: string;
  /** stated: a source states the sharing; conditional: only if something no source shows happens; context: scale, not a saving. */
  basis: ChannelBasis;
  /** One dollar basis per channel (`dollars`); channels are never added together. */
  usd?: [number, number];
  /** usd is a ceiling: "up to". */
  upTo?: boolean;
  dollars?: string;
  acres?: [number, number];
  /** Capital in scope: one part per project, each in its own dollar basis, listed and never summed. */
  parts?: ChannelPart[];
  formula: string;
  note: string;
  assumptions: ImpactAssumption[];
  evidenceIds: string[];
}

const SITE_WORD = /\b(substation|switching station)\b/i;
const NEW_STATION = /\bnew\b[^.]{0,30}\b(substation|switching station)\b/i;

function pairRelations(m: Match) {
  return SNAPSHOT.relations.filter((r) => [r.projectA, r.projectB].sort().join("|") === [m.projectAId, m.projectBId].sort().join("|"));
}

/** A stated shared station that a source calls new, with the evidence that says so. */
function sharedNewStation(m: Match) {
  for (const r of pairRelations(m)) {
    if (r.kind !== "shared-site" || r.basis !== "stated" || !SITE_WORD.test(`${r.siteLabel ?? ""} ${r.siteDetail ?? ""}`)) continue;
    const ids = r.evidenceIds.filter((id) => NEW_STATION.test(IDX.evidence(id)?.exactExcerpt ?? ""));
    if (ids.length) return { r, ids };
  }
  return undefined;
}

const RATIO = /(\d{2,3})\s*(?:kV)?\s*[-/–]\s*(\d{2,3})\s*kV\b|(\d{2,3})\s*[-/–]\s*(\d{2,3})\s+(?:auto ?transformer|autobank|bank|transformer)/i;
const XFMR = /\b(auto ?transformers?|autobanks?|transformers?|banks?)\b/i;
function transformerOf(p: Project): { ratio: string; mva: number | null } | null {
  const s = `${p.title}. ${p.summary}`;
  const r = s.match(RATIO);
  if (!XFMR.test(s) || !r) return null;
  const [x, y] = (r[1] ? [r[1], r[2]] : [r[3], r[4]]).map(Number);
  // "Replace 300 MVA … Bank D with 400 MVA Bank": the rating installed is the one after "with"
  const mva = s.match(/\bwith\s+(?:an?\s+)?(\d{2,4})\s*MVA/i) ?? s.match(/(\d{2,4})\s*MVA/i);
  return { ratio: `${Math.max(x, y)}-${Math.min(x, y)}`, mva: mva ? Number(mva[1]) : null };
}

/** Station names both projects' titles carry, from their mapped substations ("Okatie – McIntosh" and "Goshen - McIntosh" → McIntosh). */
function sharedTitleStations(a: Project, b: Project): string[] {
  const names = (p: Project) =>
    p.places
      .filter((pl) => pl.kind === "substation" || pl.kind === "switching-station")
      .map((pl) => pl.label.replace(/\([^)]*\)|\b(substation|switching station|sub|line terminal)\b.*$/gi, "").trim())
      .filter((n) => n.length > 2 && a.title.toLowerCase().includes(n.toLowerCase()) && b.title.toLowerCase().includes(n.toLowerCase()));
  const nb = new Set(names(b).map((n) => n.toLowerCase()));
  return [...new Set(names(a).filter((n) => nb.has(n.toLowerCase())))];
}

/** Exact unit cost for a formula line: "$262,660", "$5,896", "$15.8M". */
const unitUsd = (n: number) => (n >= 1e6 ? formatUsd(n) : `$${n.toLocaleString("en-US")}`);

const REBUILD_PROXY: Record<number, [string, string]> = {
  115: ["lineCostPerMile.115.descExample", "lineCostPerMile.115.rebuild"],
  230: ["lineCostPerMile.230.descRebuildExample", "lineCostPerMile.230.rebuild"],
};

/** $/mile for a redacted line's mileage proxy, only at a class carried exactly (never a 115 kV rate for 161 kV). */
function proxyRate(p: Project): { perMile: [number, number]; basis: string; assumptions: ImpactAssumption[] } | undefined {
  const kv = voltageOf(p);
  const k = workKind(p);
  if (!kv) return undefined;
  if (k === "line-rebuild" && REBUILD_PROXY[kv]) {
    const [lo, hi] = REBUILD_PROXY[kv].map(assumption);
    if (!lo || !hi) return undefined;
    return { perMile: [Math.min(lo.typical, hi.typical), Math.max(lo.typical, hi.typical)], basis: `DESC's own ${kv} kV rebuild example (nominal) to MISO's ${kv} kV rebuild cost (MTEP24 $)`, assumptions: [lo, hi] };
  }
  const a = k === "line-new" ? assumption(`lineCostPerMile.${kv}`) : undefined;
  return a && { perMile: [a.low ?? a.typical, a.high ?? a.typical], basis: `MISO's new ${kv} kV line range (MTEP24 $); the line only`, assumptions: [a] };
}

/** Published cost, else for a redacted line with a stated length a labelled proxy: miles × $/mile. */
function capitalOf(p: Project): ChannelPart {
  const owner = utilityShort(p);
  const c = costRange(p);
  const label = c && (/^[A-Z][a-z]/.test(c.label) ? c.label.charAt(0).toLowerCase() + c.label.slice(1) : c.label);
  if (c) return { projectId: p.id, usd: [c.low, c.high], atLeast: c.atLeast, text: `${owner}: ${formatUsdRange([c.low, c.high], c.atLeast)} published (${label})`, evidenceIds: c.evidenceIds, assumptions: [] };
  const redacted = p.facts.find((f) => f.key === "costUsd" && /redact/i.test(f.value));
  const why = redacted ? "cost redacted" : "no published cost";
  const len = lengthOf(p);
  const rate = redacted && len ? proxyRate(p) : undefined;
  if (rate && len && redacted) {
    const usd: [number, number] = [len * rate.perMile[0], len * rate.perMile[1]];
    return {
      projectId: p.id,
      usd,
      proxy: true,
      text: `${owner}: ${why}; proxy ${len} mi × ${formatUsdRange(rate.perMile)}/mi ≈ ${formatUsdRange(usd)} (${rate.basis})`,
      evidenceIds: redacted.evidenceIds,
      assumptions: rate.assumptions,
    };
  }
  const gap = !redacted ? "" : workKind(p).startsWith("substation") ? " (no mileage proxy for substation work)" : !len ? " (no stated length for a proxy)" : " (no carried $/mile for this voltage)";
  return { projectId: p.id, text: `${owner}: ${why}${gap}`, evidenceIds: redacted?.evidenceIds ?? [], assumptions: [] };
}

/**
 * The separate impact channels for one pair, each with its own formula, cited unit costs, dollar basis and label.
 * Channels are never summed: they rest on different dollar years and on different conditions.
 */
export function impactChannels(m: Match): ImpactChannel[] {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const d = impactDefaults(m);
  const out: ImpactChannel[] = [];
  const both = [a, b];
  const kinds = both.map(workKind);
  const timing = m.time !== "no-match";

  const r = computeImpact({ sharedMiles: d.sharedMiles, rowWidthFt: d.rowWidthFt?.typical ?? 100, landValuePerAcre: d.landValue?.typical ?? 0, easementShare: d.easement?.typical ?? 1 }, d);
  out.push({
    key: "corridor",
    label: "Shared new right-of-way",
    basis: "conditional",
    acres: [r.acres, r.acres],
    usd: d.landValue ? [r.landValueUsd, r.landValueUsd] : undefined,
    dollars: "2026 USDA land value",
    formula: "acres = miles × 5,280 × width ÷ 43,560; value = acres × $/acre × share",
    note: d.sharedMilesNote,
    assumptions: [d.rowWidthFt, d.landValue, d.easement].filter((x): x is ImpactAssumption => !!x),
    evidenceIds: [],
  });

  const station = sharedNewStation(m);
  if (station && kinds.includes("line-new")) {
    const n4 = misoPick((c) => `substationNew4Ring.${c}`, d.voltageKv);
    const a1 = n4 && assumption(`substationAdd1Ring.${n4.kv}`);
    const a2 = n4 && assumption(`substationAdd2Ring.${n4.kv}`);
    if (n4 && a1 && a2) {
      const l4 = assumption(`substationLandAcres.new4Ring.${n4.kv}`);
      const l1 = assumption(`substationLandAcres.add1Ring.${n4.kv}`);
      const l2 = assumption(`substationLandAcres.add2Ring.${n4.kv}`);
      const land = l4 && l1 && l2 ? ([l4.typical - l2.typical, l4.typical - l1.typical].map((x) => Math.round(x * 10) / 10) as [number, number]) : undefined;
      const site = station.r.siteLabel ?? "the shared station";
      out.push({
        key: "shared-terminal",
        label: `One ${n4.kv} kV terminal instead of two (${site})`,
        basis: "stated",
        usd: [n4.a.typical - a2.typical, n4.a.typical - a1.typical],
        dollars: "MTEP24 $, incl. 30% contingency and 7.5% AFUDC",
        acres: land,
        formula: `MISO new ${n4.kv} kV 4-position ring bus (${formatUsd(n4.a.typical)}) − adding the guest line's 1–2 positions to the host station (${formatUsdRange([a1.typical, a2.typical])})${land ? `; land ${l4!.typical.toFixed(1)} ac − ${l1!.typical.toFixed(1)}–${l2!.typical.toFixed(1)} ac` : ""}`,
        note: `A cited source states that one project's line ends at the other's new station, ${site}. The alternative, a separate new station for the second line, is our assumption. MISO's exploratory costs are all-in (land, site work, mobilization, contingency, AFUDC), so nothing is added on top; MISO does not recommend them for planning decisions.`,
        assumptions: [n4.a, a1, a2, l4, l1, l2].filter((x): x is ImpactAssumption => !!x),
        evidenceIds: station.ids.slice(0, 2),
      });
    }
  }

  const ma = mobilizationOf(a);
  const mb = mobilizationOf(b);
  if (timing && ma && mb) {
    const ceiling = Math.min(ma.a.typical, mb.a.typical);
    const avoided = assumption("avoidedMobilizations");
    out.push({
      key: "staging",
      label: "Stage both jobs together (one mobilization)",
      basis: "conditional",
      usd: [0, ceiling * (avoided?.typical ?? 1)],
      upTo: true,
      dollars: "2018 $, before overhead and contingency",
      formula: `the smaller of ${a.shortTitle}: ${unitUsd(ma.a.typical)} (MISO ${ma.text}) and ${b.shortTitle}: ${unitUsd(mb.a.typical)} (MISO ${mb.text})`,
      note: `Only if both jobs were actually staged together, which no source here establishes (no shared crews, contractor or aligned field dates). SCE&G testimony, summarized in a joint proposed order (SC PSC Docket 2011-325-E), says building two lines on the same structures at the same time avoids mobilizing crews twice.`,
      assumptions: [...new Set([ma.a, mb.a])].concat(avoided ? [avoided] : []),
      evidenceIds: [],
    });
  }

  const ta = transformerOf(a);
  const tb = transformerOf(b);
  const perMva = ta && tb && ta.ratio === tb.ratio ? assumption(`transformerCostPerMva.${ta.ratio}`) : undefined;
  const ratings = [ta?.mva, tb?.mva].filter((x): x is number => !!x);
  if (ta && tb && perMva && ratings.length) {
    const mva = Math.min(...ratings);
    const [hi, lo] = ta.ratio.split("-");
    const only = ratings.length === 1 ? (ta.mva ? [a, b] : [b, a]) : null;
    out.push({
      key: "spare-transformer",
      label: `One shared ${hi}/${lo} kV spare instead of two`,
      basis: "conditional",
      usd: [0, mva * perMva.typical],
      upTo: true,
      dollars: "MTEP24 $, installed",
      formula: `${mva} MVA × MISO ${unitUsd(perMva.typical)}/MVA (installed)`,
      note: `Both projects install ${hi}/${lo} kV transformers. ${only ? `Priced at the only published rating (${utilityShort(only[0])}'s ${mva} MVA); ${utilityShort(only[1])} does not publish its rating, so the avoided spare could be smaller. ` : ""}A shared spare also needs matching impedance and connections, which no source here shows. Utilities already share spares in emergencies (DOE).`,
      assumptions: [perMva, assumption(`transformerPrice.doe2011.${ta.ratio}`), assumption("spareSharing.statement")].filter((x): x is ImpactAssumption => !!x),
      evidenceIds: [],
    });
  }

  // outages matter where a job takes existing, energized facilities out of service
  const onExisting = kinds.map((k) => k === "line-rebuild" || k === "substation-upgrade");
  const common = sharedTitleStations(a, b);
  const irob = assumption("outageCoordination.statement");
  if (timing && irob && (onExisting.every(Boolean) || (common.length && onExisting.some(Boolean)))) {
    out.push({
      key: "outage",
      label: "Coordinate planned outages",
      basis: "context",
      formula: "not priced",
      note: `${
        common.length
          ? `Both lines are named for ${common.join(" and ")}; no source here says they share a station or an outage.`
          : "Both jobs change existing facilities in the same area."
      } If their field work overlaps, the outages belong in one coordinated plan: NERC IRO-017-1 requires each Reliability Coordinator to have a process to resolve outage conflicts, and FERC Order 1920 lists reduced congestion due to transmission outages among the benefits long-term regional planning must measure. Not priced: no source here gives a cost for these outages.`,
      assumptions: [irob, assumption("ferc1920.benefit5")].filter((x): x is ImpactAssumption => !!x),
      evidenceIds: [],
    });
  }

  if (m.reviewStatus !== "known-coordination") {
    const parts = both.map(capitalOf);
    if (parts.some((p) => p.usd)) {
      const rightSize = both.some((p, i) => kinds[i] === "line-rebuild" && (voltageOf(p) ?? 0) >= 200);
      out.push({
        key: "capital-in-scope",
        label: "Capital a joint review would cover (not a saving)",
        basis: "context",
        parts,
        formula: "each project's published cost; for a redacted line with a stated length, miles × $/mile (a proxy)",
        note: `Listed per project and not added up: the figures rest on different dollar bases. FERC Order 1920 counts avoided or deferred facilities among the benefits of long-term regional planning${rightSize ? ", and has providers consider right-sizing in-kind replacements at and above 200 kV (this pair includes one)" : ""}; nothing here says any of this capital can be avoided.`,
        assumptions: [assumption("ferc1920.benefit1"), rightSize ? assumption("ferc1920.rightSizing") : undefined].filter((x): x is ImpactAssumption => !!x),
        evidenceIds: [],
      });
    }
  }
  return out;
}

/* --------------------------------- portfolio --------------------------------- */

export interface CapitalLine {
  owner: string;
  kind: "published" | "proxy" | "unpriced";
  projects: number;
  usd?: [number, number];
  atLeast?: boolean;
  /** Proxy lines: rebuild miles behind the proxy. */
  miles?: number;
  /** Published lines: the document the costs come from (one line per owner and document, so no sum mixes documents). */
  sourceId?: string;
}

export interface ImpactPortfolio {
  region: string;
  statuses: Match["reviewStatus"][];
  /** Pairs in the region with these statuses whose windows could overlap. */
  eligiblePairs: number;
  /** Disjoint pairs, taken in rank order: each project is counted once, in its highest-ranked eligible pair. */
  pairs: { id: string; stagingUsd: number; acres: number }[];
  stagingUsd: number;
  corridorAcres: number;
  /** Distinct projects of the eligible pairs, per owner and dollar basis (published totals per owner and document; proxies apart). */
  capital: CapitalLine[];
}

/** An upper-bound scenario for a region: never a saving, never summed across dollar bases or channels. */
export function impactPortfolio(matches: Match[], region: string, statuses: Match["reviewStatus"][] = ["needs-review"]): ImpactPortfolio {
  const eligible = matches
    .filter((m) => IDX.project(m.projectAId)?.region === region && statuses.includes(m.reviewStatus) && m.time !== "no-match")
    .sort((x, y) => y.priority - x.priority || x.id.localeCompare(y.id));
  const used = new Set<string>();
  const pairs: ImpactPortfolio["pairs"] = [];
  for (const m of eligible) {
    if (used.has(m.projectAId) || used.has(m.projectBId)) continue;
    const ch = impactChannels(m);
    const staging = ch.find((c) => c.key === "staging")?.usd?.[1];
    if (staging === undefined) continue;
    used.add(m.projectAId).add(m.projectBId);
    pairs.push({ id: m.id, stagingUsd: staging, acres: ch.find((c) => c.key === "corridor")?.acres?.[0] ?? 0 });
  }
  const seen = new Set<string>();
  const lines = new Map<string, CapitalLine>();
  for (const m of eligible)
    for (const id of [m.projectAId, m.projectBId]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const part = capitalOf(IDX.project(id));
      const owner = utilityShort(IDX.project(id));
      const kind = !part.usd ? "unpriced" : part.proxy ? "proxy" : "published";
      const sourceId = kind === "published" ? IDX.evidence(part.evidenceIds[0])?.sourceId : undefined;
      const key = `${owner}|${kind}|${sourceId ?? ""}`;
      const line = lines.get(key) ?? { owner, kind, projects: 0, sourceId };
      line.projects++;
      if (part.usd) line.usd = [(line.usd?.[0] ?? 0) + part.usd[0], (line.usd?.[1] ?? 0) + part.usd[1]];
      if (part.atLeast) line.atLeast = true;
      if (part.proxy) line.miles = Math.round(((line.miles ?? 0) + (lengthOf(IDX.project(id)) ?? 0)) * 10) / 10;
      lines.set(key, line);
    }
  return {
    region,
    statuses,
    eligiblePairs: eligible.length,
    pairs,
    stagingUsd: pairs.reduce((t, p) => t + p.stagingUsd, 0),
    corridorAcres: pairs.reduce((t, p) => t + p.acres, 0),
    capital: [...lines.values()],
  };
}
