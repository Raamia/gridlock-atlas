import { IDX, SNAPSHOT } from "@/lib/data";
import { SCOPE_LABEL } from "@/lib/describe";
import type { Evidence, Match } from "@/lib/domain/types";
import { formatDate, formatSpan } from "@/lib/format";
import { activeWindows } from "@/lib/matching/time";
import { ownerNames, pageLabel } from "@/lib/selectors";

export interface BriefCitation {
  n: number;
  publisher: string;
  title: string;
  url: string;
  anchor?: string;
  documentDate?: string;
  excerpt: string;
}

export interface Brief {
  title: string;
  rows: { label: string; text: string }[];
  unresolved: string[];
  question: string;
  citations: BriefCitation[];
  footer: string;
}

/**
 * Deterministic review brief built only from reviewed snapshot fields — no free-form model facts.
 * Every sentence that states a fact carries a numbered citation to a short excerpt.
 */
export function buildBrief(m: Match): Brief {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const citations: BriefCitation[] = [];
  const cite = (ids: string[], max = 2): string => {
    const nums: number[] = [];
    for (const id of [...new Set(ids)].slice(0, max)) {
      const e = IDX.evidence(id);
      if (!e) continue;
      const src = IDX.source(e.sourceId);
      let c = citations.find((x) => `${x.url}|${x.anchor ?? ""}|${x.excerpt}` === `${src?.url}|${pageLabel(e) ?? ""}|${e.exactExcerpt}`);
      if (!c) {
        c = {
          n: citations.length + 1,
          publisher: src?.publisher ?? e.sourceId,
          title: src?.title ?? e.sourceId,
          url: pdfAnchor(e, src?.url, src?.mimeType),
          anchor: pageLabel(e),
          documentDate: src?.publishedAt ?? src?.updatedAt,
          excerpt: e.exactExcerpt,
        };
        citations.push(c);
      }
      nums.push(c.n);
    }
    return nums.length ? ` [${nums.join(", ")}]` : "";
  };

  const rels = SNAPSHOT.relations.filter((r) => m.geoDetail.relationIds.includes(r.id));
  const geoLine =
    m.geo === "confirmed" || m.geo === "possible"
      ? `GEO (${m.geo}) — ${m.geoReason}${cite([...rels.flatMap((r) => r.evidenceIds), ...placeEvidence(m)])}`
      : `GEO (${m.geo}) — ${m.geoReason}`;
  const timeLine = `TIME (${m.time}) — ${m.timeReason}${cite([...activeWindows(a), ...activeWindows(b)].flatMap((w) => w.evidenceIds), 3)}`;

  const statusText = m.coordination.length
    ? m.coordination.map((c) => `${SCOPE_LABEL[c.scope]}: ${c.description}${cite(c.evidenceIds)}`).join(" ") +
      (m.coordination.some((c) => c.scope === "resource-sharing") ? "" : " Resource sharing (crews, equipment) is not established in the reviewed sources.")
    : "No coordination between these projects was found in the reviewed sources. That is an unknown status, not evidence of a lack of coordination.";

  const unresolved: string[] = [];
  for (const c of m.conflicts) {
    const p = IDX.project(c.projectId);
    const claims = p.completionClaims.filter((x) => c.claimIds.includes(x.id));
    unresolved.push(`${p.shortTitle}: ${c.description}${cite(claims.flatMap((x) => x.evidenceIds))} Confirm current phase dates before discussing shared resources.`);
  }
  if (m.time === "unknown") unresolved.push("At least one construction window is not published; schedule overlap cannot be assessed.");
  if (m.timeDetail.precision === "year" || m.timeDetail.precision === "quarter")
    unresolved.push(`Published schedules are ${m.timeDetail.precision}-precision; the exact months of field work are not stated.`);
  if (m.geoDetail.method === "coarse") unresolved.push("Only county-level locations are published; site proximity is unverified.");
  if ([a, b].some((p) => p.route?.precision === "official-map-digitized"))
    unresolved.push("Route lines on the map are schematic traces of official route-options graphics, not survey-accurate alignments.");

  const ua = ownerNames(a, IDX);
  const ub = ownerNames(b, IDX);
  const span = m.timeDetail.possibleOverlap ? formatSpan(m.timeDetail.possibleOverlap, m.timeDetail.precision) : "the published construction period";
  const question =
    m.reviewStatus === "known-coordination"
      ? `Are there any remaining construction-phase interfaces or resource needs (outage windows, staging, access, crews, materials) that the existing ${ua} – ${ub} coordination has not covered for ${span}?`
      : m.reviewStatus === "needs-review"
        ? `Is there an existing arrangement between ${ua} and ${ub} for ${span}? If not, would a planner-to-planner conversation about outage windows, staging, access or shared resources be useful?`
        : `Can more precise location or schedule evidence confirm or rule out this pair before any outreach?`;

  return {
    title: `${a.title} × ${b.title}`,
    rows: [
      { label: "Pair", text: `${a.title} (${ua}) × ${b.title} (${ub})` },
      { label: "Why flagged", text: `${geoLine}\n${timeLine}` },
      { label: "Coordination status", text: statusText },
    ],
    unresolved,
    question,
    citations,
    footer: `Generated by GridLock Atlas from the public-plan snapshot of ${formatDate(SNAPSHOT.snapshotDate)} · engine ${m.engineVersion}. A match is a review lead, not a finding that resources can be shared. This brief does not contact any utility.`,
  };
}

function placeEvidence(m: Match): string[] {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  return [a, b].flatMap((p) => p.places.filter((pl) => pl.role === "endpoint").flatMap((pl) => pl.evidenceIds));
}

function pdfAnchor(e: Evidence, url?: string, mime?: string) {
  if (!url) return "";
  return mime === "application/pdf" && e.page ? `${url}#page=${e.page}` : url;
}

export function briefToMarkdown(b: Brief): string {
  const lines = [`# Review brief — ${b.title}`, ""];
  for (const r of b.rows) {
    lines.push(`**${r.label}:** ${r.text.replace(/\n/g, "  \n")}`, "");
  }
  if (b.unresolved.length) {
    lines.push("**Unresolved:**");
    for (const u of b.unresolved) lines.push(`- ${u}`);
    lines.push("");
  }
  lines.push(`**Review question:** ${b.question}`, "", "**Sources**");
  for (const c of b.citations) {
    lines.push(
      `${c.n}. ${c.publisher}, *${c.title}*${c.documentDate ? ` (${formatDate(c.documentDate)})` : ""}${c.anchor ? `, ${c.anchor}` : ""} — “${c.excerpt}” <${c.url}>`,
    );
  }
  lines.push("", `_${b.footer}_`);
  return lines.join("\n");
}
