/**
 * Presentational helpers for the pair inspector (SPEC §5.3). Pure functions over snapshot + match fields; the display
 * helpers vitest pins (lib/format, describe, selectors, brief, impact) are used as-is, never re-worded here.
 */
import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, SCOPE_LABEL } from "@/lib/describe";
import type { Evidence, Match, Project, ReviewStatus } from "@/lib/domain/types";
import { formatMilesNear, formatSpan, precisionLabel } from "@/lib/format";
import { costRange, formatUsdRange, lengthOf, voltageOf } from "@/lib/impact";
import { beyondRuleReason } from "@/lib/sponsor";
import { evidenceHref } from "@/lib/selectors";
import type { SignalState } from "../ui";

/* ── status, owners ─────────────────────────────────────────────────────────── */

/** One casing for project status: "Planned", "Proposed", "In progress", "10-year plan", "SERTP plan". */
export function statusText(p: Project): string {
  const l = p.status.label?.trim();
  if (l) {
    if (/ten-year plan/i.test(l)) return "10-year plan";
    if (/sertp/i.test(l)) return "SERTP plan";
    if (l.length <= 18) return l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
  }
  const byValue: Record<Project["status"]["value"], string> = {
    proposed: "Proposed",
    approved: "Approved",
    construction: "In progress",
    complete: "Complete",
    cancelled: "Cancelled",
    unknown: "Status unknown",
  };
  return byValue[p.status.value];
}

export function ownerShort(p: Project): string {
  return p.owners.map((o) => IDX.utility(o.utilityId)?.shortName ?? o.utilityId).join(" · ");
}

export function ownerFull(p: Project): string {
  return p.owners.map((o) => IDX.utility(o.utilityId)?.name ?? o.utilityId).join(" · ");
}

/* ── heading title ──────────────────────────────────────────────────────────── */

/** A plan's trailing scope verb ("Jasper – Okatie 230 kV #2: Construct", "Wateree-Killian 230kV: Rebuild"). */
const TRAILING_VERB = /\s*:\s*(Construct|Rebuild|Tap|Upgrade|Reconductor|Replace|Install|Build)\s*$/i;

/**
 * displayTitle (pinned wording) for a heading, without a dangling verb: "…: Construct" → "…" (a planned project is being
 * built), "…: Rebuild" → "… rebuild" (the kind of work stays). The full title is always in the heading's title attribute.
 */
export function headingTitle(p: Project): string {
  const t = displayTitle(p);
  const m = t.match(TRAILING_VERB);
  if (!m || m.index === undefined || m.index === 0) return t;
  const head = t.slice(0, m.index).trim();
  const verb = m[1].toLowerCase();
  return verb === "construct" || verb === "build" ? head : `${head} ${verb}`;
}

/* ── project facts line ─────────────────────────────────────────────────────── */

export interface FactPart {
  text: string;
  /** A source link for the fact (http), when an excerpt backs it. */
  href?: string;
  /** Tooltip: the fact as published. */
  title?: string;
}

function hrefOf(ids: string[] | undefined): string | undefined {
  const e = ids?.map((id) => IDX.evidence(id)).find(Boolean) as Evidence | undefined;
  return e ? evidenceHref(e, IDX.source(e.sourceId)) : undefined;
}

/** "Planned · 115 kV · 6.7 mi · $5.4M published", each fact linking to the excerpt that states it. */
export function projectFacts(p: Project): FactPart[] {
  const out: FactPart[] = [{ text: statusText(p), href: hrefOf(p.status.evidenceIds), title: p.status.label ?? p.status.value }];
  const kv = voltageOf(p);
  const kvFact = p.facts.find((f) => f.key === "voltageKv");
  if (kv) out.push({ text: `${kv} kV`, href: hrefOf(kvFact?.evidenceIds), title: kvFact ? `${kvFact.label}: ${kvFact.value}` : undefined });
  const len = lengthOf(p);
  const lenFact = p.facts.find((f) => f.key === "lengthMiles");
  if (len) out.push({ text: `${len} mi`, href: hrefOf(lenFact?.evidenceIds), title: lenFact ? `${lenFact.label}: ${lenFact.value}` : undefined });
  const cost = costRange(p);
  const costFact = p.facts.find((f) => f.key === "costUsd");
  if (cost) out.push({ text: `${formatUsdRange([cost.low, cost.high], cost.atLeast)} published`, href: hrefOf(cost.evidenceIds), title: cost.label });
  else if (costFact && /redact/i.test(costFact.value)) out.push({ text: "cost redacted", href: hrefOf(costFact.evidenceIds), title: `${costFact.label}: ${costFact.value}` });
  return out;
}

