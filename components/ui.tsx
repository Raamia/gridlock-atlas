"use client";

import clsx from "clsx";
import { AlertTriangle, CalendarRange, CircleDashed, Handshake, MapPin, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { Match, Precision, ReviewStatus, SignalLevel } from "@/lib/domain/types";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-line-2 bg-bg-3 px-1 text-[10px] text-text-2">
      {children}
    </kbd>
  );
}

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "outline" | "subtle"; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background,border-color,color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
        size === "sm" && "h-7 px-2.5 text-[12px]",
        size === "md" && "h-8 px-3 text-[12.5px]",
        size === "lg" && "h-10 px-4 text-[13.5px]",
        variant === "primary" &&
          "bg-text-0 text-bg-0 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_24px_-8px_rgba(47,214,242,0.45)] hover:bg-white",
        variant === "outline" && "border border-line-2 bg-bg-2/60 text-text-0 hover:border-line-3 hover:bg-bg-3",
        variant === "ghost" && "text-text-1 hover:bg-bg-3 hover:text-text-0",
        variant === "subtle" && "bg-bg-3 text-text-1 hover:bg-bg-4 hover:text-text-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-bg-3 hover:text-text-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

const SIGNAL_ICON = { GEO: MapPin, TIME: CalendarRange } as const;

/** One signal tag. Confirmed = solid amber (a source-supported overlap); possible = dashed slate. */
export function SignalTag({ kind, level, compact }: { kind: "GEO" | "TIME"; level: SignalLevel; compact?: boolean }) {
  if (level === "no-match" || level === "unknown") return null;
  const Icon = SIGNAL_ICON[kind];
  const confirmed = level === "confirmed";
  return (
    <span
      className={clsx(
        "mono inline-flex h-[20px] items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-medium tracking-wide",
        confirmed ? "bg-amber/12 text-amber ring-1 ring-amber/35" : "border border-dashed border-text-3 text-text-2",
      )}
      title={`${kind} ${level}`}
    >
      <Icon size={11} strokeWidth={2.2} />
      {kind}
      {!confirmed && !compact && <span className="font-normal normal-case tracking-normal text-text-3">possible</span>}
    </span>
  );
}

export function MatchBadges({ m, compact }: { m: Match; compact?: boolean }) {
  if (m.badge === "BOTH") {
    return (
      <span
        className="mono inline-flex h-[20px] items-center gap-1 rounded-[6px] bg-amber/15 px-1.5 text-[10.5px] font-semibold tracking-wide text-amber ring-1 ring-amber/45"
        title="Geographic relation and construction-window overlap both confirmed"
      >
        <MapPin size={11} strokeWidth={2.2} />
        <CalendarRange size={11} strokeWidth={2.2} />
        BOTH
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

const STATUS: Record<ReviewStatus, { label: string; color: string; Icon: typeof Search }> = {
  "needs-review": { label: "Needs review", color: "var(--review)", Icon: Search },
  "known-coordination": { label: "Known coordination", color: "var(--known)", Icon: Handshake },
  possible: { label: "Possible · thin evidence", color: "var(--possible)", Icon: CircleDashed },
};

export function StatusChip({ status, size = "sm" }: { status: ReviewStatus; size?: "sm" | "md" }) {
  const s = STATUS[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "h-[20px] px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
      )}
      style={{ color: s.color, background: `color-mix(in oklab, ${s.color} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${s.color} 30%, transparent)` }}
    >
      <s.Icon size={size === "sm" ? 11 : 12} strokeWidth={2.2} />
      {s.label}
    </span>
  );
}

export function ConflictChip({ count, label = "Source conflict" }: { count: number; label?: string }) {
  if (!count) return null;
  return (
    <span
      className="inline-flex h-[20px] items-center gap-1 rounded-full px-2 text-[11px] font-medium text-conflict"
      style={{ background: "color-mix(in oklab, var(--conflict) 12%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--conflict) 30%, transparent)" }}
      title={`${count} preserved source disagreement${count > 1 ? "s" : ""}`}
    >
      <AlertTriangle size={11} strokeWidth={2.2} />
      {count > 1 ? `${count} conflicts` : label}
    </span>
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

export function PrecisionTag({ precision, extra }: { precision: Precision; extra?: string }) {
  return (
    <span className="mono inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-bg-3 px-1.5 text-[10px] text-text-2 ring-1 ring-line">
      {PRECISION_LABEL[precision]}
      {extra && <span className="text-text-3">· {extra}</span>}
    </span>
  );
}

export function Dot({ color, size = 8, ring }: { color: string; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: ring ? `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent), 0 0 12px ${color}` : undefined,
      }}
    />
  );
}

export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="eyebrow flex items-center gap-1.5 text-text-2">
        {icon}
        {children}
      </div>
      {right}
    </div>
  );
}

export const ROLE_COLOR = { a: "var(--a)", b: "var(--b)" } as const;
