"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SPONSOR_RADIUS_MILES } from "@/lib/sponsor";
import { useAtlas } from "@/lib/store";
import { Spinner, Tooltip } from "../ui";

const MIN = 5;
const MAX = 100;
const STEP = 5;
/** ≤180 ms (test I2 moves End → Home 300 ms apart and expects the newest radius to win; the store's race guard does the rest). */
const DEBOUNCE_MS = 160;

/** Where a value sits on the track, accounting for the 16px thumb (its centre never reaches the ends). */
const at = (v: number) => `calc(8px + (100% - 16px) * ${(v - MIN) / (MAX - MIN)})`;
/** G2, verbatim after the radius it describes: "Project centers within 25 mi · a review heuristic, not a regulatory standard. Re-runs the engine." */
const hint = (r: number) => `Project centers within ${r}\u00a0mi · a review heuristic, not a regulatory standard. Re-runs the engine.`;

/**
 * Review radius: one row — label · native range (Home/End, toHaveValue) · value — that quietly re-runs the engine.
 * A tick under the track marks Sperry's 25-mile rule (a button: back to the rule). The hint is the honesty line (G2);
 * `compact` (short laptop screens) moves it into the tooltip of an (i) beside the label.
 */
export function RadiusControl({ compact }: { compact?: boolean }) {
  const threshold = useAtlas((s) => s.thresholdMiles);
  const runRadius = useAtlas((s) => s.run?.thresholdMiles);
  const compare = useAtlas((s) => s.compare);
  const [local, setLocal] = useState(threshold);
  // follow the store when something else (guided demo, deep link, Re-run) changes the radius
  const [seen, setSeen] = useState(threshold);
  if (seen !== threshold) {
    setSeen(threshold);
    setLocal(threshold);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (v: number) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void compare({ thresholdMiles: v, quiet: true }), DEBOUNCE_MS);
  };
  const pending = runRadius !== undefined && runRadius !== local;
  const onRule = local === SPONSOR_RADIUS_MILES;

  return (
    // compact: room under the track for the "Sperry rule" label, which the hint's margin gives otherwise
    <div className={clsx(compact && "pb-4")}>
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 items-center gap-1">
          <label htmlFor="review-radius" className="text-ui font-medium text-fg-1">
            Review radius
          </label>
          {compact && (
            <Tooltip content={hint(local)} side="bottom" align="start">
              <button type="button" aria-label="About the review radius" className="-my-1 grid size-5 place-items-center rounded-full text-fg-3 transition-colors hover:text-fg-1 coarse:size-6">
                <Info aria-hidden size={13} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            id="review-radius"
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={local}
            aria-label="Review radius"
            aria-valuetext={`${local} miles`}
            onChange={(e) => commit(Number(e.target.value))}
            className="range relative z-[1] block"
            style={{ "--range-fill": `${((local - MIN) / (MAX - MIN)) * 100}%` } as CSSProperties}
          />
          {/* Sperry's rule: a tick through the track, labelled underneath */}
          <span aria-hidden className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg-2" style={{ left: at(SPONSOR_RADIUS_MILES) }} />
          <button
            type="button"
            onClick={() => !onRule && commit(SPONSOR_RADIUS_MILES)}
            aria-label={`Sperry rule: ${SPONSOR_RADIUS_MILES} mi${onRule ? " (current)" : " — set the review radius back to it"}`}
            aria-disabled={onRule || undefined}
            className="absolute top-full -mt-0.5 -translate-x-1/2 rounded-chip px-1 text-[11px] leading-4 whitespace-nowrap text-fg-3 transition-colors hover:text-fg-1 aria-disabled:cursor-default aria-disabled:hover:text-fg-3"
            style={{ left: at(SPONSOR_RADIUS_MILES) }}
          >
            Sperry rule
          </button>
        </div>
        <span className="flex w-[60px] shrink-0 items-center justify-end gap-1.5">
          {pending && <Spinner size={12} className="text-fg-3" />}
          <output htmlFor="review-radius" className="num text-ui font-medium whitespace-nowrap text-fg-1">
            {local} mi
          </output>
        </span>
      </div>
      {!compact && <p className="mt-5 text-caption text-fg-3">{hint(local)}</p>}
    </div>
  );
}
