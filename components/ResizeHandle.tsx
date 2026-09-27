"use client";

import clsx from "clsx";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAtlas, type AtlasState } from "@/lib/store";

type Edge = "left" | "right" | "top";
type SizeKey = "dockHeight" | "railWidth" | "inspectorWidth";

const SIZE_KEYS: readonly SizeKey[] = ["dockHeight", "railWidth", "inspectorWidth"];
/** Arrow-key steps (px); Shift takes the big one. */
const STEP = 16;
const BIG_STEP = 64;

/**
 * A resize handle on one edge of a floating panel (`role="separator"`, focusable): drag it, or use the arrow keys (Shift =
 * bigger steps); Home or Enter, or a double-click, go back to the default size. The raw size goes to the store and
 * lib/layout clamps it against the viewport, so `min` / `max` here only mirror the layout's range (aria-value*).
 * The grip is always there (a resize you have to discover by hovering is a resize nobody finds) but quiet at rest (45%),
 * so three grips never compete with the panels on a projector; it turns fully opaque and brightens on hover, drag and focus.
 */
export function ResizeHandle({ edge, sizeKey, current, min, max, label }: { edge: Edge; sizeKey: SizeKey; current: number; min: number; max: number; label: string }) {
  const set = useAtlas((s) => s.set);
  const drag = useRef<{ id: number; from: number; size: number } | null>(null);
  const vertical = edge === "top";
  // dragging away from the panel grows it: the rail grows rightward, the inspector leftward, the dock upward
  const sign = edge === "right" ? 1 : -1;
  const lo = Math.min(min, current);
  const hi = Math.max(max, current);
  const clampSize = (v: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  const write = (v: number | null) => set({ [sizeKey]: v } as Partial<AtlasState>);

  // unmounted mid-drag (a tier change, the pair closing): never leave the shell stuck in resize mode
  useEffect(
    () => () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.removeProperty("cursor");
      useAtlas.getState().set({ resizing: false });
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, from: vertical ? e.clientY : e.clientX, size: current };
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    set({ resizing: true });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = clampSize(d.size + sign * ((vertical ? e.clientY : e.clientX) - d.from));
    if (next !== Math.round(current)) write(next);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    document.body.style.removeProperty("cursor");
    set({ resizing: false });
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const grow = vertical ? "ArrowUp" : edge === "right" ? "ArrowRight" : "ArrowLeft";
    const shrink = vertical ? "ArrowDown" : edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) write(clampSize(current + step));
    else if (e.key === shrink) write(clampSize(current - step));
    else if (e.key === "Home" || e.key === "Enter") write(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(current)}
      aria-valuemin={Math.round(lo)}
      aria-valuemax={Math.round(hi)}
      aria-valuetext={`${Math.round(current)} pixels`}
      title={`${label} · drag or use the arrow keys · double-click to reset`}
      data-resize-handle={edge}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => write(null)}
      onKeyDown={onKeyDown}
      className={clsx(
        // a 12px strip, 2px over the panel edge and 10px into the gap to the map: it never covers the panel's own
        // scrollbar. The focus cue is the grip itself (brighter, ringed)
        "group absolute z-20 flex touch-none items-center justify-center outline-none",
        vertical ? "inset-x-6 -top-2.5 h-3 cursor-row-resize" : "inset-y-6 w-3 cursor-col-resize",
        edge === "right" && "-right-2.5",
        edge === "left" && "-left-2.5",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "rounded-full bg-fg-4/80 opacity-45 shadow-[0_0_0_1px_rgb(0_0_0/0.35)] transition-[background-color,width,height,opacity] duration-(--dur-1) ease-enter",
          "group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100",
          "group-hover:bg-fg-2 group-active:bg-fg-1 group-focus-visible:bg-fg-1 group-focus-visible:shadow-[0_0_0_2px_var(--canvas),0_0_0_4px_var(--fg-1)]",
          vertical ? "h-1 w-10 group-hover:w-12 group-focus-visible:w-12" : "h-10 w-1 group-hover:h-12 group-focus-visible:h-12",
        )}
      />
    </div>
  );
}

const STORAGE_KEY = "gridlock.panel-sizes";

/** Restores the panel sizes dragged in this browser and saves them as they change. Best effort: storage may be blocked. */
export function usePanelSizePersistence() {
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Record<SizeKey, unknown>> | null;
      if (saved && typeof saved === "object") {
        const patch: Partial<Record<SizeKey, number>> = {};
        for (const k of SIZE_KEYS) {
          const v = saved[k];
          if (typeof v === "number" && Number.isFinite(v) && v > 0) patch[k] = Math.round(v);
        }
        // restored in "resize mode", so the panels take their saved sizes at once instead of sliding there on load
        if (Object.keys(patch).length) {
          useAtlas.getState().set({ ...patch, resizing: true });
          requestAnimationFrame(() => requestAnimationFrame(() => useAtlas.getState().set({ resizing: false })));
        }
      }
    } catch {
      /* no storage, or a stale value: the defaults */
    }
    // saved when a drag ends (and on every keyboard step), not on every pointer move
    return useAtlas.subscribe((s, prev) => {
      if (s.resizing) return;
      if (!prev.resizing && SIZE_KEYS.every((k) => s[k] === prev[k])) return;
      try {
        if (SIZE_KEYS.every((k) => s[k] === null)) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify({ dockHeight: s.dockHeight, railWidth: s.railWidth, inspectorWidth: s.inspectorWidth }));
      } catch {
        /* no storage: the sizes last for this visit */
      }
    });
  }, []);
}
