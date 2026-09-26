"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus: move focus into the dialog when it opens, keep Tab inside it, restore focus on close.
 * A `companion` (the guided-demo card riding above the brief) joins the Tab cycle ahead of the dialog, and focus
 * already on it stays there.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, opts?: { companion?: () => HTMLElement | null }) {
  const companion = opts?.companion;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusFirst = () => {
      if (companion?.()?.contains(document.activeElement)) return;
      const first = node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus();
    };
    const t = window.setTimeout(focusFirst, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !node) return;
      const comp = companion?.();
      const items = [...(comp ? comp.querySelectorAll<HTMLElement>(FOCUSABLE) : []), ...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      if (comp) {
        // the card sits elsewhere in the DOM (the map's backdrop-covered Timeline follows it), so the whole cycle is managed
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [ref, open, companion]);
}
