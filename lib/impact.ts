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
  const fromFact = f ? Number.parseInt(f.value, 10) : NaN;
  if (Number.isFinite(fromFact)) return fromFact;
  const kv = [...p.title.matchAll(/(\d{2,3})\s*-?\s*kv/gi)].map((m) => Number(m[1]));
  return kv.length ? Math.max(...kv) : null;
}

export function lengthOf(p: Project): number | null {
  const f = p.facts.find((x) => x.key === "lengthMiles");
  const n = f ? Number.parseFloat(f.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function costOf(p: Project): number | null {
  const f = p.facts.find((x) => x.key === "costUsd");
  if (!f) return null;
  const n = Number(f.value.replace(/[^0-9.]/g, ""));
  return f.value.includes("$") && Number.isFinite(n) && n > 0 ? n : null;
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
  sharedMiles: number;
  sharedMilesNote: string;
  rowWidthFt: ImpactAssumption | undefined;
  landValue: ImpactAssumption | undefined;
  easement: ImpactAssumption | undefined;
  mobilization: ImpactAssumption | undefined;
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
  const sharedMiles = known.length === 2 ? Math.min(...known) : known.length === 1 ? known[0] / 2 : 0;
  const sharedMilesNote =
    known.length === 2
      ? "Default: the shorter of the two published line lengths."
      : known.length === 1
        ? "Default: half of the one published line length (the other is not published)."
        : "Neither source publishes a line length — set a corridor length to explore.";
  const b2 = bucket(voltageKv);
  const state = stateOf(a) || stateOf(b);
  return {
    sharedMiles,
    sharedMilesNote,
    rowWidthFt: assumption(`rowWidthFt.${b2}`) ?? assumption("rowWidthFt.115"),
    landValue: assumption(`landValuePerAcre.${state}`) ?? assumption(`landValuePerAcre.${stateOf(b)}`),
    easement: assumption("easementShare"),
    mobilization: assumption("mobilizationShare"),
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
    const eLo = d.easement?.low ?? i.easementShare;
    const eHi = d.easement?.high ?? i.easementShare;
    out.landValueRange = [lo * vLo * eLo, hi * vHi * eHi];
  }
  return out;
}

export function formatUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
