import { IDX, SNAPSHOT } from "@/lib/data";
import type { ImpactAssumption, Match, Project } from "@/lib/domain/types";

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

const NO_NEW_CORRIDOR = /\b(rebuild|rebuilding|rebuilt|reconductor(ing)?|reactors?|(auto ?)?transformers?|autobank|relay|breakers?|capacitors?)\b/i;
const NEW_LINE = /\b(new|construct(ing)?|build)\b[^.]{0,60}\b(line|tap)\b/i;

/** Equipment at an existing site, or a rebuild/reconductor on existing right-of-way: no new corridor to share. */
export function needsNewCorridor(p: Project): boolean {
  const scope = `${p.title}. ${p.summary}`;
  return NEW_LINE.test(scope) || !NO_NEW_CORRIDOR.test(scope);
}

function bucket(kv: number | null): "115" | "230" | "500" {
  if (!kv || kv <= 161) return "115";
  if (kv <= 345) return "230";
  return "500";
}

function stateOf(p: Project): string {
  return p.states[0] ?? "";
}

export interface ImpactDefaults {
  /** Voltage class whose published defaults are used ("230" for a 345 kV line: nearest published class). */
  voltageClass: "115" | "230" | "500";
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
  // a shared corridor needs two new lines of published length; anything less defaults to 0 and the slider stays editable
  const noCorridor = [a, b].filter((p) => !needsNewCorridor(p));
  const sharedMiles = !noCorridor.length && known.length === 2 ? Math.min(...known) : 0;
  const sharedMilesNote =
    noCorridor.length === 2
      ? "Neither project needs a new corridor — set a length to explore."
      : noCorridor.length === 1
        ? `${noCorridor[0].shortTitle} needs no new corridor (equipment or a rebuild on existing right-of-way) — set a length to explore.`
        : known.length === 2
          ? "Default: the shorter of the two published line lengths."
          : known.length === 1
            ? "Only one source publishes a line length — set a corridor length to explore."
            : "Neither source publishes a line length — set a corridor length to explore.";
  const b2 = bucket(voltageKv);
  const state = stateOf(a) || stateOf(b);
  return {
    voltageClass: b2,
    state,
    sharedMiles,
    sharedMilesNote,
    rowWidthFt: assumption(`rowWidthFt.${b2}`) ?? assumption("rowWidthFt.115"),
    landValue: assumption(`landValuePerAcre.${state}`) ?? assumption(`landValuePerAcre.${stateOf(b)}`),
    easement: assumption("easementShare") ?? assumption("easementShare.misoConvention"),
    mobilization: assumption(`mobilizationCostPerProject.${b2}`) ?? assumption("mobilizationCostPerProject.230"),
    avoidedMobilizations: assumption("avoidedMobilizations"),
    lineCost: assumption(`lineCostPerMile.${b2}`) ?? assumption("lineCostPerMile.230"),
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
