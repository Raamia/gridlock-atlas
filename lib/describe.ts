import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match } from "@/lib/domain/types";
import { formatMilesNear, formatSpan } from "@/lib/format";
import { dayCount } from "@/lib/matching/time";

export { displayTitle } from "@/lib/format";

/** The place signal in a few words — the stated site or shared terminal itself, or the distance — plus a full label. */
export function geoShort(m: Match): { text: string; title: string } {
  const d = m.geoDetail;
  if (d.method === "shared-site") {
    const site = SNAPSHOT.relations.find((r) => d.relationIds.includes(r.id) && r.siteLabel)?.siteLabel;
    return site ? { text: site, title: `Shared site · ${site}` } : { text: "Shared site stated", title: "Shared site stated in a source" };
  }
  if (d.method === "shared-endpoint" && d.sharedEndpoint) return { text: d.sharedEndpoint.labelA, title: `Same terminal · ${d.sharedEndpoint.labelA}` };
  const text = d.method === "measured" && d.closest ? `${formatMilesNear(d.closest.miles, d.thresholdMiles)} closest` : d.method === "coarse" ? "County-level only" : "Location unknown";
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
  if (t.basis === "schedule" && t.confirmedOverlap) return `${formatSpan(t.confirmedOverlap, "year")} schedules`;
  if (t.possibleOverlap) return formatSpan(t.possibleOverlap, t.precision);
  return "—";
}

/** One-sentence explanation shown at the top of the inspector and in the brief. */
export function whyFlagged(m: Match): string {
  const parts: string[] = [];
  const d = m.geoDetail.closest?.miles;
  const rels = SNAPSHOT.relations.filter((r) => m.geoDetail.relationIds.includes(r.id));
  // measured (not town-only): "possible" only because the location uncertainty straddles the radius; named = no town-level point at all
  const edge = m.geoDetail.method === "measured" && !m.geoDetail.closest?.localityOnly;
  const named = edge && !m.geoDetail.closest?.anyLocality;
  const beyond = m.beyondRadius ? `, although the closest points are ${d !== undefined ? `≈${formatMilesNear(d, m.geoDetail.thresholdMiles)} apart, beyond` : "not measurable against"} the ${m.geoDetail.thresholdMiles} mi radius` : "";
  if (m.geoDetail.method === "shared-site") parts.push(`${rels.some((r) => r.basis !== "inferred") ? "a source-stated shared facility" : "a shared facility implied by the sources"}${beyond}`);
  else if (m.geoDetail.method === "shared-endpoint") parts.push(`terminals at the same facility (${m.geoDetail.sharedEndpoint?.labelA})${beyond}`);
  else if (m.geo === "confirmed") parts.push(`closest points ${d !== undefined ? formatMilesNear(d, m.geoDetail.thresholdMiles) : ""} apart, inside the ${m.geoDetail.thresholdMiles} mi radius`);
  else if (edge && d !== undefined) parts.push(`closest points ≈${d.toFixed(1)} mi apart, estimated or at the edge of the ${m.geoDetail.thresholdMiles} mi radius`);
  else parts.push("possible proximity");
  if (m.time === "confirmed" && m.timeDetail.basis === "schedule") parts.push("published schedules (start → in-service) that overlap; field-work dates are not published");
  else if (m.time === "confirmed") parts.push("overlapping published construction windows");
  else if (m.time === "possible") parts.push("possibly overlapping construction windows");
  else if (m.timeDetail.inService) parts.push(inServicePhrase(m));
  const signals = parts.join(" and ");
  const tail =
    m.reviewStatus === "known-coordination"
      ? "Coordination is already documented, so this is a known interface, not a new gap."
      : m.reviewStatus === "needs-review"
        ? "No resource-coordination plan was found in the reviewed sources — status unknown, not “uncoordinated.”"
        : named
          ? "Located at named facilities, but the distance is within location uncertainty of the radius; treat as a lead to verify."
          : edge
            ? "A location is approximate (town-level), and the distance is within its uncertainty of the radius; treat as a lead to verify."
            : "Evidence is coarse; treat as a lead to verify.";
  const due = m.pastDue?.length ? " A planned in-service date has passed and no reviewed source confirms completion, so the pair ranks below current plans." : "";
  return `Flagged for ${signals}. ${tail}${due}`;
}

export const SCOPE_LABEL: Record<string, string> = {
  "joint-ownership": "Joint ownership",
  "joint-initiative": "Joint initiative",
  "interconnection-design": "Interconnection design",
  "shared-facility": "Shared facility",
  "resource-sharing": "Resource sharing",
  unknown: "Scope unknown",
};

/** First sentence of a researcher description, capped at ~`words` words. */
export function firstSentence(text: string, words = 30): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.+?[.;])(\s|$)/);
  let out = m ? m[1] : clean;
  const w = out.split(" ");
  if (w.length > words) out = w.slice(0, words).join(" ") + "…";
  return out;
}

/** "in-service dates 152 days apart" · "in-service dates at least 1 day apart" · "overlapping in-service dates" */
export function inServicePhrase(m: Match): string {
  const g = m.timeDetail.inService;
  if (!g) return "";
  if (g.coarse && g.gapDays === 0) return "overlapping in-service dates (at stated precision)";
  return `in-service dates ${g.coarse ? "at least " : ""}${dayCount(g.gapDays)} apart`;
}
