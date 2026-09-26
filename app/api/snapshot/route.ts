import { SNAPSHOT } from "@/lib/data/snapshot";

/** Snapshot metadata, utilities, projects and source references (plan.md §10). */
export async function GET() {
  return Response.json(SNAPSHOT);
}
