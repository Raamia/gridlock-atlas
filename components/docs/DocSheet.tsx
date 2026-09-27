"use client";

/**
 * The large reading sheet behind "Method & audit" and "Source registry": a solid dialog (max 1040 × 88dvh, dialog
 * radius) over a dark blurred scrim, a sticky table of contents on the left from 1024px (a horizontal chip scroller
 * below that) and one scrolling reading column. Sections mark themselves with `data-doc-section={id}`; the sheet
 * scroll-spies them and jumps to one on request (`jump`), which is how `openMethod(section)` lands on a section.
 */

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/focus";
import { IconButton } from "../ui";

export interface TocItem {
  id: string;
  label: string;
  /** Right-aligned mono meta (a count). */
  meta?: ReactNode;
}

export interface DocJump {
  id: string;
  /** Changes on every request, so asking for the same section twice scrolls again. */
  nonce: number;
}

export interface DocSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog, and its visible title. */
  title: string;
  eyebrow: string;
  /** Caption under the title (scope, snapshot). */
  meta?: ReactNode;
  toc: TocItem[];
  tocLabel: string;
  /** Scroll to this section (instantly) whenever it changes. */
  jump?: DocJump | null;
  /** Called after a `jump` was applied. */
  onJumped?: () => void;
  children: ReactNode;
}

const EASE = [0.22, 1, 0.36, 1] as const;
/** A section counts as "current" once its top is this close to the top of the reading column. */
const SPY_OFFSET = 120;

