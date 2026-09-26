import { SAVED } from "@/lib/permits";
import { checkSince } from "@/lib/permits-live";

// two county searches (paged) and one map query against public state portals
export const maxDuration = 60;

/**
 * Live permit check: utility-like land-disturbance filings submitted since the saved check (data/permits), minus the
 * ones it already lists. POST, so it is never cached and runs only when a person asks.
 */
export async function POST() {
  const since = SAVED.retrievedAt.slice(0, 10);
  try {
    const live = await checkSince(since);
    const seenGa = new Set(SAVED.georgia.utilityFilings.map((f) => f.submissionId));
    const seenSc = new Set(SAVED.southCarolina.utilityBoundaries.map((b) => b.objectId));
    live.georgia.newFilings = live.georgia.newFilings.filter((f) => !seenGa.has(f.submissionId));
    live.southCarolina.newBoundaries = live.southCarolina.newBoundaries.filter((b) => !seenSc.has(b.objectId));
    return Response.json(live, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "permit portals did not answer" }, { status: 502 });
  }
}
