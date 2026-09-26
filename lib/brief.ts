import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, firstSentence, SCOPE_LABEL } from "@/lib/describe";
import type { Evidence, Match, Project } from "@/lib/domain/types";
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
  /** "located verbatim by script · awaiting human check" etc. */
  provenance: string;
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
          provenance: `${e.verifiedInSource ? "located verbatim by script" : "not auto-located"} · ${e.reviewedByHuman ? "human-checked" : "awaiting human check"}`,
        };
        citations.push(c);
      }
      nums.push(c.n);
    }
    return nums.length ? ` [${nums.join(", ")}]` : "";
  };

  // prefer excerpts that actually carry a date; cite each project separately so neither side goes uncited
  const dated = (ids: string[]) => [...ids].sort((x, y) => Number(/\b(19|20)\d\d\b/.test(IDX.evidence(y)?.exactExcerpt ?? "")) - Number(/\b(19|20)\d\d\b/.test(IDX.evidence(x)?.exactExcerpt ?? "")));
  const merge = (...parts: string[]) => {
    const nums = parts.flatMap((p) => (p.match(/\d+/g) ?? []).map(Number));
    return nums.length ? ` [${[...new Set(nums)].sort((x, y) => x - y).join(", ")}]` : "";
  };
  const rels = SNAPSHOT.relations.filter((r) => m.geoDetail.relationIds.includes(r.id));
  const geoLine = `GEO (${m.geo}) — ${m.geoReason}${merge(cite(rels.flatMap((r) => r.evidenceIds), 2), cite(placeEvidence(a), 1), cite(placeEvidence(b), 1))}`;
  const timeLine = `TIME (${m.time}) — ${m.timeReason}${merge(
    cite(dated(activeWindows(a).flatMap((w) => w.evidenceIds)), 1),
    cite(dated(activeWindows(b).flatMap((w) => w.evidenceIds)), 1),
    m.timeDetail.inService ? cite(dated(a.completionClaims.slice(0, 1).flatMap((c) => c.evidenceIds)), 1) : "",
    m.timeDetail.inService ? cite(dated(b.completionClaims.slice(0, 1).flatMap((c) => c.evidenceIds)), 1) : "",
  )}`;

  const byScope = new Map<string, (typeof m.coordination)[number]>();
  for (const c of m.coordination) if (!byScope.has(c.scope)) byScope.set(c.scope, c);
  const statusText = m.coordination.length
    ? [...byScope.values()].map((c) => `${SCOPE_LABEL[c.scope]}: ${firstSentence(c.description, 32)}${cite(c.evidenceIds, 1)}`).join(" ") +
      (m.coordination.some((c) => c.scope === "resource-sharing") ? "" : " Resource sharing (crews, equipment) is not established in the reviewed sources.")
    : "No coordination between these projects was found in the reviewed sources. That is an unknown status, not evidence of a lack of coordination.";

  const unresolved: string[] = [];
  for (const c of m.conflicts) {
    const p = IDX.project(c.projectId);
    // one citation per side, so every value in the sentence has a source
    const sideEvidence = (claimIds: string[]) =>
      c.field === "completion"
        ? p.completionClaims.filter((x) => claimIds.includes(x.id)).flatMap((x) => x.evidenceIds)
        : p.constructionWindows.filter((x) => claimIds.includes(x.id)).flatMap((x) => x.evidenceIds);
    unresolved.push(`${p.shortTitle}: ${c.description}${merge(...c.sides.map((side) => cite(dated(sideEvidence(side.claimIds)), 1)))}`);
  }
  if (m.conflicts.length) unresolved.push("Confirm the current phase dates with both planners before discussing shared resources.");
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
    title: `${displayTitle(a)} × ${displayTitle(b)}`,
    rows: [
      { label: "Pair", text: `${displayTitle(a)} (${ua}) × ${displayTitle(b)} (${ub})` },
      { label: "Why flagged", text: `${geoLine}\n${timeLine}` },
      { label: "Coordination status", text: statusText },
    ],
    unresolved,
    question,
    citations,
    footer: `Generated by GridLock Atlas from the public-plan snapshot of ${formatDate(SNAPSHOT.snapshotDate)} · engine ${m.engineVersion}. Excerpts were located by agent-assisted research and deterministic parsing and re-found verbatim by script; each citation shows whether a person has checked it. A match is a review lead, not a finding that resources can be shared. This brief does not contact any utility.`,
  };
}

function placeEvidence(p: Project): string[] {
  return p.places.filter((pl) => pl.role === "endpoint").flatMap((pl) => pl.evidenceIds);
}

function pdfAnchor(e: Evidence, url?: string, mime?: string) {
  if (!url) return "";
  return mime === "application/pdf" && e.page && /\.pdf($|[?#])/i.test(url) ? `${url}#page=${e.page}` : url;
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
      `${c.n}. ${c.publisher}, *${c.title}*${c.documentDate ? ` (${formatDate(c.documentDate)})` : ""}${c.anchor ? `, ${c.anchor}` : ""} — “${c.excerpt}” <${c.url}> _(${c.provenance})_`,
    );
  }
  lines.push("", `_${b.footer}_`);
  return lines.join("\n");
}
