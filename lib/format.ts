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

export function formatWindow(start: DateBound, end: DateBound, openEnded?: boolean): string {
  if (openEnded || end.latest >= "2090") return `from ${formatPoint(start.earliest, start.precision)}`;
  const a = formatPoint(start.earliest, start.precision);
  const z = formatPoint(end.latest, end.precision);
  return a === z ? a : `${a}–${z}`;
}

export function formatMiles(mi: number): string {
  if (mi < 1) return "<1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
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
