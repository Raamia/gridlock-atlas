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
    case "quarter":
      return `Q${Math.ceil(m / 3)} ${y}`;
    case "month":
      return `${MONTHS[m - 1]} ${y}`;
    default:
      return `${MONTHS[m - 1]} ${Number(iso.slice(8, 10))}, ${y}`;
  }
}

/** A DateBound as the source stated it: "2026", "Q3 2029", "2027–2028". */
export function formatBound(b: DateBound): string {
  const a = formatPoint(b.earliest, b.precision);
  const z = formatPoint(b.latest, b.precision);
  return a === z ? a : `${a}–${z}`;
}

export function formatSpan(span: { start: string; end: string }, precision: DateBound["precision"]): string {
  const a = formatPoint(span.start, precision);
  const z = formatPoint(span.end, precision);
  return a === z ? a : `${a}–${z}`;
}

/** openStart: the source only says work began before its first itemized year, so no start year is shown. */
export function formatWindow(start: DateBound, end: DateBound, openEnded?: boolean, openStart?: boolean): string {
  const open = openEnded || end.latest >= "2090";
  if (openStart) return open ? `from before ${year(start.latest)}` : `pre-${year(start.latest)}–${formatPoint(end.latest, end.precision)}`;
  if (open) return `from ${formatPoint(start.earliest, start.precision)}`;
  const a = formatPoint(start.earliest, start.precision);
  const z = formatPoint(end.latest, end.precision);
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

// researcher-to-developer sentences (schema, ids, placeholders, UI hints) that are not findings about a project
const INTERNAL_NOTE = /plan\.md|test-matrix|is a placeholder shared|placeholders? and must be matched|id mismatch|\bids? (used|introduced)\b|id normalization|the UI (should|may)\b|This schema/i;

/** A research note or caveat as shown to readers: internal dev sentences and cross-references dropped, findings kept. */
export function publicNote(t: string): string {
  return t
    .replace(/\s*\(see route\.caveat\)/g, "")
    .replace(/\u0007/g, "")
    .split(/(?<=\.)\s+(?=[A-Z'(“"])/)
    .filter((s) => !INTERNAL_NOTE.test(s))
    .join(" ")
    .trim();
}
