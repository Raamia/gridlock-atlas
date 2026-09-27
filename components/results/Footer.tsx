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
    <button type="button" onClick={() => set({ sourcesOpen: true, methodOpen: false })} className="-mx-0.5 shrink-0 rounded-chip px-0.5 text-fg-2 transition-colors hover:text-fg-1">
      <span className="num">{SOURCE_COUNT}</span> sources
    </button>
  );
  const provenance = `Public planning data · Snapshot ${SNAPSHOT_DATE}`;
  if (!u)
    return (
      <div className="shrink-0 border-t border-divider px-(--panel-pad) pt-2.5 pb-3 text-caption text-pretty text-fg-3">
        {provenance} · {sources}
      </div>
    );
  return (
    <div className="@container shrink-0 space-y-1 border-t border-divider px-(--panel-pad) pt-2.5 pb-3 text-caption text-fg-3">
      <div className="flex items-center justify-between gap-3">
        <Tooltip
          side="top"
          align="start"
          content={`${fmt(u.beyond)} ${u.beyond === 1 ? "pair" : "pairs"}${u.scope} with closest points farther than ${u.radius} mi · ${fmt(u.unlocated)} where a location is unknown · ${pluralize(u.archived, "archived project")}. Opens Method.`}
        >
          <button type="button" onClick={() => openMethod("excluded")} className="-mx-1 truncate rounded-chip px-1 text-left text-fg-2 transition-colors hover:text-fg-1">
            {u.notFlagged > 0 ? (
              <>
                <span className="num">{fmt(u.notFlagged)}</span> not flagged — why?
              </>
            ) : (
              "Every pair checked is flagged — see Method"
            )}
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
