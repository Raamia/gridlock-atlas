"use client";

/**
 * Atlas primitives (design system v2). The living reference is /dev/ui (app/dev/ui).
 *
 * Rules every consumer inherits:
 *  - One solid ink control per view (Button variant="primary", Segmented look="inverse" active pill).
 *  - Colour is always reinforced by text or shape; 6px dots only ever mean utilities (UtilityDot).
 *  - Tooltips live in a portal and only while hovered/focused — never inside a trigger's text, so accessible
 *    names and textContent (tab counts!) stay exactly what the markup says.
 *  - Kbd hints hide on coarse pointers; never put one inside a button whose accessible name a test anchors on.
 */

import clsx from "clsx";
import { AlertTriangle, CalendarRange, Check, ChevronDown, Handshake, MapPin, X } from "lucide-react";
import { motion } from "motion/react";
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type FocusEvent as ReactFocusEvent,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { IDX } from "@/lib/data";
import type { ConstructionWindow, Match, Precision, ReviewStatus, SignalLevel } from "@/lib/domain/types";
import { readableNote } from "@/lib/selectors";

/* ════════════════════════════════════════════════════════════════════════════
 * Floating layer (shared by Tooltip and Menu)
 * ════════════════════════════════════════════════════════════════════════════ */

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const ORIGIN: Record<Side, string> = { top: "center bottom", bottom: "center top", left: "right center", right: "left center" };

/** Place `el` (position:fixed) next to `anchor`, flipping to the opposite side when it would not fit and clamping to the viewport. */
function placeFloating(anchor: HTMLElement, el: HTMLElement, side: Side, align: Align, offset: number) {
  const a = anchor.getBoundingClientRect();
  const w = el.offsetWidth; // offset* ignore the pop-in scale transform
  const h = el.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const m = 8;
  const room: Record<Side, number> = { top: a.top - m, bottom: vh - a.bottom - m, left: a.left - m, right: vw - a.right - m };
  const need = side === "top" || side === "bottom" ? h + offset : w + offset;
  let s = side;
  if (room[s] < need && room[OPPOSITE[s]] > room[s]) s = OPPOSITE[s];
  let x: number;
  let y: number;
  if (s === "top" || s === "bottom") {
    y = s === "top" ? a.top - offset - h : a.bottom + offset;
    x = align === "start" ? a.left : align === "end" ? a.right - w : a.left + a.width / 2 - w / 2;
  } else {
    x = s === "left" ? a.left - offset - w : a.right + offset;
    y = align === "start" ? a.top : align === "end" ? a.bottom - h : a.top + a.height / 2 - h / 2;
  }
  x = Math.min(Math.max(x, m), Math.max(m, vw - w - m));
  y = Math.min(Math.max(y, m), Math.max(m, vh - h - m));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.transformOrigin = ORIGIN[s];
  el.style.visibility = "visible";
  el.dataset.side = s;
}

function useFloating(anchor: HTMLElement | null, ref: RefObject<HTMLElement | null>, side: Side, align: Align, offset: number, track: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) return;
    const update = () => placeFloating(anchor, el, side, align, offset);
    update();
    if (!track) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      ro.disconnect();
    };
  }, [anchor, ref, side, align, offset, track]);
}

const FLOATING_STYLE = { position: "fixed", left: 0, top: 0, visibility: "hidden" } as const;

/**
 * A polymorphic tag ("span" | "h2" | "nav" …) typed as a plain HTML component. Not `ElementType`: that union also
 * spans every JSX intrinsic other packages register (react-three-fiber's <mesh>, <line> …), which types children as never.
 */
type AnyTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>;

/* ════════════════════════════════════════════════════════════════════════════
 * Tooltip
 * ════════════════════════════════════════════════════════════════════════════ */

type TriggerProps = {
  "aria-describedby"?: string;
  onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFocus?: (e: ReactFocusEvent<HTMLElement>) => void;
  onBlur?: (e: ReactFocusEvent<HTMLElement>) => void;
};

/** Moving from one tooltip trigger straight to the next shows the next one instantly (no second delay). */
let lastTooltipClosedAt = 0;

export interface TooltipProps {
  /** Tooltip text. `null`/`false`/"" renders the trigger untouched. */
  content: ReactNode;
  /** Exactly one element that forwards pointer/focus props to a DOM node (Button, IconButton, a <span>, …). */
  children: ReactElement;
  side?: Side;
  align?: Align;
  /** Hover delay in ms (focus uses the same). Default 120. */
  delay?: number;
  /** Keyboard shortcut shown as a Kbd after the text. */
  shortcut?: string;
  /** Link the tooltip to the trigger with aria-describedby while it is open. Turn off when the text only repeats the trigger's accessible name. Default true. */
  describe?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Hover-intent state for one trigger: open after `delay` (instantly right after another tooltip closed). */
function useTooltipTrigger(delay: number) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef(0);
  const show = useCallback(
    (el: HTMLElement) => {
      window.clearTimeout(timer.current);
      const wait = Date.now() - lastTooltipClosedAt < 300 ? 0 : delay;
      timer.current = window.setTimeout(() => setAnchor(el), wait);
    },
    [delay],
  );
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      lastTooltipClosedAt = Date.now();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [anchor, hide]);

  return { anchor, show, hide };
}

/**
 * Hover/focus tooltip. Renders into a portal on document.body only while the trigger is hovered (mouse/pen) or has
 * keyboard focus, after ~120ms. It never renders text inside the trigger and never takes the pointer.
 */