export function DocSheet({ open, onClose, title, eyebrow, meta, toc, tocLabel, jump, onJumped, children }: DocSheetProps) {
  const panel = useRef<HTMLElement>(null);
  useDialogFocus(panel, open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="doc-sheet"
          className="fixed inset-0 z-(--z-dialog) flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div aria-hidden className="absolute inset-0 bg-canvas/70 backdrop-blur-md" onClick={onClose} />
          {/* never a bare `border-b` on the sheet: while the legacy colour alias "b" exists it also paints the border violet */}
          <motion.section
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99, transition: { duration: 0.18 } }}
            transition={{ duration: 0.34, ease: EASE }}
            className="sheet relative flex h-[94dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-dialog max-sm:border-b-0 sm:h-[88dvh] sm:rounded-dialog"
          >
            <SheetBody title={title} eyebrow={eyebrow} meta={meta} toc={toc} tocLabel={tocLabel} jump={jump} onJumped={onJumped} onClose={onClose}>
              {children}
            </SheetBody>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetBody({ title, eyebrow, meta, toc, tocLabel, jump, onJumped, onClose, children }: Omit<DocSheetProps, "open">) {
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // on open the sheet's title takes focus, not the close button (whose ring read as a stray circle); a control that
  // claims focus itself afterwards (the registry's filter on desktop) still does
  useEffect(() => {
    const t = window.setTimeout(() => {
      const h = heading.current;
      const panel = h?.closest<HTMLElement>('[role="dialog"]');
      const el = document.activeElement;
      if (h && panel && (!el || el === document.body || el === panel || el.getAttribute("aria-label") === `Close ${title}`)) h.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(t);
  }, [title]);
  // Shift+Tab from the title wraps to the sheet's last control (the title sits outside the dialog's own Tab cycle)
  const onHeadingKey = (e: ReactKeyboardEvent<HTMLHeadingElement>) => {
    if (e.key !== "Tab" || !e.shiftKey) return;
    const panel = e.currentTarget.closest<HTMLElement>('[role="dialog"]');
    const items = [...(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    e.preventDefault();
    items[items.length - 1].focus();
  };
  const [active, setActive] = useState<string | null>(toc[0]?.id ?? null);
  const lockUntil = useRef(0);
  const tocKey = toc.map((t) => t.id).join("|");

  const sectionEl = useCallback((id: string) => scroller.current?.querySelector<HTMLElement>(`[data-doc-section="${id}"]`) ?? null, []);

  const spy = useCallback(() => {
    const s = scroller.current;
    if (!s || performance.now() < lockUntil.current) return;
    const top = s.getBoundingClientRect().top + (s.querySelector<HTMLElement>("[data-doc-sticky]")?.offsetHeight ?? 0);
    const present = tocKey ? tocKey.split("|").filter((id) => sectionEl(id)) : [];
    let cur = present[0] ?? null;
    for (const id of present) if (sectionEl(id)!.getBoundingClientRect().top - top <= SPY_OFFSET) cur = id;
    if (s.scrollTop > 0 && s.scrollTop + s.clientHeight >= s.scrollHeight - 4) cur = present[present.length - 1] ?? cur;
    setActive(cur);
  }, [tocKey, sectionEl]);

  const goTo = useCallback(
    (id: string, instant: boolean) => {
      const s = scroller.current;
      const el = sectionEl(id);
      if (!s || !el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // offsetTop ignores the sheet's entry transform (a jump usually happens while it is still scaling in); land the
      // section's content (below its padding) 24px under the top, or under a sticky strip (the registry's filter)
      const top = el.offsetParent === s ? el.offsetTop : el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
      const sticky = s.querySelector<HTMLElement>("[data-doc-sticky]")?.offsetHeight ?? 0;
      const y = top + parseFloat(getComputedStyle(el).paddingTop || "0") - 24 - sticky;
      // hold the spy while a smooth scroll travels (released early by scrollend)
      lockUntil.current = performance.now() + (instant || reduce ? 80 : 1500);
      s.scrollTo({ top: Math.max(0, y), behavior: instant || reduce ? "auto" : "smooth" });
      setActive(id);
    },
    [sectionEl],
  );

  // scroll-spy on scroll and whenever the set of sections changes (e.g. a filter hides a group)
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(spy);
    };
    const onEnd = () => {
      lockUntil.current = 0;
      onScroll();
    };
    s.addEventListener("scroll", onScroll, { passive: true });
    s.addEventListener("scrollend", onEnd);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      s.removeEventListener("scroll", onScroll);
      s.removeEventListener("scrollend", onEnd);
    };
  }, [spy]);

  // a requested section (openMethod("proof")): after the content has laid out
  useLayoutEffect(() => {
    if (!jump) return;
    const raf = requestAnimationFrame(() => {
      goTo(jump.id, true);
      onJumped?.();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one jump per nonce
  }, [jump?.id, jump?.nonce]);

  // keep the active chip in view in the phone / tablet chip scroller (horizontal only: never scrolls the page)
  useEffect(() => {
    const row = chips.current;
    const chip = row?.querySelector<HTMLElement>(`[data-toc="${active}"]`);
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const left = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  return (
    <>
      <header className="flex shrink-0 items-start gap-4 px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">{eyebrow}</span>
          <h2 ref={heading} tabIndex={-1} onKeyDown={onHeadingKey} className="mt-2 text-title font-semibold text-fg-1 outline-none">
            {title}
          </h2>
          {meta && <p className="mt-1.5 text-caption text-fg-3">{meta}</p>}
        </div>
        <IconButton label={`Close ${title}`} tooltip={false} onClick={onClose} className="-mt-1 -mr-1.5">
          <X size={16} strokeWidth={1.75} />
        </IconButton>
      </header>

      {/* below 1024: the contents as a horizontal chip scroller */}
      {toc.length > 1 && (
        <nav aria-label={tocLabel} className="shrink-0 border-b border-divider lg:hidden">
          <div ref={chips} className="fade-x flex gap-1.5 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:px-7 [&::-webkit-scrollbar]:hidden">
            {toc.map((t) => (
              <button
                key={t.id}
                type="button"
                data-toc={t.id}
                aria-current={active === t.id ? "true" : undefined}
                onClick={() => goTo(t.id, false)}
                className={clsx(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium whitespace-nowrap transition-colors duration-150 coarse:h-9",
                  active === t.id ? "bg-fill-3 text-fg-1" : "bg-fill-1 text-fg-2 hover:bg-fill-2 hover:text-fg-1",
                )}
              >
                {t.label}
                {t.meta !== undefined && <span className="num text-fg-3">{t.meta}</span>}
              </button>
            ))}
          </div>
        </nav>
      )}
      {toc.length <= 1 && <div aria-hidden className="h-px shrink-0 bg-divider lg:hidden" />}

      <div className="flex min-h-0 flex-1 border-divider lg:border-t">
        {toc.length > 0 && (
          <nav aria-label={tocLabel} className="scroll-thin hidden w-[268px] shrink-0 overflow-y-auto border-r border-divider px-3 py-5 lg:block">
            <ol className="space-y-px">
              {toc.map((t, i) => {
                const on = active === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => goTo(t.id, false)}
                      className={clsx(
                        "group relative flex w-full items-baseline gap-2.5 rounded-control py-[7px] pr-2.5 pl-3 text-left text-ui transition-colors duration-150",
                        on ? "bg-fill-2 text-fg-1" : "text-fg-2 hover:bg-fill-1 hover:text-fg-1",
                      )}
                    >
                      <span aria-hidden className={clsx("num w-5 shrink-0 text-label", on ? "text-fg-2" : "text-fg-4")}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {/* a long entry ("Open research questions") wraps to a second line instead of being cut */}
                      <span className="min-w-0 flex-1 text-pretty leading-[1.3]">{t.label}</span>
                      {t.meta !== undefined && <span className="num shrink-0 text-caption text-fg-3">{t.meta}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="scroll-thin relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-[760px] px-5 pt-6 pb-[max(40px,calc(var(--safe-b)+24px))] break-words sm:px-8 lg:px-10 lg:pt-8">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
