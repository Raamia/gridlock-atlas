"use client";

import { Check, ChevronRight } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { PROOF_TEXT, sperryProof } from "./model";

/**
 * "✓ Reproduces Sperry's worked example · 6/6 overlap rows · 10/10 project rows" → Method at "Proof at a glance".
 * Rendered only when the engine reproduces the starter file exactly (no run needed). `stacked` gives the counts their
 * own line (the hero, and the results panel on tall screens); short laptop screens get one line.
 */
export function ProofButton({ className, stacked }: { className?: string; stacked?: boolean }) {
  const openMethod = useAtlas((s) => s.openMethod);
  const p = sperryProof();
  if (!p.ok) return null;
  return (
    <button
      type="button"
      onClick={() => openMethod("proof")}
      aria-label={PROOF_TEXT(p)}
      title="Open Method & audit at “Proof at a glance”"
      className={`group flex w-full items-center gap-2 rounded-control bg-fill-1 text-left transition-colors duration-150 hover:bg-fill-2 ${stacked ? "px-3 py-1.5" : "h-8 px-2.5"} ${className ?? ""}`}
    >
      <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-full bg-ok/[0.12] text-ok ring-1 ring-ok/30 ring-inset">
        <Check size={11} strokeWidth={2.75} />
      </span>
      {stacked ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-caption font-medium text-fg-1">Reproduces Sperry’s worked example</span>
          <span className="block truncate text-caption leading-4 text-fg-3">
            <span className="num">
              {p.rows}/{p.rows}
            </span>{" "}
            overlap rows ·{" "}
            <span className="num">
              {p.projects}/{p.projects}
            </span>{" "}
            project rows
          </span>
        </span>
      ) : (
        // one line (short laptop screens): the ✓ says "reproduces"; the full sentence is the accessible name
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-caption font-medium text-fg-1">Sperry’s worked example</span>
          <span className="num ml-auto shrink-0 text-[11px] text-fg-3">
            {p.rows}/{p.rows} · {p.projects}/{p.projects}
          </span>
        </span>
      )}
      <ChevronRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}
