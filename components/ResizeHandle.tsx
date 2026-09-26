"use client";

import clsx from "clsx";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAtlas, type AtlasState } from "@/lib/store";

type Edge = "left" | "right" | "top";
type SizeKey = "dockHeight" | "railWidth" | "inspectorWidth";

/**
 * A drag handle on one edge of a floating panel (role="separator"). Drag, arrow keys (Shift = bigger steps) or
 * Home to reset; double-click also resets. The raw size goes to the store; lib/layout clamps it against the viewport.
 */
export function ResizeHandle({ edge, sizeKey, current, min, max, label }: { edge: Edge; sizeKey: SizeKey; current: number; min: number; max: number; label: string }) {
  const set = useAtlas((s) => s.set);
  const drag = useRef<{ id: number; from: number; size: number } | null>(null);
  const vertical = edge === "top";
  // dragging toward the panel's inside shrinks it: the rail grows rightward, the inspector leftward, the dock upward
  const sign = edge === "right" ? 1 : -1;
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  const write = (v: number | null) => set({ [sizeKey]: v } as Partial<AtlasState>);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, from: vertical ? e.clientY : e.clientX, size: current };
    set({ resizing: true });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    write(clamp(d.size + sign * ((vertical ? e.clientY : e.clientX) - d.from)));
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    set({ resizing: false });
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const grow = vertical ? "ArrowUp" : edge === "right" ? "ArrowRight" : "ArrowLeft";
    const shrink = vertical ? "ArrowDown" : edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) write(clamp(current + step));
    else if (e.key === shrink) write(clamp(current - step));
    else if (e.key === "Home" || e.key === "Enter") write(null);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(current)}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`${label} · drag, or use the arrow keys · double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => write(null)}
      onKeyDown={onKeyDown}
      className={clsx(
        "group absolute z-50 flex touch-none items-center justify-center outline-none",
        vertical ? "inset-x-0 -top-[7px] h-3.5 cursor-row-resize" : "inset-y-0 w-3.5 cursor-col-resize",
        edge === "right" && "-right-[9px]",
        edge === "left" && "-left-[9px]",
      )}
    >
      {/* always-visible grip, so the affordance is discoverable; brightens on hover, drag and keyboard focus */}
      <span
        aria-hidden
        className={clsx(
          "rounded-full bg-fg-4 transition-colors group-hover:bg-fg-2 group-focus-visible:bg-fg-1 group-active:bg-fg-1",
          vertical ? "h-1 w-10" : "h-10 w-1",
        )}
      />
    </div>
  );
}

const STORAGE_KEY = "gridlock.panel-sizes";

/** Restores dragged panel sizes for this browser and saves them as they change. Best effort: storage may be blocked. */
export function usePanelSizePersistence() {
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Record<SizeKey, number | null>> | null;
      if (saved) {
        const patch: Partial<AtlasState> = {};
        for (const k of ["dockHeight", "railWidth", "inspectorWidth"] as const) if (typeof saved[k] === "number") patch[k] = saved[k];
        useAtlas.getState().set(patch);
      }
    } catch {
      /* no storage: defaults */
    }
    return useAtlas.subscribe((s, prev) => {
      if (s.dockHeight === prev.dockHeight && s.railWidth === prev.railWidth && s.inspectorWidth === prev.inspectorWidth) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ dockHeight: s.dockHeight, railWidth: s.railWidth, inspectorWidth: s.inspectorWidth }));
      } catch {
        /* no storage: sizes last for this visit */
      }
    });
  }, []);
}