/* ── verdict ────────────────────────────────────────────────────────────────── */

export const GUIDANCE: Record<ReviewStatus, string> = {
  "needs-review": "Nothing on record; worth a planner call?",
  "known-coordination": "Already coordinating; ask only about uncovered construction-phase needs",
  possible: "Verify location/timing before any outreach",
};

/* ── tiles ──────────────────────────────────────────────────────────────────── */

export interface TileFact {
  state: SignalState;
  value: string;
  /** Mono value (numbers) vs sans (words, facility names). */
  mono: boolean;
  sub: string;
  tooltip?: string;
  /** Full value when the tile shows a shortened one. */
  title?: string;
}

/** "2025–2026" → "2025–26"; other text unchanged. */
export function shortYears(s: string): string {
  return s.replace(/\b(\d{2})(\d{2})–\1(\d{2})\b/, "$1$2–$3");
}

/** "Tremval North 345 kV Substation" → "Tremval North". */
export function shortFacility(label: string): string {
  const t = label
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b\d{2,3}(?:\/\d{2,3})?(?:-\d{2,3})?\s*kV\b/gi, "")
    .replace(/\b(substation|switching station|switchyard|sub)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return t || label;
}

function siteLabel(m: Match): string | undefined {
  const rels = SNAPSHOT.relations.filter((r) => m.geoDetail.relationIds.includes(r.id));
  const stated = rels.find((r) => r.basis !== "inferred" && r.siteLabel);
  return (stated ?? rels.find((r) => r.siteLabel))?.siteLabel;
}

export function siteStated(m: Match): boolean {
  return SNAPSHOT.relations.some((r) => m.geoDetail.relationIds.includes(r.id) && r.basis !== "inferred");
}

export function distanceTile(m: Match): TileFact {
  const d = m.geoDetail;
  const state: SignalState = m.geo === "confirmed" ? "confirmed" : m.geo === "possible" ? "possible" : "none";
  if (d.method === "shared-site") {
    const site = siteLabel(m);
    return {
      state,
      value: site ? shortFacility(site) : "Shared site",
      mono: false,
      title: site,
      sub: siteStated(m) ? "stated shared site" : "implied shared site",
      tooltip: site ? `Shared site · ${site}` : undefined,
    };
  }
  if (d.method === "shared-endpoint" && d.sharedEndpoint) {
    return { state, value: shortFacility(d.sharedEndpoint.labelA), mono: false, title: d.sharedEndpoint.labelA, sub: "same terminal" };
  }
  if (d.center) {
    const mi = formatMilesNear(d.center.miles, d.thresholdMiles);
    // distances are approximate everywhere (G3): the row, the tile, why-flagged and the brief all read "≈6.7 mi"
    return { state, value: `≈${mi}`, mono: true, sub: "centers apart", tooltip: "Distance between the two project centers (Sperry's rule: under 25 mi)" };
  }
  if (d.method === "coarse") return { state, value: "County-level", mono: false, sub: "no site published · no mileage" };
  return { state: "none", value: "Unknown", mono: false, sub: "location not established" };
}

