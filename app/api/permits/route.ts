import { cleanQuery, SAVED } from "@/lib/permits";
import { checkSince, searchByName } from "@/lib/permits-live";

// county searches (paged) and a map query against public state portals
export const maxDuration = 60;

/**
 * Live permit search against Georgia EPD GEOS and SC DES. POST, so it is never cached and runs only when a person asks.
 *   { "q": "Goshen" }  filings whose facility / project name contains the text
 *   {}                 utility-like filings submitted since the saved check (data/permits), minus the ones it lists
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  try {
    if (typeof body.q === "string" && body.q.trim()) {
      const q = cleanQuery(body.q);
      if (!q) return Response.json({ error: "Type 2–60 letters or numbers" }, { status: 400 });
      return Response.json(await searchByName(q), { headers: { "Cache-Control": "no-store" } });
    }
    const live = await checkSince(SAVED.retrievedAt.slice(0, 10));
    const seenGa = new Set(SAVED.georgia.utilityFilings.map((f) => f.submissionId));
    const seenSc = new Set(SAVED.southCarolina.utilityBoundaries.map((b) => b.objectId));
    live.georgia.newFilings = live.georgia.newFilings.filter((f) => !seenGa.has(f.submissionId));
    live.southCarolina.newBoundaries = live.southCarolina.newBoundaries.filter((b) => !seenSc.has(b.objectId));
    return Response.json(live, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "permit portals did not answer" }, { status: 502 });
  }
}
