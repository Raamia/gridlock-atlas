"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { InspectorSection } from "@/lib/store";

export interface NavItem {
  id: InspectorSection;
  label: string;
  count?: number;
}

/**
 * Sticky section nav (sticks once the summary scrolls away): "Where · When · Coordination · Impact · Disagree (n) · Sources".
 * Scroll-spy marks the section in view (aria-current); a click scrolls the inspector (never the page) to that section.
 */
export function SectionNav({ items, active, onJump, stuck }: { items: NavItem[]; active: InspectorSection | null; onJump: (id: InspectorSection) => void; stuck: boolean }) {
  const uid = useId();
  const track = useRef<HTMLDivElement>(null);
  // keep the active item in view when the track overflows (narrow sheets)
  useEffect(() => {
    const el = active ? track.current?.querySelector<HTMLElement>(`[data-nav="${active}"]`) : null;
    const t = track.current;
    if (!el || !t || t.scrollWidth <= t.clientWidth) return;
    const left = el.offsetLeft - t.clientWidth / 2 + el.offsetWidth / 2;
    t.scrollTo({ left, behavior: "smooth" });
  }, [active]);
  return (
    <nav
      aria-label="Inspector sections"
      data-section-nav=""
      className={clsx(
        "sticky top-0 z-10 -mx-(--panel-pad) px-(--panel-pad) transition-[background-color,box-shadow] duration-200",
        stuck ? "bg-surface-solid shadow-[0_1px_0_var(--divider)]" : "bg-transparent",
      )}
    >
      {/* pill "bubbles": each section is a rounded chip; the one in view carries a sliding filled pill */}
      <div ref={track} className="flex flex-wrap items-center gap-1.5 py-2">
        {items.map((it) => {
          const on = it.id === active;
          return (
            <button
              key={it.id}
              type="button"
              data-nav={it.id}
              aria-current={on ? "location" : undefined}
              onClick={() => onJump(it.id)}
              className={clsx(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium whitespace-nowrap transition-colors duration-150",
                on ? "text-fg-1" : "bg-fill-1 text-fg-2 hover:bg-fill-2 hover:text-fg-1",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`insp-nav-${uid}`}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-fill-3 ring-1 ring-edge-strong ring-inset"
                  transition={{ type: "spring", bounce: 0.12, duration: 0.34 }}
                />
              )}
              <span className="relative">{it.label}</span>
              {it.count !== undefined && (
                <span
                  className={clsx(
                    "num relative inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[length:var(--text-label)] leading-none",
                    on ? "bg-fill-3 text-fg-1" : "bg-fill-2 text-fg-3",
                  )}
                >
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Which `[data-section]` is under the sticky nav, and whether the nav has stuck. Reads the scroller only (rAF-throttled).
 */
export function useScrollSpy(scroller: RefObject<HTMLElement | null>, ids: InspectorSection[]): { active: InspectorSection | null; stuck: boolean; scrolled: boolean } {
  const [state, setState] = useState<{ active: InspectorSection | null; stuck: boolean; scrolled: boolean }>({ active: null, stuck: false, scrolled: false });
  const key = ids.join();
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const nav = el.querySelector<HTMLElement>("[data-section-nav]");
      const navH = nav?.offsetHeight ?? 0;
      const stuck = !!nav && nav.getBoundingClientRect().top - box.top <= 0.5 && el.scrollTop > 0;
      let active: InspectorSection | null = null;
      for (const id of key.split(",") as InspectorSection[]) {
        const s = el.querySelector<HTMLElement>(`[data-section="${id}"]`);
        if (!s) continue;
        if (s.getBoundingClientRect().top - box.top <= navH + 32) active = id;
      }
      // the last section may be too short to reach the top: at the very bottom it is the one in view
      if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        const last = [...(key.split(",") as InspectorSection[])].reverse().find((id) => el.querySelector(`[data-section="${id}"]`));
        if (last) active = last;
      }
      const scrolled = el.scrollTop > 2;
      setState((p) => (p.active === active && p.stuck === stuck && p.scrolled === scrolled ? p : { active, stuck, scrolled }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scroller, key]);
  return state;
}

/** Scroll the inspector (only) so `target` sits just under the sticky nav (or `offset` px from the top, above the nav). */
export function scrollInspectorTo(scroller: HTMLElement, target: HTMLElement, smooth: boolean, offset?: number) {
  const nav = offset ?? (scroller.querySelector<HTMLElement>("[data-section-nav]")?.offsetHeight ?? 0) - 1;
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - nav;
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}