export function timingTile(m: Match): TileFact {
  const t = m.timeDetail;
  const g = t.inService;
  // the sponsor's secondary signal, at the sources' precision: "in-service ≥274 d apart" / "in-service dates overlap"
  const gap = g ? (g.coarse && g.gapDays === 0 ? "in-service dates overlap" : `in-service ${g.coarse ? "≥" : ""}${g.gapDays.toLocaleString("en-US")} d apart`) : null;
  if (m.time === "confirmed") {
    const span = t.confirmedOverlap ?? t.schedule?.overlap ?? t.possibleOverlap;
    const months = t.schedule?.days ? Math.max(1, Math.round(t.schedule.days / 30.44)) : null;
    const schedule = t.basis === "schedule";
    return {
      state: "confirmed",
      value: span ? shortYears(formatSpan(span, "year")) : "Overlap",
      mono: true,
      sub: schedule ? `schedules overlap${months ? ` ${months} mo` : ""}` : "windows overlap",
      tooltip: schedule
        ? "Published schedules (start → in-service) overlap by ≥30 days; field-work dates are not published"
        : "Published construction windows overlap under every source combination",
    };
  }
  if (m.time === "possible") {
    const span = t.possibleOverlap;
    return {
      state: "possible",
      value: span ? shortYears(formatSpan(span, t.precision)) : "Possible",
      mono: true,
      sub: `may overlap · ${precisionLabel(t.precision)} precision`,
      tooltip: "Construction windows may overlap at the precision the sources state; field-work dates are not published",
    };
  }
  if (m.time === "no-match") return { state: "none", value: "No overlap", mono: false, sub: gap ?? "windows don't overlap" };
  return { state: "none", value: "Unknown", mono: false, sub: gap ? `no window published · ${gap}` : "no window published · not ruled out" };
}

/** Needs review: "Not found" + "in reviewed sources · status unknown, not “uncoordinated”" (the surface's one caveat line). */
export function coordinationTile(m: Match): { value: string; sub: string; caveat?: string; tone: "ok" | "default" } {
  if (m.coordination.length) {
    const scopes = [...new Set(m.coordination.map((c) => SCOPE_LABEL[c.scope] ?? "Scope unknown"))];
    return { value: "Documented", sub: scopes.length > 1 ? `${scopes[0]} +${scopes.length - 1} more` : scopes[0], tone: "ok" };
  }
  if (m.reviewStatus === "possible") return { value: "Not found", sub: "in reviewed sources · verify first", tone: "default" };
  return { value: "Not found", sub: "in reviewed sources", caveat: "status unknown, not “uncoordinated”", tone: "default" };
}

/* ── chips ──────────────────────────────────────────────────────────────────── */

export function conflictSplit(m: Match): { live: number; revised: number } {
  const live = m.conflicts.filter((c) => !c.versionOnly).length;
  return { live, revised: m.conflicts.length - live };
}

/** "Beyond 25 mi · shared site" (G1) with the reason as a tooltip; null inside the radius. */
export function beyondChip(m: Match): { text: string; tooltip: string } | null {
  if (!m.beyondRadius) return null;
  const kind = m.geoDetail.method === "shared-endpoint" ? "shared terminal" : "shared site";
  const reason = beyondRuleReason(m, SNAPSHOT.relations);
  return { text: `Beyond ${m.geoDetail.thresholdMiles} mi · ${kind}`, tooltip: reason ? `Outside the rule: ${reason}` : `Flagged through a ${kind}` };
}

/* ── evidence provenance (one line per section) ─────────────────────────────── */

export function provenanceSummary(list: Evidence[], mine: Record<string, boolean>): string {
  if (!list.length) return "";
  const located = list.filter((e) => e.verifiedInSource).length;
  const human = list.filter((e) => e.reviewedByHuman).length;
  const byYou = list.filter((e) => !e.reviewedByHuman && mine[e.id]).length;
  const waiting = list.length - human - byYou;
  const parts: string[] = [];
  parts.push(located === list.length ? "located verbatim by script" : `${located} of ${list.length} located verbatim by script`);
  if (human) parts.push(`${human} human-checked`);
  if (byYou) parts.push(`${byYou === list.length ? "" : `${byYou} `}checked by you`);
  if (waiting) parts.push(`${waiting === list.length ? "" : `${waiting} `}awaiting human check`);
  return parts.join(" · ");
}