export function Tooltip({ content, children, side = "top", align = "center", delay = 120, shortcut, describe = true, disabled, className }: TooltipProps) {
  const id = useId();
  const { anchor, show, hide } = useTooltipTrigger(delay);

  const empty = content === null || content === undefined || content === false || content === "";
  if (!isValidElement<TriggerProps>(children) || disabled || empty) return children;

  const p = children.props;
  const trigger = cloneElement(children, {
    "aria-describedby": clsx(p["aria-describedby"], describe && anchor && id) || undefined,
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      p.onPointerEnter?.(e);
      if (e.pointerType !== "touch") show(e.currentTarget);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      p.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      p.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
    },
    onBlur: (e: ReactFocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {anchor && (
        <TooltipBubble id={id} anchor={anchor} side={side} align={align} className={className}>
          {content}
          {shortcut && (
            <Kbd size="sm" className="ml-2">
              {shortcut}
            </Kbd>
          )}
        </TooltipBubble>
      )}
    </>
  );
}

function TooltipBubble({ id, anchor, side, align, className, children }: { id: string; anchor: HTMLElement; side: Side; align: Align; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFloating(anchor, ref, side, align, 8, false);
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      data-portal=""
      style={{ ...FLOATING_STYLE, zIndex: "var(--z-tooltip)" }}
      className={clsx(
        "popover pointer-events-none flex max-w-[280px] animate-pop-in items-center rounded-control px-2.5 py-1.5 text-caption text-fg-1",
        className,
      )}
    >
      <span className="min-w-0 text-pretty">{children}</span>
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Kbd, Spinner, Divider, Eyebrow, UtilityDot
 * ════════════════════════════════════════════════════════════════════════════ */

/** Keyboard key hint. Hidden on touch (coarse pointer) devices. `sm` (18px) fits inside tooltips and dense rows. */
export function Kbd({ size = "md", className, children, ...rest }: ComponentProps<"kbd"> & { size?: "sm" | "md" }) {
  return (
    <kbd
      {...rest}
      className={clsx(
        "num inline-grid shrink-0 place-items-center bg-fill-2 px-1 text-[11px] leading-none font-medium text-fg-2 shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)] ring-1 ring-edge ring-inset coarse:hidden",
        size === "sm" ? "h-[18px] min-w-[18px] rounded-[4px]" : "h-5 min-w-5 rounded-chip",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Indeterminate progress. Decorative by default; pass `label` when it stands alone. */
export function Spinner({ size = 14, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx("shrink-0 animate-spin [animation-duration:800ms]", className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.75" />
      <path d="M8 1.75A6.25 6.25 0 0 1 14.25 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Hairline separator (decorative). Full-bleed inside a panel: add `-mx-4` (or `-mx-(--panel-pad)`). */
export function Divider({ orientation = "horizontal", className }: { orientation?: "horizontal" | "vertical"; className?: string }) {
  return <div aria-hidden className={clsx("shrink-0 bg-divider", orientation === "vertical" ? "w-px self-stretch" : "h-px w-full", className)} />;
}

type EyebrowTag = "span" | "p" | "div" | "h2" | "h3" | "h4" | "dt" | "label" | "legend";
/** Mono uppercase micro-label naming a block (11px, +.08em, fg-3). Use `as="h2"` when it is the block's heading. */
export function Eyebrow({ as = "span", className, children, ...rest }: HTMLAttributes<HTMLElement> & { as?: EyebrowTag }) {
  const Tag = as as unknown as AnyTag;
  return (
    <Tag {...rest} className={clsx("eyebrow", className)}>
      {children}
    </Tag>
  );
}

const UTIL_COLOR = { a: "var(--util-a)", b: "var(--util-b)", other: "var(--util-other)" } as const;
export type UtilityKey = keyof typeof UTIL_COLOR;

/** The only meaning of a 6px dot: a utility's identity colour. Decorative — always pair it with the owner's name. */
export function UtilityDot({ utility = "other", color, size = 6, className }: { utility?: UtilityKey; color?: string; size?: number; className?: string }) {
  return <span aria-hidden className={clsx("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: color ?? UTIL_COLOR[utility] }} />;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Button, IconButton
 * ════════════════════════════════════════════════════════════════════════════ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-3 text-caption",
  md: "h-8 gap-2 px-3.5 text-ui",
  lg: "h-10 gap-2 px-4 text-ui",
  xl: "h-11 gap-2 px-5 text-body",
};
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // the one solid-ink control per view
  primary:
    "bg-inverse text-on-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(23_49_55/0.22)] hover:bg-fg-1 [&_kbd]:bg-on-inverse/[0.07] [&_kbd]:text-on-inverse/60 [&_kbd]:ring-on-inverse/10 [&_kbd]:shadow-none",
  // glass pill: frosted on the map, a quiet raised pill inside panels
  secondary: "bg-fill-2 text-fg-1 ring-1 ring-edge ring-inset backdrop-blur-chrome hover:bg-fill-3 aria-pressed:bg-fill-3 aria-pressed:ring-edge-strong",
  ghost: "text-fg-2 hover:bg-fill-2 hover:text-fg-1 aria-pressed:bg-fill-3 aria-pressed:text-fg-1 aria-expanded:bg-fill-2 aria-expanded:text-fg-1",
  // legacy names
  outline: "bg-fill-2 text-fg-1 ring-1 ring-edge ring-inset hover:bg-fill-3",
  subtle: "bg-fill-3 text-fg-1 ring-1 ring-edge-strong ring-inset hover:bg-fill-3",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (lucide, 14px for sm/md, 16px for lg/xl). Replaced by a spinner while loading. */
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Busy state: keeps the exact width, blocks activation, sets aria-busy. */
  loading?: boolean;
  /** Shortcut hint rendered as a trailing Kbd (aria-hidden, hidden on touch) + aria-keyshortcuts. */
  shortcut?: string;
  /** Full width. */
  block?: boolean;
};

/**
 * Pill button. `primary` = white (one per view) · `secondary` = glass pill · `ghost` = text until hovered.
 * Legacy `outline` ≈ secondary and `subtle` = the pressed/active secondary.
 */
export function Button({
  variant = "ghost",
  size = "md",
  icon,
  iconRight,
  loading = false,
  shortcut,
  block,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const overlay = loading && !icon;
  return (
    <button
      type={type}
      aria-keyshortcuts={shortcut}
      {...rest}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest["aria-disabled"] || undefined}
      onClick={
        loading
          ? (e: ReactMouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
            }
          : onClick
      }
      data-variant={variant}
      className={clsx(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-enter active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress aria-busy:active:scale-100 [&_svg]:shrink-0",
        BUTTON_SIZE[size],
        BUTTON_VARIANT[variant],
        block && "w-full",
        className,
      )}
    >
      {overlay && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === "lg" || size === "xl" ? 16 : 14} />
        </span>
      )}
      <span className={clsx("contents", overlay && "invisible")}>
        {icon ? loading ? <Spinner size={size === "lg" || size === "xl" ? 16 : 14} /> : icon : null}
        {children}
        {iconRight}
        {shortcut && (
          <Kbd aria-hidden className="-mr-1 ml-0.5">
            {shortcut}
          </Kbd>
        )}
      </span>
    </button>
  );
}

export type IconButtonProps = ComponentProps<"button"> & {
  /** Required: becomes aria-label and the tooltip. */
  label: string;
  /** Tooltip override (defaults to `label`); `false` hides the tooltip. */
  tooltip?: ReactNode | false;
  tooltipSide?: Side;
  shortcut?: string;
  /** sm 28 · md 32 · lg 40 · xl 44 (phone touch target). */
  size?: "sm" | "md" | "lg" | "xl";
  /** ghost (inside panels) · chrome (floating on the map) · secondary (raised pill). */
  variant?: "ghost" | "chrome" | "secondary";
};

const ICON_SIZE = { sm: "size-7", md: "size-8", lg: "size-10", xl: "size-11" } as const;
const ICON_VARIANT = {
  ghost: "text-fg-2 hover:bg-fill-2 hover:text-fg-1 aria-pressed:bg-fill-3 aria-pressed:text-fg-1 aria-expanded:bg-fill-2 aria-expanded:text-fg-1",
  chrome: "chrome text-fg-1 hover:bg-surface-raised aria-pressed:bg-inverse aria-pressed:text-on-inverse",
  secondary: "bg-fill-2 text-fg-1 ring-1 ring-edge ring-inset hover:bg-fill-3 aria-pressed:bg-fill-3 aria-pressed:ring-edge-strong",
} as const;

/** Round icon-only button. `label` is the accessible name and the tooltip (portal; never inside the button). */
export function IconButton({ label, tooltip, tooltipSide = "top", shortcut, size = "md", variant = "ghost", className, children, type = "button", ...rest }: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-keyshortcuts={shortcut}
      {...rest}
      aria-label={label}
      className={clsx(
        "relative inline-grid shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-150 ease-enter active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
        ICON_SIZE[size],
        ICON_VARIANT[variant],
        className,
      )}
    >
      {children}
    </button>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip ?? label} side={tooltipSide} shortcut={shortcut} describe={tooltip !== undefined && tooltip !== label}>
      {button}
    </Tooltip>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Panel (floating surface over the map)
 * ════════════════════════════════════════════════════════════════════════════ */

export type MapPad = "left" | "right" | "top" | "bottom";
export type Material = "panel" | "chrome" | "solid" | "raised";
const MATERIAL: Record<Material, string> = { panel: "panel", chrome: "chrome", solid: "sheet", raised: "popover" };

/** Class string for a floating surface — for motion.* elements that can't use <Panel>. Includes the radius. */
export function panelClass(material: Material = "panel"): string {
  return clsx(MATERIAL[material], material === "chrome" ? "rounded-card" : material === "raised" ? "rounded-card" : "rounded-panel");
}

/** The data attributes MapStage reads: every floating element over the map is a callout obstacle; `pad` joins camera padding. */
export function mapUi(pad?: MapPad): { "data-map-ui": "true"; "data-map-pad"?: MapPad } {
  return pad ? { "data-map-ui": "true", "data-map-pad": pad } : { "data-map-ui": "true" };
}

type PanelTag = "div" | "aside" | "section" | "nav" | "header" | "footer" | "article" | "form";
export type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: PanelTag;
  /** Which map edge this panel pads the camera from (data-map-pad). */
  mapPad?: MapPad;
  /** panel (default, blur 22, near-opaque) · chrome (small pills/controls) · solid (dialogs, sheets) · raised (popovers). */
  material?: Material;
  /** Adds data-map-ui (default true). */
  mapUi?: boolean;
  ref?: Ref<HTMLElement>;
};

/** Floating frosted surface with hairline edge + float shadow + panel radius. Adds data-map-ui / data-map-pad. */
export function Panel({ as = "div", mapPad, material = "panel", mapUi: onMap = true, className, children, ...rest }: PanelProps) {
  const Tag = as as unknown as AnyTag;
  return (
    <Tag {...rest} {...(onMap ? mapUi(mapPad) : {})} className={clsx(panelClass(material), className)}>
      {children}
    </Tag>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Stat
 * ════════════════════════════════════════════════════════════════════════════ */

export type Tone = "default" | "overlap" | "ok" | "warn" | "muted";
const TONE_TEXT: Record<Tone, string> = { default: "text-fg-1", overlap: "text-overlap", ok: "text-ok", warn: "text-warn", muted: "text-fg-3" };
const STAT_VALUE = { sm: "text-heading", md: "text-title", lg: "text-display" } as const;

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  /** Value size: sm 16 · md 20 · lg 32 (display). */
  size?: "sm" | "md" | "lg";
  /** well = fill-1 tile; plain = no background/padding. */
  variant?: "well" | "plain";
  /** Put the label under the value ("199 / planned projects") instead of above it. */
  labelBelow?: boolean;
  /** Presence of `pressed` or `onClick` makes it a toggle button with aria-pressed. */
  pressed?: boolean;
  onClick?: () => void;
  /** Shared motion layoutId on the value, so a number can morph into another surface. */
  valueLayoutId?: string;
  className?: string;
  title?: string;
}

/** Label + mono value + optional sub-line. Static tile, or a pressable filter tile. */
export function Stat({ label, value, sub, tone = "default", size = "md", variant = "well", labelBelow, pressed, onClick, valueLayoutId, className, title }: StatProps) {
  const interactive = onClick !== undefined || pressed !== undefined;
  const cls = clsx(
    "flex min-w-0 flex-col text-left",
    variant === "well" && "rounded-control bg-fill-1 px-3 py-2.5",
    interactive && "transition-[background-color,box-shadow] duration-200 ease-enter hover:bg-fill-2 aria-pressed:bg-fill-3 aria-pressed:shadow-[inset_0_0_0_1px_var(--edge-strong)]",
    className,
  );
  const labelEl = <span className={clsx("eyebrow block truncate", labelBelow ? "mt-2" : "mb-2")}>{label}</span>;
  const valueEl = (
    <span className={clsx("num block min-w-0 truncate font-medium", STAT_VALUE[size], TONE_TEXT[tone])}>
      {valueLayoutId ? (
        <motion.span layoutId={valueLayoutId} className="inline-block">
          {value}
        </motion.span>
      ) : (
        value
      )}
    </span>
  );
  const body = (
    <>
      {!labelBelow && labelEl}
      {valueEl}
      {labelBelow && labelEl}
      {sub && <span className="mt-1 block text-caption text-fg-3">{sub}</span>}
    </>
  );
  if (interactive)
    return (
      <button type="button" aria-pressed={pressed} onClick={onClick} title={title} className={cls}>
        {body}
      </button>
    );
  return (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Segmented (tablist | pressed | radiogroup)
 * ════════════════════════════════════════════════════════════════════════════ */

export interface SegmentedItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Rendered after the label; the item's textContent ENDS with these digits (test contract for tabs). */
  count?: number;
  /** Portal tooltip (e.g. the full status name for a short tab label). */
  tooltip?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Overrides the accessible name (keep it starting with the visible label). */
  ariaLabel?: string;
  /** tablist: id of the controlled tabpanel. */
  controls?: string;
  id?: string;
  className?: string;
}

export interface SegmentedProps<V extends string = string> {
  items: SegmentedItem<V>[];
  /** Selected value; `null` = nothing selected. */
  value: V | null;
  onChange: (value: V) => void;
  /**
   * tablist → role=tablist/tab + aria-selected, roving tabindex, arrow keys.
   * pressed → <nav>/role=group + aria-label, items are <button aria-pressed> (Region, Map perspective, Basemap).
   * radiogroup → role=radiogroup/radio + aria-checked, roving tabindex, arrow keys.
   */
  variant?: "tablist" | "pressed" | "radiogroup";
  /** inverse = dark active pill (the view's one solid control) · subtle = fill-3 pill. */
  look?: "inverse" | "subtle";
  /** Accessible name of the group. */
  label: string;
  /** pressed only: wrap in <nav aria-label> instead of <div role=group>. */
  as?: "nav" | "div";
  size?: "sm" | "md";
  /** Stretch to full width, items share it equally. */
  fill?: boolean;
  /** panel = fill-1 track (inside panels) · map = frosted chrome track (floating on the map). */
  surface?: "panel" | "map";
  className?: string;
}

/** Segmented control with a motion `layoutId` pill that glides to the active item. */
export function Segmented<V extends string>({
  items,
  value,
  onChange,
  variant = "pressed",
  look = "inverse",
  label,
  as = "div",
  size = "md",
  fill,
  surface = "panel",
  className,
}: SegmentedProps<V>) {
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const roving = variant !== "pressed";
  const activeIndex = items.findIndex((it) => it.value === value);
  const tabStop = activeIndex >= 0 && !items[activeIndex].disabled ? activeIndex : items.findIndex((it) => !it.disabled);

  const moveTo = (from: number, dir: 1 | -1 | "first" | "last") => {
    const enabled = items.flatMap((it, i) => (it.disabled ? [] : [i]));
    if (!enabled.length) return;
    let target: number;
    if (dir === "first") target = enabled[0];
    else if (dir === "last") target = enabled[enabled.length - 1];
    else {
      const pos = enabled.indexOf(from);
      target = enabled[(pos < 0 ? 0 : pos + dir + enabled.length) % enabled.length];
    }
    refs.current[target]?.focus();
    if (items[target].value !== value) onChange(items[target].value);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!roving) return;
    const next = e.key === "ArrowRight" || (variant === "radiogroup" && e.key === "ArrowDown");
    const prev = e.key === "ArrowLeft" || (variant === "radiogroup" && e.key === "ArrowUp");
    if (!next && !prev && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    moveTo(i, next ? 1 : prev ? -1 : e.key === "Home" ? "first" : "last");
  };

  const Wrapper = (variant === "pressed" && as === "nav" ? "nav" : "div") as unknown as AnyTag;
  const groupRole = variant === "tablist" ? "tablist" : variant === "radiogroup" ? "radiogroup" : as === "nav" ? undefined : "group";

  return (
    <Wrapper
      role={groupRole}
      aria-label={label}
      aria-orientation={variant === "tablist" ? "horizontal" : undefined}
      className={clsx(
        "relative items-center gap-0.5 rounded-full p-[3px]",
        fill ? "flex w-full" : "inline-flex",
        surface === "map" ? "chrome" : "bg-fill-1",
        className,
      )}
    >
      {items.map((it, i) => {
        const active = i === activeIndex;
        const ariaState =
          variant === "tablist"
            ? { role: "tab", "aria-selected": active, tabIndex: i === tabStop ? 0 : -1, "aria-controls": it.controls }
            : variant === "radiogroup"
              ? { role: "radio", "aria-checked": active, tabIndex: i === tabStop ? 0 : -1 }
              : { "aria-pressed": active };
        const btn = (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            id={it.id}
            disabled={it.disabled}
            aria-label={it.ariaLabel}
            {...ariaState}
            onClick={() => {
              if (!active) onChange(it.value);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "relative inline-flex min-w-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium transition-[color,background-color,opacity] duration-200 ease-enter disabled:pointer-events-none disabled:opacity-40",
              size === "sm" ? "h-7 px-3 text-caption" : "h-8 px-3.5 text-ui",
              fill && "flex-auto",
              active
                ? look === "inverse"
                  ? "text-on-inverse"
                  : "text-fg-1"
                : "text-fg-2 hover:bg-fill-2 hover:text-fg-1",
              it.count === 0 && !active && "opacity-50 hover:opacity-80",
              it.className,
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-pill-${uid}`}
                aria-hidden
                className={clsx(
                  "absolute inset-0 rounded-full",
                  look === "inverse" ? "bg-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_1px_2px_rgb(0_0_0/0.35)]" : "bg-fill-3 shadow-[inset_0_0_0_1px_var(--edge)]",
                )}
                transition={{ type: "spring", bounce: 0.12, duration: 0.34 }}
              />
            )}
            <span className="relative inline-flex min-w-0 items-center gap-1.5">
              {it.icon}
              <span className="truncate">{it.label}</span>
              {it.count !== undefined && (
                <>
                  {" "}
                  <span className={clsx("num text-[0.92em]", active ? (look === "inverse" ? "text-on-inverse/55" : "text-fg-2") : "text-fg-3")}>{it.count}</span>
                </>
              )}
            </span>
          </button>
        );
        return it.tooltip ? (
          // a tooltip that only repeats the accessible name (full region name behind a short label) is not a description
          <Tooltip key={it.value} content={it.tooltip} describe={it.tooltip !== it.ariaLabel}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </Wrapper>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Chip (filter toggle), Tag (static label), Select, Input
 * ════════════════════════════════════════════════════════════════════════════ */

export type ChipProps = Omit<ComponentProps<"button">, "children"> & {
  children: ReactNode;
  /** Toggle state → aria-pressed. Omit for a plain action chip. */
  pressed?: boolean;
  /** Mono count after the label. A count of 0 disables the chip unless it is pressed (so it can always be released). */
  count?: number;
  icon?: ReactNode;
  tooltip?: ReactNode;
  size?: "sm" | "md";
};

/** Filter chip (pill). Name = label + count. */
export function Chip({ children, pressed, count, icon, tooltip, size = "md", disabled, className, type = "button", ...rest }: ChipProps) {
  const inert = disabled ?? (count === 0 && !pressed);
  const chip = (
    <button
      type={type}
      {...rest}
      aria-pressed={pressed}
      disabled={inert}
      className={clsx(
        "inline-flex shrink-0 select-none items-center whitespace-nowrap rounded-full font-medium ring-1 ring-inset transition-[background-color,color,box-shadow] duration-200 ease-enter disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
        size === "sm" ? "h-6 gap-1 px-2 text-caption" : "h-7 gap-1.5 px-2.5 text-caption",
        pressed ? "bg-fg-1/[0.13] text-fg-1 ring-fg-1/30 hover:bg-fg-1/[0.17]" : "bg-fill-1 text-fg-2 ring-transparent hover:bg-fill-2 hover:text-fg-1",
        className,
      )}
    >
      {icon}
      {children}
      {count !== undefined && (
        <>
          {" "}
          <span className={clsx("num", pressed ? "text-fg-2" : "text-fg-3")}>{count}</span>
        </>
      )}
    </button>
  );
  return tooltip ? <Tooltip content={tooltip}>{chip}</Tooltip> : chip;
}

export type TagTone = "neutral" | "muted" | "ok" | "warn" | "overlap";
const TAG_TONE: Record<TagTone, string> = {
  neutral: "text-fg-2 ring-edge-strong",
  muted: "text-fg-3 ring-edge",
  ok: "text-ok ring-ok/30",
  warn: "text-warn ring-warn/35",
  overlap: "bg-overlap-wash text-overlap ring-overlap/35",
};

export interface TagProps extends TriggerProps {
  children: ReactNode;
  tone?: TagTone;
  icon?: ReactNode;
  /** Mono 11px (ids, row refs like "Sperry OVL_3"). */
  mono?: boolean;
  /** Native title (kept off portals on purpose for dense rows). */
  title?: string;
  /** Makes the tag a button (e.g. "Sperry OVL_3" → opens Method). */
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  "aria-label"?: string;
  /** A static tag that carries a Tooltip can join the Tab order (0) so the tooltip also opens on keyboard focus. */
  tabIndex?: number;
  className?: string;
}

/**
 * Small outline label (20px, chip radius) for the chips line: Sperry OVL_n, Sources disagree, Date passed, Beyond 25 mi.
 * Forwards pointer/focus handlers and aria-describedby, so `<Tooltip><Tag …/></Tooltip>` works directly (hover and keyboard focus).
 */
export function Tag({ children, tone = "neutral", icon, mono, title, onClick, className, tabIndex, ...rest }: TagProps) {
  const { "aria-label": ariaLabel, ...trigger } = rest;
  const cls = clsx(
    "inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-1.5 ring-1 ring-inset [&_svg]:shrink-0",
    mono ? "num text-[11px] font-medium tracking-[0.01em]" : "text-caption font-medium",
    TAG_TONE[tone],
    onClick && "transition-colors duration-150 hover:bg-fill-2",
    className,
  );
  const body = (
    <>
      {icon}
      <span className="truncate">{children}</span>
    </>
  );
  if (onClick)
    return (
      <button type="button" onClick={onClick} title={title} aria-label={ariaLabel} tabIndex={tabIndex} className={cls} {...trigger}>
        {body}
      </button>
    );
  return (
    <span title={title} aria-label={ariaLabel} tabIndex={tabIndex} className={cls} {...trigger}>
      {body}
    </span>
  );
}

export type SelectProps = Omit<ComponentProps<"select">, "size"> & {
  /** Visible <label> text (also the accessible name — keep it unique on the page, e.g. "Utility", "Region"). */
  label: string;
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean;
  /** chip (pill, 28px) · field (control radius, 32px). */
  look?: "chip" | "field";
  wrapperClassName?: string;
};

/** Native <select> with a <label for>; styled as a chip or a field. */
export function Select({ label, hideLabel, look = "chip", id, className, wrapperClassName, children, ...rest }: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-2", wrapperClassName)}>
      <label htmlFor={selectId} className={hideLabel ? "sr-only" : "shrink-0 text-caption text-fg-3"}>
        {label}
      </label>
      <span className="relative inline-flex min-w-0">
        <select
          id={selectId}
          {...rest}
          className={clsx(
            "min-w-0 appearance-none truncate bg-fill-1 pr-7 font-medium text-fg-1 ring-1 ring-edge ring-inset transition-colors duration-150 hover:bg-fill-2 disabled:opacity-40",
            look === "chip" ? "h-7 rounded-full pl-2.5 text-caption" : "h-8 rounded-control pl-3 text-ui",
            className,
          )}
        >
          {children}
        </select>
        <ChevronDown aria-hidden size={12} strokeWidth={2} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-3" />
      </span>
    </span>
  );
}

/** Text input on a fill-1 well with an optional leading icon. */
export function Input({ icon, className, wrapperClassName, ...rest }: ComponentProps<"input"> & { icon?: ReactNode; wrapperClassName?: string }) {
  return (
    <span className={clsx("relative flex min-w-0 items-center", wrapperClassName)}>
      {icon && <span className="pointer-events-none absolute left-3 text-fg-3 [&_svg]:size-3.5">{icon}</span>}
      <input
        {...rest}
        className={clsx(
          "h-8 w-full min-w-0 rounded-control bg-fill-1 text-ui text-fg-1 ring-1 ring-edge ring-inset transition-[background-color,box-shadow] duration-150 hover:bg-fill-2 focus-visible:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-1/80",
          icon ? "pr-3 pl-8" : "px-3",
          className,
        )}
      />
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SignalFact, StatusTag
 * ════════════════════════════════════════════════════════════════════════════ */

export type SignalKind = "place" | "time";
export type SignalState = "confirmed" | "possible" | "none";

/** Engine level → fact state: confirmed/possible keep their icon; no-match/unknown show text only. */
export function signalState(level: SignalLevel): SignalState {
  return level === "confirmed" ? "confirmed" : level === "possible" ? "possible" : "none";
}

export interface SignalFactProps {
  kind: SignalKind;
  state: SignalState;
  /** The fact ("6.7 mi", "2028", a facility name, "timing unknown"). */
  children: ReactNode;
  /** Text size: caption 12 (rows) · ui 13 · body 14 · heading 16 (inspector tiles). */
  size?: "caption" | "ui" | "body" | "heading";
  /** Mono text (default true: distances, years). Turn off for facility names. */
  mono?: boolean;
  /** Let a word value (a facility name) wrap to two lines instead of truncating; the icon stays on the first line. */
  wrap?: boolean;
  /** Reserve the 12px icon slot when state is "none" so stacked facts align. */
  alignIcon?: boolean;
  /** Hover tooltip (portal). */
  tooltip?: ReactNode;
  /** Native title (e.g. the full value when a shortened one is shown). */
  title?: string;
  className?: string;
}

const SIGNAL_ICON = { place: MapPin, time: CalendarRange } as const;
const SIGNAL_SIZE = { caption: "text-caption", ui: "text-ui", body: "text-body", heading: "text-heading" } as const;

/**
 * One pair fact led by its signal icon. Confirmed = amber filled MapPin/CalendarRange + fg-1 text ·
 * possible = fg-3 outline icon + fg-2 text · none = no icon, fg-3 text. The icon carries an accessible name
 * ("Place confirmed"), so meaning never rests on colour alone.
 */
export function SignalFact({ kind, state, children, size = "caption", mono = true, wrap, alignIcon, tooltip, title, className }: SignalFactProps) {
  const Icon = SIGNAL_ICON[kind];
  const word = kind === "place" ? "Place" : "Time";
  // wrapping facts top-align; the icon is centred on the first line box (1lh = the fact's own line height)
  const iconCls = wrap ? "shrink-0 mt-[calc((1lh_-_12px)/2)]" : "shrink-0";
  const fact = (
    <span
      title={title}
      className={clsx(
        "inline-flex min-w-0 max-w-full gap-1.5",
        wrap ? "items-start" : "items-center",
        SIGNAL_SIZE[size],
        mono && "num",
        state === "confirmed" ? "text-fg-1" : state === "possible" ? "text-fg-2" : "text-fg-3",
        className,
      )}
    >
      {state === "confirmed" ? (
        <Icon role="img" aria-label={`${word} confirmed`} size={12} strokeWidth={2} className={clsx(iconCls, "text-overlap")} fill="currentColor" fillOpacity={0.3} />
      ) : state === "possible" ? (
        <Icon role="img" aria-label={`${word} possible`} size={12} strokeWidth={1.75} className={clsx(iconCls, "text-fg-3")} />
      ) : alignIcon ? (
        <span aria-hidden className="w-3 shrink-0" />
      ) : null}
      <span className={clsx("min-w-0", wrap ? "line-clamp-2 break-words" : "truncate")}>{children}</span>
    </span>
  );
  return tooltip ? <Tooltip content={tooltip}>{fact}</Tooltip> : fact;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  "needs-review": "Needs review",
  "known-coordination": "Known coordination",
  possible: "Possible",
};

/**
 * Review status. Needs review = neutral outline (sources are silent — never "uncoordinated") ·
 * Known coordination = ok + Handshake · Possible = dashed fg-3 (thin evidence).
 */
export function StatusTag({ status, size = "sm", label, className }: { status: ReviewStatus; size?: "sm" | "md"; label?: string; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "h-5 px-2 text-caption" : "h-6 px-2.5 text-caption",
        status === "needs-review" && "text-fg-1 ring-1 ring-edge-strong ring-inset",
        status === "known-coordination" && "bg-ok/[0.08] text-ok ring-1 ring-ok/30 ring-inset",
        status === "possible" && "border border-dashed border-fg-4 text-fg-3",
        className,
      )}
    >
      {status === "known-coordination" && <Handshake aria-hidden size={12} strokeWidth={2} className="-ml-0.5" />}
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Menu
 * ════════════════════════════════════════════════════════════════════════════ */

const MenuCtx = createContext<{ close: (restoreFocus: boolean) => void; focusMenu: () => void } | null>(null);
/** Every activatable item of a menu (plain, checkbox), skipping aria-disabled ones. */
const MENU_ITEMS = ':is([role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]):not([aria-disabled="true"])';

export interface MenuProps {
  /** A Button or IconButton element; it receives aria-haspopup/expanded/controls + click/keyboard handlers. */
  trigger: ReactElement;
  children: ReactNode;
  /** Optional header above the items (label style), linked as the menu's description. */
  header?: ReactNode;
  /** Accessible name of the menu (defaults to the trigger via aria-labelledby). */
  label?: string;
  side?: "bottom" | "top";
  align?: "start" | "end";
  minWidth?: number;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

type MenuTriggerProps = {
  id?: string;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
};

/**
 * Menu button + popover (portal). Items are role=menuitem buttons. ↑/↓/Home/End move, Enter/Space activate,
 * Esc closes and returns focus to the trigger, Tab closes, outside click closes.
 */
/** Open/close state for a menu button; remembers the trigger so focus can return to it. */
function useMenuState(onOpenChange?: (open: boolean) => void) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [initial, setInitial] = useState<"first" | "last" | "menu">("menu");
  const anchorRef = useRef<HTMLElement | null>(null);
  const close = useCallback(
    (restoreFocus: boolean) => {
      const a = anchorRef.current;
      setAnchor(null);
      onOpenChange?.(false);
      if (restoreFocus) a?.focus({ preventScroll: true });
    },
    [onOpenChange],
  );
  const openAt = useCallback(
    (el: HTMLElement, focus: "first" | "last" | "menu") => {
      anchorRef.current = el;
      setInitial(focus);
      setAnchor(el);
      onOpenChange?.(true);
    },
    [onOpenChange],
  );
  return { anchor, initial, close, openAt };
}

export function Menu({ trigger, children, header, label, side = "bottom", align = "start", minWidth = 220, className, onOpenChange }: MenuProps) {
  const { anchor, initial, close, openAt } = useMenuState(onOpenChange);
  const popRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const headerId = useId();
  const autoTriggerId = useId();
  const open = anchor !== null;

  useFloating(anchor, popRef, side, align, 6, true);

  // initial focus: keyboard-opened → first/last item; pointer-opened → the menu itself (no highlighted item)
  useLayoutEffect(() => {
    if (!anchor) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>(MENU_ITEMS)];
    const target = initial === "first" ? items[0] : initial === "last" ? items[items.length - 1] : undefined;
    (target ?? menu).focus({ preventScroll: true });
  }, [anchor, initial]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchor.contains(t)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor, close]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>(MENU_ITEMS)];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus({ preventScroll: true });
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(i < 0 ? 0 : i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(i < 0 ? items.length - 1 : i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(true); // no preventDefault: focus then moves on from the trigger
    }
  };

  if (!isValidElement<MenuTriggerProps>(trigger)) return null;
  const tp = trigger.props;
  const triggerId = tp.id ?? autoTriggerId;
  const triggerEl = cloneElement(trigger as ReactElement<MenuTriggerProps & Record<string, unknown>>, {
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      tp.onClick?.(e);
      if (e.defaultPrevented) return;
      if (open) close(false);
      else openAt(e.currentTarget, e.detail === 0 ? "first" : "menu");
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      tp.onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openAt(e.currentTarget, e.key === "ArrowDown" ? "first" : "last");
      }
    },
  });

  return (
    <>
      {triggerEl}
      {anchor &&
        createPortal(
          <MenuCtx.Provider value={{ close, focusMenu: () => menuRef.current?.focus({ preventScroll: true }) }}>
            <div
              ref={popRef}
              data-portal=""
              style={{ ...FLOATING_STYLE, zIndex: "var(--z-popover)", minWidth: Math.max(minWidth, anchor.offsetWidth) }}
              className={clsx("popover max-w-[min(360px,calc(100vw-16px))] animate-pop-in rounded-card p-1", className)}
              onKeyDown={onMenuKey}
            >
              {header && (
                <div id={headerId} className="px-2.5 pt-2 pb-2 text-caption text-fg-3">
                  {header}
                </div>
              )}
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                tabIndex={-1}
                aria-label={label}
                aria-labelledby={label ? undefined : triggerId}
                aria-describedby={header ? headerId : undefined}
                className="flex flex-col outline-none"
              >
                {children}
              </div>
            </div>
          </MenuCtx.Provider>,
          document.body,
        )}
    </>
  );
}

export type MenuItemProps = Omit<ComponentProps<"button">, "onSelect" | "children"> & {
  children: ReactNode;
  /** Second line (caption, fg-3) — e.g. a mono "111 rows · pairs under 25 mi". Exposed as the item's description
   *  (aria-describedby), never as part of its name. */
  hint?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  /** aria-disabled (stays in the DOM, skipped by arrow keys, not activatable). */
  disabled?: boolean;
  /** Makes it a `menuitemcheckbox` with aria-checked (e.g. "Reviewer mode"); a check shows at the end while on. */
  checked?: boolean;
  onSelect?: () => void;
  /** Keep the menu open after selecting. */
  keepOpen?: boolean;
};

export function MenuItem({ children, hint, icon, shortcut, disabled, checked, onSelect, keepOpen, className, onClick, ...rest }: MenuItemProps) {
  const ctx = useContext(MenuCtx);
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  // the name is the label line only; an explicit aria-label / aria-labelledby from the caller still wins
  const named = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined;
  const isCheckbox = checked !== undefined;
  return (
    <button
      type="button"
      role={isCheckbox ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isCheckbox ? checked : undefined}
      tabIndex={-1}
      {...rest}
      aria-labelledby={named ? rest["aria-labelledby"] : labelId}
      aria-describedby={clsx(hint && hintId, rest["aria-describedby"]) || undefined}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        onClick?.(e);
        if (disabled || e.defaultPrevented) return;
        if (!keepOpen) ctx?.close(true);
        onSelect?.();
      }}
      onPointerMove={(e) => {
        if (!disabled && document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
      }}
      onPointerLeave={() => ctx?.focusMenu()}
      className={clsx(
        "flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left outline-none transition-colors duration-100 focus:bg-fill-2 aria-disabled:cursor-default aria-disabled:opacity-40 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon && <span className="mt-px text-fg-3 [&_svg]:size-3.5">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className="text-ui font-medium text-fg-1">
          {children}
        </span>
        {hint && (
          <span id={hintId} className="text-caption text-fg-3">
            {hint}
          </span>
        )}
      </span>
      {isCheckbox && (
        <span
          aria-hidden
          className={clsx(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-150",
            checked ? "bg-ok/15 text-ok" : "ring-1 ring-edge-strong ring-inset",
          )}
        >
          {checked && <Check size={11} strokeWidth={2.5} />}
        </span>
      )}
      {shortcut && <Kbd className="mt-px">{shortcut}</Kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-1 my-1 h-px bg-divider" />;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Disclosure
 * ════════════════════════════════════════════════════════════════════════════ */

export interface DisclosureProps {
  /** Button text. */
  summary: ReactNode;
  children: ReactNode;
  /** Right-aligned meta in the row variant (e.g. a mono count). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** row = full-width row with a trailing chevron · inline = text button ("Why #01?") with a small chevron. */
  variant?: "row" | "inline";
  /** Wrap the button in a heading of this level. */
  headingLevel?: 2 | 3 | 4 | 5;
  id?: string;
  className?: string;
  buttonClassName?: string;
  contentClassName?: string;
}

/**
 * Button (aria-expanded/aria-controls) + animated region. The content stays mounted when collapsed (inert, 0 height),
 * so its text is always in the DOM.
 */
export function Disclosure({
  summary,
  children,
  meta,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  variant = "row",
  headingLevel,
  id,
  className,
  buttonClassName,
  contentClassName,
}: DisclosureProps) {
  const auto = useId();
  const regionId = id ?? `${auto}-region`;
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = openProp ?? inner;
  // overflow stays hidden while the height animates, then opens up so focus rings inside aren't clipped
  const [settled, setSettled] = useState(isOpen);
  const [prev, setPrev] = useState(isOpen);
  if (prev !== isOpen) {
    setPrev(isOpen);
    setSettled(false);
  }
  useEffect(() => {
    if (settled) return;
    const t = window.setTimeout(() => setSettled(true), 340);
    return () => window.clearTimeout(t);
  }, [settled]);

  const toggle = () => {
    if (openProp === undefined) setInner(!isOpen);
    onOpenChange?.(!isOpen);
  };

  const button = (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={regionId}
      onClick={toggle}
      className={clsx(
        "group/disclosure text-left",
        variant === "row"
          ? "flex w-full items-center gap-2 rounded-control py-2 text-ui font-medium text-fg-1"
          : "-mx-1 inline-flex items-center gap-1 rounded-chip px-1 text-ui font-medium text-fg-2 transition-colors hover:text-fg-1 aria-expanded:text-fg-1",
        buttonClassName,
      )}
    >
      <span className={clsx("min-w-0", variant === "row" && "flex-1")}>{summary}</span>
      {variant === "row" && meta !== undefined && <span className="num shrink-0 text-caption text-fg-3">{meta}</span>}
      <ChevronDown
        aria-hidden
        size={variant === "row" ? 14 : 12}
        strokeWidth={2}
        className="shrink-0 text-fg-3 transition-transform duration-200 ease-enter group-aria-expanded/disclosure:rotate-180"
      />
    </button>
  );
  const Heading = headingLevel ? (`h${headingLevel}` as unknown as AnyTag) : null;

  return (
    <div className={className} data-open={isOpen || undefined}>
      {Heading ? <Heading>{button}</Heading> : button}
      {/* minmax(0,1fr): truncated children can't widen the column past the panel */}
      <div id={regionId} className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-300 ease-enter" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
        <div className={clsx("min-h-0", !(isOpen && settled) && "overflow-hidden")} inert={!isOpen}>
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * EmptyState, Notice
 * ════════════════════════════════════════════════════════════════════════════ */

export interface EmptyStateProps {
  title: ReactNode;
  /** Description (caption, fg-3). */
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Calm empty/honest-result state: icon well, one-line title, a short description, optional action. */
export function EmptyState({ title, children, icon, action, className }: EmptyStateProps) {
  return (
    <div className={clsx("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <span className="mb-3 grid size-9 place-items-center rounded-full bg-fill-1 text-fg-3 ring-1 ring-edge ring-inset [&_svg]:size-4">{icon}</span>}
      <p className="text-ui font-medium text-fg-1">{title}</p>
      {children && <div className="mt-1 max-w-[36ch] text-caption text-pretty text-fg-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  children: ReactNode;
  tone?: "neutral" | "warn" | "ok";
  icon?: ReactNode;
  /** Optional inline action pill. */
  actionLabel?: string;
  onAction?: () => void;
  /** Adds a dismiss button (accessible name `dismissLabel`, default "Dismiss notice"). */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** status (polite, default) · alert (assertive) · none. */
  role?: "status" | "alert" | "none";
}

/** Glass pill notice (link notice, basemap fallback, dropped pair, clipboard failures). Never auto-hides by itself. */
export function Notice({ children, tone = "neutral", icon, actionLabel, onAction, onDismiss, dismissLabel = "Dismiss notice", role = "status", className, ...rest }: NoticeProps) {
  return (
    <div
      {...rest}
      role={role === "none" ? undefined : role}
      className={clsx(
        "chrome inline-flex max-w-full items-center gap-2.5 rounded-[20px] py-1.5 text-caption text-fg-1",
        icon ? "pl-3" : "pl-4",
        onDismiss || actionLabel ? "pr-1.5" : "pr-4",
        className,
      )}
    >
      {icon && <span className={clsx("shrink-0 [&_svg]:size-3.5", tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg-2")}>{icon}</span>}
      <span className="min-w-0 py-1 text-pretty">{children}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="relative h-7 shrink-0 rounded-full bg-fill-2 px-3 text-caption font-medium text-fg-1 transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-fill-3"
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        // 28px to the eye, 44px to a finger (the pseudo-element reaches 8px past each edge)
        <IconButton label={dismissLabel} size="sm" onClick={onDismiss} tooltip={false} className="after:absolute after:-inset-2 after:rounded-full">
          <X size={14} strokeWidth={2} />
        </IconButton>
      )}
    </div>
  );
}
/** Alias: the spec calls transient notices "Toast/Notice". */
export const Toast = Notice;

/* ════════════════════════════════════════════════════════════════════════════
 * LogoMark
 * ════════════════════════════════════════════════════════════════════════════ */

/** Atlas mark: two utility strokes converging on the saffron overlap node. Crisp at 16–32px. */
export function LogoMark({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={clsx("shrink-0", className)}
    >
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#31363f" stroke="rgb(238 238 238 / 0.18)" />
      <circle cx="20" cy="16" r="7.5" fill="none" stroke="#d4b875" strokeOpacity="0.36" strokeWidth="1.25" />
      <path d="M7 7.5C10 12.6 12.6 15.1 17 15.6" fill="none" stroke="#49a8ff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M7 24.5C10 19.4 12.6 16.9 17 16.4" fill="none" stroke="#ff5263" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="16" r="3.5" fill="#d4b875" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * LEGACY exports (old components; restyled to the new system, same props)
 * ════════════════════════════════════════════════════════════════════════════ */

/** @deprecated use SignalFact. One signal tag: confirmed = amber wash, possible = dashed outline. */
export function SignalTag({ kind, level, compact }: { kind: "GEO" | "TIME"; level: SignalLevel; compact?: boolean }) {
  if (level === "no-match" || level === "unknown") return null;
  const Icon = kind === "GEO" ? MapPin : CalendarRange;
  const word = kind === "GEO" ? "Place" : "Time";
  const confirmed = level === "confirmed";
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center gap-1 rounded-chip px-1.5 text-caption font-medium",
        confirmed ? "bg-overlap-wash text-overlap ring-1 ring-overlap/35 ring-inset" : "border border-dashed border-fg-4 text-fg-2",
      )}
      title={`${word} ${level}`}
    >
      <Icon aria-hidden size={12} strokeWidth={2} fill={confirmed ? "currentColor" : "none"} fillOpacity={0.3} />
      {word}
      {!confirmed && !compact && <span className="font-normal text-fg-3">possible</span>}
    </span>
  );
}

/** @deprecated use SignalFact pairs. Place + time both confirmed → one amber tag; else the two signal tags. */
export function MatchBadges({ m, compact }: { m: Match; compact?: boolean }) {
  if (m.badge === "BOTH") {
    return (
      <span
        className="inline-flex h-5 items-center gap-1 rounded-chip bg-overlap-wash px-1.5 text-caption font-semibold text-overlap ring-1 ring-overlap/45 ring-inset"
        title="Place and published schedules both confirmed; field-work dates are not published"
      >
        <MapPin aria-hidden size={12} strokeWidth={2} fill="currentColor" fillOpacity={0.3} />
        <CalendarRange aria-hidden size={12} strokeWidth={2} fill="currentColor" fillOpacity={0.3} />
        Place + time
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SignalTag kind="GEO" level={m.geo} compact={compact} />
      <SignalTag kind="TIME" level={m.time} compact={compact} />
    </span>
  );
}

/** @deprecated use StatusTag. Same statuses; possible keeps its legacy "· thin evidence" suffix. */
export function StatusChip({ status, size = "sm" }: { status: ReviewStatus; size?: "sm" | "md" }) {
  return <StatusTag status={status} size={size} label={status === "possible" ? "Possible · thin evidence" : undefined} />;
}

/** @deprecated use Tag tone="warn". */
export function ConflictChip({ count, label = "Source conflict" }: { count: number; label?: string }) {
  if (!count) return null;
  return (
    <Tag tone="warn" icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} />} title={`${count} preserved source disagreement${count > 1 ? "s" : ""}`}>
      {count > 1 ? `${count} conflicts` : label}
    </Tag>
  );
}

const PRECISION_LABEL: Record<Precision, string> = {
  "official-gis": "Official GIS",
  "official-map-digitized": "Digitized from official map · approximate",
  "named-facility": "Named facility",
  locality: "Locality · approximate",
  county: "County-level only",
  unknown: "Location unknown",
};

/** Location precision label (mono, muted). */
export function PrecisionTag({ precision, extra }: { precision: Precision; extra?: string }) {
  return (
    <Tag tone="muted" mono>
      {PRECISION_LABEL[precision]}
      {extra && <span className="opacity-75"> · {extra}</span>}
    </Tag>
  );
}

/** @deprecated use UtilityDot. Coloured dot; `ring` adds a soft halo (no glow). */
export function Dot({ color, size = 8, ring }: { color: string; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: ring ? `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent)` : undefined }}
    />
  );
}

/** @deprecated use Eyebrow. */
export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="eyebrow flex items-center gap-1.5">
        {icon}
        {children}
      </div>
      {right}
    </div>
  );
}

export const ROLE_COLOR = { a: "var(--util-a)", b: "var(--util-b)" } as const;

/* ── data-to-copy helpers (Timeline + Inspector) ───────────────────────────── */

/** Documents behind one display group of windows: a window credited to several documents (sourceLabel) lists each cited one, in citation order. */
export function windowDocs(ws: ConstructionWindow[], sourceIds: string[] = [ws[0].claimSourceId]): string[] {
  const ids = ws.some((w) => w.sourceLabel)
    ? [...ws.flatMap((w) => w.evidenceIds.map((id) => IDX.evidence(id)?.sourceId)), ...ws.map((w) => w.claimSourceId)]
    : sourceIds;
  return [...new Set(ids.filter(Boolean) as string[])].map((id) => IDX.source(id)?.title ?? id);
}

/** A window's research note as readers see it: record ids named, schema notation ("continuous=false", the 2099 open-end sentinel) put in words. */
export function windowNote(w: ConstructionWindow): string {
  if (!w.note) return "";
  return readableNote(w.note, IDX)
    .replace(/,? so phase is 'unknown' and continuous=false:/g, ":")
    .replace(/,?\s*phase 'unknown', continuous=false\)/g, ")")
    .replace(/\s*\(\)/g, "")
    .replace(/\bMarked continuous=false for this package because/g, "Not treated as one continuous phase for this package because")
    .replace(/\bMarked non-continuous\./g, "Not treated as one continuous phase.")
    .replace(/: end\.(?:earliest = start\.earliest and end\.)?latest(?: =)? \d{4}-\d\d-\d\d is an open-end sentinel meaning 'not published'/g, "")
    .replace(/The end is the open sentinel(?: \([^)]*\))? meaning 'not published'\./g, "The end is not published.")
    .replace(/; 'quarter' is the closest precision value\)/g, ")")
    .split(/(?<=\.)\s+(?=[A-Z'(“"])/)
    .filter((x) => !/^Display as |\bschema has no\b/.test(x))
    .join(" ");
}
