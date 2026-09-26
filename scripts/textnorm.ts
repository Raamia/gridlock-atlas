/** Mirrors scripts/ingest/textnorm.py so Python and TypeScript excerpt checks agree. */
const QUOTES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "′": "'",
  "″": '"',
};
const DASHES: Record<string, string> = { "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-" };

export function normalize(text: string): string {
  let t = text.normalize("NFKC").replace(/­/g, "");
  for (const [k, v] of Object.entries({ ...QUOTES, ...DASHES })) t = t.split(k).join(v);
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}
