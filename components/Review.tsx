"use client";

import clsx from "clsx";
import { ClipboardCheck, Download, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { IDX } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { download, LABELS, labelsCsv, useReview } from "@/lib/review";
import { Button } from "./ui";

/** Label + timer strip shown at the top of the inspector in reviewer mode. */
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
  const seconds = Math.round((now - openedAt) / 1000);
  return (
    <div className="rounded-xl border border-a/30 bg-a/5 p-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow flex items-center gap-1.5 text-a">
          <ClipboardCheck size={12} /> Reviewer label
        </span>
        <span className="num flex items-center gap-1 text-[11px] text-text-2" aria-label="Time on this pair">
          <Timer size={11} /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {LABELS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLabel(m.id, l.id, seconds)}
            aria-pressed={saved?.label === l.id}
            className={clsx(
              "h-7 rounded-md px-2 text-[11.5px] ring-1 transition-colors",
              saved?.label === l.id ? "bg-a/15 text-text-0 ring-a/60" : "bg-bg-2 text-text-2 ring-line hover:text-text-0",
            )}
          >
            {l.text}
          </button>
        ))}
      </div>
      {saved && (
        <input
          defaultValue={saved.note ?? ""}
          // saved as typed: closing the inspector (Escape) unmounts the field without a blur
          onChange={(e) => setNote(m.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Optional note"
          aria-label="Reviewer note"
          className="mt-2 h-7 w-full rounded-md border border-line-2 bg-bg-1 px-2 text-[11.5px] text-text-0 outline-none placeholder:text-text-3 focus:border-a"
        />
      )}
      {saved && <div className="mt-1.5 text-[10.5px] text-text-3">Saved in this browser after {saved.seconds}s · export from the Method drawer</div>}
    </div>
  );
}

/** Export controls (Method drawer). */
export function ReviewExports() {
  const labels = useReview((s) => s.labels);
  const checked = useReview((s) => s.checked);
  const enabled = useReview((s) => s.enabled);
  const toggle = useReview((s) => s.toggle);
  const clear = useReview((s) => s.clear);
  const n = Object.keys(labels).length;
  const c = Object.keys(checked).length;
  const meta = (id: string) => {
    const [a, b] = id.split("__");
    return { project_a: IDX.project(a)?.title ?? a, project_b: IDX.project(b)?.title ?? b };
  };
  return (
    <div className="rounded-xl bg-bg-2 p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] text-text-1">
          <span className="num text-text-0">{n}</span> pairs labeled · <span className="num text-text-0">{c}</span> excerpts human-checked
        </div>
        <Button size="sm" variant={enabled ? "subtle" : "outline"} onClick={toggle}>
          <ClipboardCheck size={12} /> {enabled ? "Reviewer mode on" : "Turn on reviewer mode"}
        </Button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={!n} onClick={() => download("gridlock-labels.csv", labelsCsv(labels, meta), "text/csv")}>
          <Download size={12} /> Labels CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!c}
          onClick={() => download("review-log.json", JSON.stringify({ reviewedEvidenceIds: Object.keys(checked).sort(), exportedAt: new Date().toISOString() }, null, 1), "application/json")}
        >
          <Download size={12} /> review-log.json
        </Button>
        <Button size="sm" variant="ghost" disabled={!n && !c} onClick={clear}>
          Clear
        </Button>
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-text-3">
        Labels stay in this browser. Commit review-log.json to data/ and rebuild the snapshot to publish excerpts as human-checked.
      </p>
    </div>
  );
}
