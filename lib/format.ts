import type { DateBound } from "@/lib/domain/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function year(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Render one point in time at the precision the source supports — never finer. */
export function formatPoint(iso: string, precision: DateBound["precision"]): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  switch (precision) {
    case "year":
      return y;
    case "half":
      return `${m <= 6 ? "Early" : "Late"} ${y}`;
    case "quarter":
      return `Q${Math.ceil(m / 3)} ${y}`;
    case "month":
      return `${MONTHS[m - 1]} ${y}`;
    default:
      return `${MONTHS[m - 1]} ${Number(iso.slice(8, 10))}, ${y}`;
  }
}

/** A precision for captions: "half" reads "half-year". */
export function precisionLabel(p: DateBound["precision"]): string {
  return p === "half" ? "half-year" : p;
}

/** A DateBound as the source stated it: "2026", "Q3 2029", "2027–2028". */
export function formatBound(b: DateBound): string {
  if (b.label) return b.label;
  const a = formatPoint(b.earliest, b.precision);
  const z = formatPoint(b.latest, b.precision);
  return a === z ? a : `${a}–${z}`;
}

export function formatSpan(span: { start: string; end: string }, precision: DateBound["precision"]): string {
  const a = formatPoint(span.start, precision);
  const z = formatPoint(span.end, precision);
  return a === z ? a : `${a}–${z}`;
}

/** Where a window starts: "before 2026" when the source only itemizes spending before its first year (openStart), else the start point. */
export function windowStartText(w: { start: DateBound; openStart?: boolean }): string {
  return w.openStart ? `before ${year(w.start.latest)}` : (w.start.label ?? formatPoint(w.start.earliest, w.start.precision));
}

/** A window as published: "2027–2028", "2028" (a year-precision start inside the calendar year that ends it), "before 2026 → 2026" (openStart), "from Fall 2027" (openEnded). */
export function formatWindow(start: DateBound, end: DateBound, openEnded?: boolean, openStart?: boolean): string {
  const open = openEnded || end.latest >= "2090";
  const z = end.label ?? formatPoint(end.latest, end.precision);
  if (openStart) return open ? `from before ${year(start.latest)}` : `${windowStartText({ start, openStart })} → ${z}`;
  if (open) return `from ${start.label ?? formatPoint(start.earliest, start.precision)}`;
  // the in-service row and tooltips keep the exact end date
  if (start.precision === "year" && start.earliest.slice(0, 4) === end.latest.slice(0, 4) && end.latest.endsWith("-12-31")) return start.earliest.slice(0, 4);
  const a = start.label ?? formatPoint(start.earliest, start.precision);
  return a === z ? a : `${a}–${z}`;
}

export function formatMiles(mi: number): string {
  if (mi < 1) return "<1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/** One decimal near the review radius, so 24.89 mi never reads as "25 mi" beside a 25 mi threshold. */
export function formatMilesNear(mi: number, thresholdMiles: number): string {
  return mi >= 10 && Math.abs(mi - thresholdMiles) < 1.5 ? `${mi.toFixed(1)} mi` : formatMiles(mi);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!m) return String(y);
  if (!d) return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Headline title: long titles drop their parenthetical detail (the full title stays in tooltips/brief sources). */
export function displayTitle(p: { title: string }): string {
  // planning-area prefixes ("SAV: …") are kept in the docket line, not the headline
  const base = p.title.replace(/^(SAV|GTC|MEAG|DU)\s*:\s*/, "");
  if (base.length <= 48) return base;
  const t = base.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return t || base;
}

// researcher-to-developer sentences (schema, ids, placeholders, cache paths, UI hints) that are not findings about a project
const INTERNAL_NOTE =
  /plan\.md|test-matrix|is a placeholder shared|placeholders? and must be matched|id mismatch|\bids? (used|introduced)\b|id normalization|the UI (should|may)\b|This schema|\.cache\/|find_excerpt|This record maps|Duplicate key|Match this entry only|\benum\b|Reconcile before|KEY COLLISION|key-based merge|Engines? should|Intended as the|\bno-match\b|no-TIME control|output schema|supersededBy/i;
const ORDINAL = ["first", "second", "third", "fourth", "fifth"];

/**
 * A research note or caveat as shown to readers: internal dev sentences and cross-references dropped, schema notation
 * ("A = Okatie, B = McIntosh", "endpoints[2]") put in words, findings kept.
 */
export function publicNote(t: string): string {
  return t
    // test-fixture and schema wording around a finding: keep the finding
    .replace(/^COARSE-GEOGRAPHY case: the /, "The ")
    .replace(/ and should be flagged supersededBy\./g, ".")
    .replace(/;[^;.]*phase 'unknown',? (?:and )?continuous=false\./g, ".")
    .replace(/ is kept in completionClaims\./g, " is kept.")
    .replace(/\s*\(see route\.caveat\)/g, "")
    .replace(/\u0007/g, "")
    .replace(/\s*\(centerOf\)/g, "")
    .replace(/\bA = (.+?), B = /g, "Terminals: $1 and ")
    .replace(/\s*\((?:A, B|endpoints\[\d+\.\.\d+\])\)/g, "")
    .replace(/\bendpoints\[0\.\.1\] (?:=|are)/g, "The first two mapped points are")
    .replace(/\bendpoints\[(\d)\] (=|is|marks)/g, (_, i: string, v: string) => `The ${ORDINAL[+i] ?? `no. ${+i + 1}`} mapped point ${v === "marks" ? "marks" : "is"}`)
    .replace(/ and The /g, " and the ")
    .replace(/\bA–B midpoint/g, "terminal midpoint")
    .replace(/,\s*desc-\d+\)/g, ")")
    .replace(/'not-found-in-sources' coordination entries mean the cached sources are silent\. They do not/g, "Coordination marked “not found” means the cached sources are silent; it does not")
    .split(/(?<=\.)\s+(?=[A-Z'(“"])/)
    .filter((s) => !INTERNAL_NOTE.test(s))
    .join(" ")
    .trim();
}

/** Replace record ids in a note ("gpc-irp-2025-vol3", "desc-saluda-bushriver-page") with readable names; ids nameOf does not
 *  resolve, and ordinary hyphenated words ("breaker-and-a-half"), stay as they are. */
export function nameRecordIds(t: string, nameOf: (id: string) => string | undefined): string {
  return t.replace(/\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/g, (id) => nameOf(id) ?? id);
}
