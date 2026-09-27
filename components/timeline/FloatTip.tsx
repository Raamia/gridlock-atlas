"use client";

import clsx from "clsx";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A hover card for timeline marks that aren't DOM buttons (a tick under the pointer, a bar, a diamond): rendered on <body>,
 * fixed, above the anchor rect (below it when there's no room), clamped to the viewport, never taking the pointer.
 * Same material as the shared Tooltip (popover), a little wider for document titles.
 */
export function FloatTip({ anchor, children, maxWidth = 320, className }: { anchor: DOMRect; children: ReactNode; maxWidth?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const cx = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(m, cx - w / 2), Math.max(m, vw - w - m));
    const above = anchor.top - 8 - h;
    const top = above >= m ? above : Math.min(anchor.bottom + 8, window.innerHeight - h - m);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = "visible";
  });

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      data-portal=""
      style={{ position: "fixed", left: 0, top: 0, maxWidth, visibility: "hidden", zIndex: "var(--z-tooltip)" }}
      className={clsx("popover pointer-events-none w-max animate-pop-in rounded-card px-3 py-2 text-caption text-fg-2", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
