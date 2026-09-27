"use client";

import { pluralize } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { Kbd, Tooltip } from "../ui";
import { fmt, SNAPSHOT_DATE, SOURCE_COUNT } from "./model";

export interface Unflagged {
  notFlagged: number;
  beyond: number;
  unlocated: number;
  archived: number;
  radius: number;
  scope: string;
}

/**
 * Panel footer caption (pre-run and post-run): public-data provenance with the snapshot date, the source registry,
 * and — after a run — what the engine did not flag (opens Method at "What the engine excluded") plus the J/K hint.
 */
export function Footer({ unflagged, keys }: { unflagged?: Unflagged | null; keys?: boolean }) {
  const set = useAtlas((s) => s.set);
  const openMethod = useAtlas((s) => s.openMethod);
  const u = unflagged;
  const sources = (
    <button type="button" onClick={() => set({ sourcesOpen: true, methodOpen: false })} className="relative -mx-0.5 shrink-0 rounded-chip px-0.5 text-fg-2 transition-colors tap-44 hover:text-fg-1">
      <span className="num">{SOURCE_COUNT}</span> sources
    </button>
  );
  const provenance = `Public planning data · Snapshot ${SNAPSHOT_DATE}`;
  if (!u)
    return (
      // unbreakable segments with the separator at a segment's end: a wrap never starts a line with "·"
      <div className="shrink-0 border-t border-divider px-(--panel-pad) pt-2.5 pb-3 text-caption text-fg-3">
        <span className="whitespace-nowrap">Public planning data ·</span> <span className="whitespace-nowrap">Snapshot {SNAPSHOT_DATE} ·</span>{" "}
        {sources}
      </div>
    );
  return (
    <div className="@container shrink-0 space-y-1 border-t border-divider px-(--panel-pad) pt-2.5 pb-3 text-caption text-fg-3">
      <div className="flex items-center justify-between gap-3">
        <Tooltip
          side="top"
          align="start"
          content={`${fmt(u.beyond)} ${u.beyond === 1 ? "pair" : "pairs"}${u.scope} farther than ${u.radius} mi with no shared facility · ${fmt(u.unlocated)} where a location is unknown · ${pluralize(u.archived, "archived project")}. Opens Method.`}
        >
          {/* the ellipsis sits on the inner span: a clipped button would clip its 44px touch area too */}
          <button type="button" onClick={() => openMethod("excluded")} className="relative -mx-1 flex min-w-0 rounded-chip px-1 text-left text-fg-2 transition-colors tap-44 hover:text-fg-1">
            <span className="truncate">
              {u.notFlagged > 0 ? (
                <>
                  <span className="num">{fmt(u.notFlagged)}</span> not flagged — why?
                </>
              ) : (
                "Every pair checked is flagged — see Method"
              )}
            </span>
          </button>
        </Tooltip>
        {sources}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate">{provenance}</p>
        {keys && (
          <span aria-hidden title="J / K step through the list" className="hidden shrink-0 cursor-default items-center gap-1 @[324px]:flex coarse:hidden!">
            <Kbd size="sm">J</Kbd>
            <Kbd size="sm">K</Kbd>
          </span>
        )}
      </div>
    </div>
  );
}
