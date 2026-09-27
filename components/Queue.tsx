"use client";

import clsx from "clsx";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useTier } from "@/lib/layout";
import { useAtlas } from "@/lib/store";
import { Hero } from "./results/Hero";
import { Results } from "./results/Results";
import { Button } from "./ui";

/**
 * The Opportunities panel (SPEC §4 A–C): pre-run hero → comparing (≥900 ms) → ranked results. It fills the rail slot
 * (docked panel · lg/md overlay behind the "Opportunities · N" pill · phone bottom sheet) and brings its own surface
 * except on phones, where the sheet is the surface. `aside aria-label="Coordination queue"` is a test hook.
 */
export function Queue() {
  const run = useAtlas((s) => s.run);
  const running = useAtlas((s) => s.running);
  const runError = useAtlas((s) => s.runError);
  const snap = useAtlas((s) => s.sheetSnap);
  const phone = useTier() === "phone";

  const error = runError && !running ? <EngineError message={runError} hasRun={!!run} /> : null;

  return (
    <aside
      aria-label="Coordination queue"
      className={clsx(
        "relative flex h-full min-h-0 flex-col",
        !phone && "panel rounded-panel transition-[height] duration-(--dur-4) ease-enter [interpolate-size:allow-keywords]",
        // before a run the hero card hugs its content (more map shows); results take the full rail
        !phone && !run && "h-auto! max-h-full",
      )}
    >
      {/* a re-run keeps the list on screen (dimmed); only the first comparison shows the hero's progress */}
      {run ? <Results phone={phone} snap={snap} error={error} /> : <Hero phone={phone} error={error} />}
    </aside>
  );
}

/** The page's one engine-failure message (role=alert; the only text matching /failed|could not/). */
function EngineError({ message, hasRun }: { message: string; hasRun: boolean }) {
  const compare = useAtlas((s) => s.compare);
  return (
    <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-control bg-warn/[0.08] px-3 py-2.5 ring-1 ring-warn/25 ring-inset">
      <AlertTriangle aria-hidden size={14} strokeWidth={2} className="mt-px shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-caption text-fg-1">
        Comparison failed: {message}.{hasRun ? " The last successful run is still shown." : ""}
      </p>
      <Button size="sm" variant="secondary" icon={<RotateCw size={12} strokeWidth={2} />} className="-my-0.5" onClick={() => void compare({ explicit: !hasRun })}>
        Retry
      </Button>
    </div>
  );
}
