import fs from "node:fs";
import path from "node:path";
import { normalize } from "./textnorm";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const CACHE = path.join(ROOT, "data", "sources", ".cache");

export interface CacheMeta {
  id: string;
  url: string;
  publisher: string;
  title: string;
  sourceType: "utility" | "regulator" | "rto";
  publishedAt?: string | null;
  updatedAt?: string | null;
  retrievedAt: string;
  sha256: string;
  mimeType: string;
  bytes: number;
  pageCount: number | null;
}

export function readMeta(id: string): CacheMeta | null {
  const f = path.join(CACHE, "meta", `${id}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as CacheMeta) : null;
}

const pageCache = new Map<string, Map<number | null, string>>();

/** Normalized text per page (null key = HTML page). */
export function pagesOf(id: string): Map<number | null, string> | null {
  if (pageCache.has(id)) return pageCache.get(id)!;
  const dir = path.join(CACHE, "text", id);
  if (!fs.existsSync(dir)) return null;
  const out = new Map<number | null, string>();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".txt")) continue;
    const page = f.startsWith("p") ? Number(f.slice(1, 5)) : null;
    out.set(page, normalize(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  pageCache.set(id, out);
  return out;
}

export type Located = { status: "found"; pages: (number | null)[] } | { status: "not-found" } | { status: "no-cache" };

/** Is the excerpt present verbatim (after normalization)? Checks the cited page first, then all pages. */
export function locate(sourceId: string, excerpt: string): Located {
  const pages = pagesOf(sourceId);
  if (!pages) return { status: "no-cache" };
  const needle = normalize(excerpt);
  const hits: (number | null)[] = [];
  for (const [p, text] of pages) if (text.includes(needle)) hits.push(p);
  // PDF text can split an excerpt across a page break: accept a join of adjacent pages
  if (!hits.length) {
    const nums = [...pages.keys()].filter((k): k is number => k !== null).sort((a, b) => a - b);
    for (let i = 0; i + 1 < nums.length; i++) {
      if (`${pages.get(nums[i])} ${pages.get(nums[i + 1])}`.includes(needle)) hits.push(nums[i]);
    }
  }
  return hits.length ? { status: "found", pages: hits } : { status: "not-found" };
}
