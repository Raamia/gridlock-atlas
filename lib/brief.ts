import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, firstSentence, SCOPE_LABEL } from "@/lib/describe";
import type { Evidence, Match, Project } from "@/lib/domain/types";
import { formatDate, formatSpan, precisionLabel } from "@/lib/format";
import { centerOf, countyOnlyText } from "@/lib/matching/geo";
import { activeWindows, coarsest, currentInService } from "@/lib/matching/time";
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
  // one number per distinct excerpt (same source, page and text), however many claims cite it
  const numberOf = new Map<string, number>();
  const cite = (ids: string[], max = 2): string => {
    const nums: number[] = [];
    for (const id of [...new Set(ids)].slice(0, max)) {
      const e = IDX.evidence(id);
      if (!e) continue;
      const key = `${e.sourceId}|${e.page ?? ""}|${e.exactExcerpt}`;
      let n = numberOf.get(key);
      if (n === undefined) {
        const src = IDX.source(e.sourceId);
        const title = src?.title ?? e.sourceId;
        const label = pageLabel(e);
        n = citations.length + 1;
        numberOf.set(key, n);
        citations.push({
          n,
          publisher: src?.publisher ?? e.sourceId,
          title,
          url: pdfAnchor(e, src?.url, src?.mimeType),
          // an HTML section that only repeats the title is no anchor; a page anchor always stays
          anchor: label && !e.page && title.toLowerCase().includes(label.toLowerCase()) ? undefined : label,
          documentDate: src?.publishedAt ?? src?.updatedAt,
          excerpt: e.exactExcerpt,
          provenance: `${e.verifiedInSource ? "located verbatim by script" : "not auto-located"} · ${e.reviewedByHuman ? "human-checked" : "awaiting human check"}`,
        });
      }
      nums.push(n);
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
  const geoLine = `GEO (${m.geo}) — ${m.geoReason}${merge(cite(rels.flatMap((r) => r.evidenceIds), 2), cite(placeEvidence(a), 2), cite(placeEvidence(b), 2))}`;
  // the TIME line names the possible-overlap years: also cite the cell that puts a window there (e.g. DESC's post-in-service "2027 $1,024,912")
  const ov = m.timeDetail.possibleOverlap;
  const inOverlap = (id: string) =>
    !!ov && (IDX.evidence(id)?.exactExcerpt.match(/\b(?:19|20)\d\d\b/g) ?? []).some((y) => y >= ov.start.slice(0, 4) && y <= ov.end.slice(0, 4));
  const windowEvidence = (p: Project) => {
    const ids = dated(activeWindows(p).flatMap((w) => w.evidenceIds));
    const hit = ids.find(inOverlap);
    return hit && hit !== ids[0] ? [ids[0], hit] : ids.slice(0, 1);
  };
  const timeLine = `TIME (${m.time}) — ${m.timeReason}${merge(
    cite(windowEvidence(a), 2),
    cite(windowEvidence(b), 2),
    // cite the same in-service claims the gap is computed from
    m.timeDetail.inService ? cite(dated(currentInService(a)?.evidenceIds ?? []), 1) : "",
    m.timeDetail.inService ? cite(dated(currentInService(b)?.evidenceIds ?? []), 1) : "",
  )}`;

  const byScope = new Map<string, (typeof m.coordination)[number]>();
  for (const c of m.coordination) if (!byScope.has(c.scope)) byScope.set(c.scope, c);
  const statusText = m.coordination.length
    ? [...byScope.values()].map((c) => `${SCOPE_LABEL[c.scope]}: ${firstSentence(c.description, Number.POSITIVE_INFINITY)}${cite(c.evidenceIds, 1)}`).join(" ") +
      (m.coordination.some((c) => c.scope === "resource-sharing") ? "" : " Resource sharing (crews, equipment) is not established in the reviewed sources.")
    : "No coordination between these projects was found in the reviewed sources. That is an unknown status, not evidence of a lack of coordination.";

  const unresolved: string[] = [];
  for (const c of m.conflicts) {
    const p = IDX.project(c.projectId);
    // one citation per side, in the side's claim order: the first claim is the one whose value the sentence shows
    const claims: { id: string; evidenceIds: string[] }[] = c.field === "completion" ? p.completionClaims : p.constructionWindows;
    const sideEvidence = (claimIds: string[]) => claimIds.flatMap((id) => dated(claims.find((x) => x.id === id)?.evidenceIds ?? []));
    unresolved.push(`${displayTitle(p)}: ${c.description}${merge(...c.sides.map((side) => cite(sideEvidence(side.claimIds), 1)))}`);
  }
  if (m.conflicts.length) unresolved.push("Confirm the current phase dates with both planners before discussing shared resources.");
  if (m.time === "unknown") unresolved.push("At least one construction window is not published; schedule overlap cannot be assessed.");
  // named per project and worded as a lower bound: the other project's schedule may be month- or day-precise
  for (const p of [a, b]) {
    const ws = activeWindows(p);
    const prec = ws.length ? coarsest(ws) : undefined; // no window: covered by the "not published" line above
    if (prec === "year" || prec === "half" || prec === "quarter")
      unresolved.push(`At least one published schedule date for ${displayTitle(p)} is only ${precisionLabel(prec)}-precision; the exact months of its field work are not stated.`);
  }
  if (m.geoDetail.method === "coarse") unresolved.push(`${countyOnlyText([centerOf(a) ? null : a, centerOf(b) ? null : b])}; site proximity is unverified.`);
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

/** One excerpt per terminal the project's center is measured from (centerOf), preferring one that names it in the scope. */
function placeEvidence(p: Project): string[] {
  const pts = centerOf(p)?.places ?? p.places.filter((pl) => pl.role === "endpoint");
  const pick = (ids: string[]) => ids.find((id) => !/^project name$/i.test(IDX.evidence(id)?.supports ?? "")) ?? ids[0];
  return [...new Set(pts.map((pl) => pick(pl.evidenceIds)).filter((id): id is string => !!id))];
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
