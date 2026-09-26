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

export function costOf(p: Project): number | null {
  const f = p.facts.find((x) => x.key === "costUsd");
  if (!f) return null;
  const n = Number(f.value.replace(/[^0-9.]/g, ""));
  return f.value.includes("$") && Number.isFinite(n) && n > 0 ? n : null;
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
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
