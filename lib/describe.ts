import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match } from "@/lib/domain/types";
import { formatMiles, formatSpan } from "@/lib/format";

/** The place signal in a few words — the stated site or shared terminal itself, or the distance — plus a full label. */
export function geoShort(m: Match): { text: string; title: string } {
  const d = m.geoDetail;
  if (d.method === "shared-site") {
    const site = SNAPSHOT.relations.find((r) => d.relationIds.includes(r.id) && r.siteLabel)?.siteLabel;
    return site ? { text: site, title: `Shared site · ${site}` } : { text: "Shared site stated", title: "Shared site stated in a source" };
  }
  if (d.method === "shared-endpoint" && d.sharedEndpoint) return { text: d.sharedEndpoint.labelA, title: `Same terminal · ${d.sharedEndpoint.labelA}` };
  const text = d.method === "measured" && d.center ? `${formatMiles(d.center.miles)} apart` : d.method === "coarse" ? "County-level only" : "Location unknown";
  return { text, title: text };
}

export function timeShort(m: Match): string {
  const t = m.timeDetail;
  if (m.time === "unknown" && t.inService) {
    if (t.inService.coarse && t.inService.gapDays === 0) return "in-service overlap";
    return `${t.inService.coarse ? "≥" : ""}${t.inService.gapDays.toLocaleString("en-US")} d apart`;
  }
  if (m.time === "unknown") return "Schedule unknown";
  if (m.time === "no-match") return "No window overlap";
  if (t.possibleOverlap) return formatSpan(t.possibleOverlap, t.precision);
  return "—";
}

/** One-sentence explanation shown at the top of the inspector and in the brief. */
export function whyFlagged(m: Match): string {
  const parts: string[] = [];
  const d = m.geoDetail.center?.miles;
  const rels = SNAPSHOT.relations.filter((r) => m.geoDetail.relationIds.includes(r.id));
  if (m.geoDetail.method === "shared-site") parts.push(rels.some((r) => r.basis !== "inferred") ? "a source-stated shared facility" : "a shared facility implied by the sources");
  else if (m.geoDetail.method === "shared-endpoint") parts.push(`terminals at the same facility (${m.geoDetail.sharedEndpoint?.labelA})`);
  else if (m.geo === "confirmed") parts.push(`centers ${d !== undefined ? formatMiles(d) : ""} apart, inside the ${m.geoDetail.thresholdMiles} mi radius`);
  else parts.push("possible proximity");
  if (m.time === "confirmed") parts.push("overlapping published construction windows");
  else if (m.time === "possible") parts.push("possibly overlapping construction windows");
  else if (m.timeDetail.inService) parts.push(inServicePhrase(m));
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

/** "in-service dates 152 days apart" · "≥ 365 days apart" · "overlapping in-service dates" */
export function inServicePhrase(m: Match): string {
  const g = m.timeDetail.inService;
  if (!g) return "";
  if (g.coarse && g.gapDays === 0) return "overlapping in-service dates (at stated precision)";
  return `in-service dates ${g.coarse ? "at least " : ""}${g.gapDays.toLocaleString("en-US")} days apart`;
}
