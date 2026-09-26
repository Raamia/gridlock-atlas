"use client";

import clsx from "clsx";
import { ClipboardCheck, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { Match } from "@/lib/domain/types";
import { LABELS, useReview } from "@/lib/review";
import { Eyebrow } from "./ui";

/**
 * Reviewer label block (reviewer mode only): four labels, a live timer and a note that is saved as it is typed.
 * Hooks the tests use: "Reviewer label", aria-label "Time on this pair", the label buttons (aria-pressed),
 * textbox "Reviewer note" (after a label is saved), "Saved in this browser".
 */
export function ReviewPanel({ m }: { m: Match }) {
  const enabled = useReview((s) => s.enabled);
  const saved = useReview((s) => s.labels[m.id]);
  const setLabel = useReview((s) => s.setLabel);
  const setNote = useReview((s) => s.setNote);
  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enabled]);
  if (!enabled) return null;
  const seconds = Math.max(0, Math.round((now - openedAt) / 1000));
  return (
    <div className="rounded-card bg-fill-1 p-3" data-review-panel="">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5">
          <ClipboardCheck aria-hidden size={12} strokeWidth={1.75} /> Reviewer label
        </Eyebrow>
        <span className="num flex items-center gap-1 text-caption text-fg-2" aria-label="Time on this pair">
          <Timer aria-hidden size={12} strokeWidth={1.75} className="text-fg-3" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        {LABELS.map((l) => {
          const on = saved?.label === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLabel(m.id, l.id, seconds)}
              aria-pressed={on}
              className={clsx(
                "h-8 truncate rounded-control px-2.5 text-caption font-medium transition-colors duration-150 coarse:h-11",
                on
                  ? l.id === "worth-review"
                    ? "bg-ok/12 text-ok shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ok)_40%,transparent)]"
                    : "bg-fill-3 text-fg-1 shadow-[inset_0_0_0_1px_var(--edge-strong)]"
                  : "bg-fill-1 text-fg-2 hover:bg-fill-2 hover:text-fg-1",
              )}
            >
              {l.text}
            </button>
          );
        })}
      </div>
      {saved && (
        <input
          defaultValue={saved.note ?? ""}
          // saved as typed: closing the inspector (Escape) unmounts the field without a blur
          onChange={(e) => setNote(m.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Optional note"
          aria-label="Reviewer note"
          className="mt-2 h-8 w-full rounded-control bg-fill-1 px-3 text-ui text-fg-1 ring-1 ring-edge ring-inset transition-[background-color,box-shadow] duration-150 placeholder:text-fg-4 hover:bg-fill-2 focus-visible:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-1/80 coarse:h-11"
        />
      )}
      {saved && (
        <p className="mt-2 text-caption text-fg-3">
          Saved in this browser after <span className="num">{saved.seconds}s</span> · export from the Method drawer
        </p>
      )}
    </div>
  );
}
