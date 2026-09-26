"use client";

import clsx from "clsx";
import { Info, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import { useSelectedPair } from "@/lib/hooks";
import { useLayout } from "@/lib/layout";
import { FOCAL_UTILITIES } from "@/lib/mapdata";
import { useAtlas } from "@/lib/store";
import { Divider, Eyebrow, IconButton, mapUi, UtilityDot } from "../ui";

/**
 * Map key (SPEC §5.5): a quiet chip at the focal top-left ("● DESC ● Georgia Power ● other · ━ flagged pair · ⓘ"),
 * collapsing to its ⓘ on phones, during the demo (it then sits bottom-left, clear of the demo card) or when the focal
 * hole is narrower than 900px. ⓘ expands the full key card — the map's honesty rules in one place.
 */

function keyName(utilityId: string): string {
  const u = IDX.utility(utilityId);
  if (!u) return utilityId;
  return u.name.length <= 14 ? u.name : u.shortName;
}

function useKeyUtilities(): { a: string; b: string; other: boolean } | null {
  const pair = useSelectedPair();
  const region = useAtlas((s) => s.region);
  if (pair) {
    const owner = (p: typeof pair.a) => p.owners.map((o) => IDX.utility(o.utilityId)?.shortName ?? o.utilityId).join(" · ");
    return { a: owner(pair.a), b: owner(pair.b), other: true };
  }
  const focal = FOCAL_UTILITIES[region];
  if (!focal) return null;
  return { a: keyName(focal[0]), b: keyName(focal[1]), other: true };
}

export function MapKey() {
  const layout = useLayout();
  const open = useAtlas((s) => s.mapKeyOpen);
  const demo = useAtlas((s) => s.demoStep !== null);
  const set = useAtlas((s) => s.set);
  const utils = useKeyUtilities();
  const phone = layout.tier === "phone";
  const collapsed = layout.keyCollapsed;
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const setOpen = (v: boolean) => set({ mapKeyOpen: v });

  // during the demo the card owns the top of the focal hole: the key waits bottom-left, above the Mapbox logo
  const place = demo ? "bottom-10 left-0" : "top-0 left-0";

  if (open) return <MapKeyCard className={place} onClose={() => setOpen(false)} phone={phone} />;
  // phones mid-demo with the inspector sheet up: the strip of map between card and sheet belongs to the pair's callouts
  if (phone && demo && inspectorOpen) return null;

  if (collapsed)
    return (
      <div {...mapUi()} className={clsx("absolute", place)}>
        <IconButton label="Map key" variant="chrome" size={phone ? "xl" : "md"} aria-expanded={false} onClick={() => setOpen(true)} tooltipSide="right">
          <Info className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    );

  return (
    <div {...mapUi()} className={clsx("absolute flex max-w-full items-center", place)}>
      <div className="chrome flex h-8 min-w-0 items-center gap-3 rounded-full pr-1 pl-3.5 text-caption text-fg-2">
        {utils ? (
          <span className="flex min-w-0 items-center gap-3 whitespace-nowrap">
            <KeyDot utility="a" name={utils.a} />
            <KeyDot utility="b" name={utils.b} />
            <KeyDot utility="other" name="other" muted />
          </span>
        ) : (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <UtilityDot utility="a" />
            <UtilityDot utility="b" />
            <span>focal pair per region</span>
            <UtilityDot utility="other" className="ml-1.5" />
            <span className="text-fg-3">other</span>
          </span>
        )}
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-edge" />
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <svg width="18" height="6" aria-hidden className="shrink-0">
            <line x1="1" y1="3" x2="17" y2="3" strokeWidth="1.75" strokeLinecap="round" style={{ stroke: "var(--overlap)" }} />
          </svg>
          flagged pair
        </span>
        <IconButton label="Map key" size="sm" aria-expanded={false} onClick={() => setOpen(true)} tooltipSide="bottom">
          <Info className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

function KeyDot({ utility, name, muted }: { utility: "a" | "b" | "other"; name: string; muted?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UtilityDot utility={utility} />
      <span className={clsx("truncate", muted ? "text-fg-3" : "text-fg-2")}>{name}</span>
    </span>
  );
}

/* ------------------------------------------------ the expanded card ------------------------------------------------ */

function MapKeyCard({ className, onClose, phone }: { className: string; onClose: () => void; phone: boolean }) {
  const utils = useKeyUtilities();
  const threshold = useAtlas((s) => s.thresholdMiles);
  const mapMode = useAtlas((s) => s.mapMode);
  const ref = useRef<HTMLDivElement>(null);

  // focus moves into the card when it opens; Esc closes it and hands focus back to the map-key trigger's place
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      {...mapUi()}
      data-map-legend
      role="dialog"
      aria-label="Map key"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
      className={clsx(
        "popover absolute flex max-h-full animate-pop-in flex-col overflow-hidden rounded-card",
        phone ? "w-[min(320px,100%)]" : "w-[304px]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 py-2 pr-1.5 pl-3.5">
        <Eyebrow as="h2">Map key</Eyebrow>
        <IconButton label="Close map key" size={phone ? "xl" : "sm"} onClick={onClose} tooltip={false}>
          <X className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="scroll-thin fade-b min-h-0 overflow-y-auto px-3.5 pb-3.5 text-caption text-fg-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-3">
          {utils ? (
            <>
              <KeyDot utility="a" name={utils.a} />
              <KeyDot utility="b" name={utils.b} />
              <KeyDot utility="other" name="other utilities" muted />
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <UtilityDot utility="a" />
                <UtilityDot utility="b" />
                focal pair per region
              </span>
              <KeyDot utility="other" name="other utilities" muted />
            </>
          )}
          <p className="w-full text-fg-3">Dots only ever mean utilities; owners are named on every row.</p>
        </div>
        <Divider />
        <ul className="space-y-2 pt-3">
          <Row swatch={<Line dash={false} amber />}>
            Flagged pair · center to center, not a route <span className="text-fg-3">(solid = place confirmed, dashed = possible)</span>
          </Row>
          <Row swatch={<Ring />}>{threshold}-mile ring = Sperry&apos;s rule around one project&apos;s center</Row>
          <Row swatch={<Beacon />}>Shared site or terminal · callout says stated or implied</Row>
          <Row swatch={<Line dash={false} />}>Official GIS route</Row>
          <Row swatch={<Line dash />}>Digitized from official map · schematic</Row>
          <Row swatch={<Dot filled />}>Named facility</Row>
          <Row swatch={<Halo />}>Locality halo · approximate</Row>
          <Row swatch={<Dot filled={false} small />}>Context terminal · named, not where the work is</Row>
          <Row swatch={<Spire />}>Structure height = published voltage class · symbolic</Row>
        </ul>
        <p className={clsx("mt-3 rounded-control bg-fill-1 px-2.5 py-2 text-fg-2", mapMode === "3d" && "text-fg-1")}>
          3D is presentation only. <span className="text-fg-3">Flat map is the accurate overhead reading.</span>
        </p>
      </div>
    </div>
  );
}

function Row({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 leading-[1.4]">
      <span aria-hidden className="mt-px flex h-4 w-7 shrink-0 items-center justify-center">
        {swatch}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

const NEUTRAL = "var(--fg-2)";

function Line({ dash, amber }: { dash: boolean; amber?: boolean }) {
  return (
    <svg width="28" height="8">
      <line
        x1="2"
        y1="4"
        x2="26"
        y2="4"
        strokeWidth={amber ? 1.75 : 2.25}
        strokeLinecap="round"
        strokeDasharray={dash ? "5 4" : undefined}
        style={{ stroke: amber ? "var(--overlap)" : NEUTRAL }}
      />
    </svg>
  );
}

function Ring() {
  return (
    <svg width="28" height="16">
      <circle cx="14" cy="8" r="6.5" strokeWidth="1.25" style={{ stroke: "var(--overlap)", fill: "var(--overlap-wash)" }} />
      <circle cx="14" cy="8" r="1.75" style={{ fill: "var(--util-a)" }} />
    </svg>
  );
}

function Beacon() {
  return (
    <svg width="28" height="16">
      <circle cx="14" cy="8" r="6.5" strokeWidth="1.25" style={{ stroke: "var(--overlap)", fill: "none", opacity: 0.45 }} />
      <circle cx="14" cy="8" r="3.5" style={{ fill: "var(--overlap)" }} />
    </svg>
  );
}

function Dot({ filled, small }: { filled: boolean; small?: boolean }) {
  return (
    <svg width="28" height="14">
      <circle
        cx="14"
        cy="7"
        r={small ? 2.75 : 3.75}
        strokeWidth={filled ? 1 : 1.5}
        style={{
          fill: filled ? NEUTRAL : "var(--canvas)",
          stroke: filled ? "var(--canvas)" : NEUTRAL,
        }}
      />
    </svg>
  );
}

function Halo() {
  return (
    <svg width="28" height="16">
      <circle cx="14" cy="8" r="7" strokeWidth="1" strokeDasharray="2 2" style={{ stroke: NEUTRAL, fill: "var(--fill-2)" }} />
      <circle cx="14" cy="8" r="2.5" strokeWidth="1.5" style={{ fill: "var(--canvas)", stroke: NEUTRAL }} />
    </svg>
  );
}

function Spire() {
  return (
    <svg width="28" height="16">
      <path d="M11 15 L13 3 L15 3 L17 15 Z" style={{ fill: NEUTRAL, opacity: 0.85 }} />
      <path d="M6 15 L7.2 9 L8.4 9 L9.6 15 Z" style={{ fill: NEUTRAL, opacity: 0.5 }} />
      <path d="M19 15 L20.4 7 L21.6 7 L23 15 Z" style={{ fill: NEUTRAL, opacity: 0.65 }} />
    </svg>
  );
}
