import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match } from "@/lib/domain/types";
import { formatMiles, formatSpan } from "@/lib/format";

export function geoShort(m: Match): string {
  const d = m.geoDetail;
  if (d.method === "shared-site") {
    const rel = SNAPSHOT.relations.find((r) => d.relationIds.includes(r.id));
    return rel?.siteLabel ? `Shared site · ${rel.siteLabel}` : "Shared site stated";
  }
  if (d.method === "shared-endpoint" && d.sharedEndpoint) return `Same terminal · ${d.sharedEndpoint.labelA}`;
  if (d.method === "measured" && d.center) return `${formatMiles(d.center.miles)} apart`;
  if (d.method === "coarse") return "County-level only";
  return "Location unknown";
}

export function timeShort(m: Match): string {
  const t = m.timeDetail;
  if (m.time === "unknown" && t.inService) return `${t.inService.gapDays.toLocaleString("en-US")} d apart`;
  if (m.time === "unknown") return "Schedule unknown";
  if (m.time === "no-match") return "No window overlap";
  if (t.possibleOverlap) return formatSpan(t.possibleOverlap, t.precision);
  return "—";
}

/** One-sentence explanation shown at the top of the inspector and in the brief. */
export function whyFlagged(m: Match): string {
  const parts: string[] = [];
  const d = m.geoDetail.center?.miles;
  if (m.geoDetail.method === "shared-site") parts.push("a source-stated shared facility");
  else if (m.geoDetail.method === "shared-endpoint") parts.push(`terminals at the same facility (${m.geoDetail.sharedEndpoint?.labelA})`);
  else if (m.geo === "confirmed") parts.push(`centers ${d !== undefined ? formatMiles(d) : ""} apart, inside the ${m.geoDetail.thresholdMiles} mi radius`);
  else parts.push("possible proximity");
  if (m.time === "confirmed") parts.push("overlapping published construction windows");
  else if (m.time === "possible") parts.push("possibly overlapping construction windows");
  else if (m.timeDetail.inService) parts.push(`in-service dates ${m.timeDetail.inService.gapDays.toLocaleString("en-US")} days apart`);
  const signals = parts.join(" and ");
  const tail =
    m.reviewStatus === "known-coordination"
      ? "Coordination is already documented, so this is a known interface, not a new gap."
      : m.reviewStatus === "needs-review"
        ? "No resource-coordination plan was found in the reviewed sources — status unknown, not “uncoordinated.”"
        : "Evidence is coarse; treat as a lead to verify.";
  return `Flagged for ${signals}. ${tail}`;
}

export const SCOPE_LABEL: Record<string, string> = {
  "joint-ownership": "Joint ownership",
  "joint-initiative": "Joint initiative",
  "interconnection-design": "Interconnection design",
  "shared-facility": "Shared facility",
  "resource-sharing": "Resource sharing",
  unknown: "Scope unknown",
};

/** Headline title: long titles drop their parenthetical detail (the full title stays in tooltips/brief sources). */
export function displayTitle(p: { title: string }): string {
  // planning-area prefixes ("SAV: …") are kept in the docket line, not the headline
  const base = p.title.replace(/^(SAV|GTC|MEAG|DU)\s*:\s*/, "");
  if (base.length <= 48) return base;
  const t = base.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return t || base;
}

/** First sentence of a researcher description, capped at ~`words` words. */
export function firstSentence(text: string, words = 30): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.+?[.;])(\s|$)/);
  let out = m ? m[1] : clean;
  const w = out.split(" ");
  if (w.length > words) out = w.slice(0, words).join(" ") + "…";
  return out;
}
