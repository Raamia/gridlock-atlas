import type { Snapshot } from "@/lib/domain/types";
import raw from "@/data/snapshot.json";

/** Frozen, reviewed, normalized snapshot — the app never depends on live sources at demo time. */
export const SNAPSHOT = raw as unknown as Snapshot;
