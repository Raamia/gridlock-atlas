"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  Box,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Info,
  Layers,
  Link2,
  MoreHorizontal,
  Play,
  RotateCcw,
  RotateCw,
  SearchX,
  Share2,
  X,
} from "lucide-react";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import type { Match } from "@/lib/domain/types";
import {
  Button,
  Chip,
  ConflictChip,
  Disclosure,
  Divider,
  Dot,
  EmptyState,
  Eyebrow,
  IconButton,
  Input,
  Kbd,
  LogoMark,
  MatchBadges,
  Menu,
  MenuItem,
  MenuSeparator,
  Notice,
  Panel,
  PrecisionTag,
  Segmented,
  Select,
  SignalFact,
  SignalTag,
  Spinner,
  Stat,
  StatusChip,
  StatusTag,
  Tag,
  Tooltip,
  UtilityDot,
} from "@/components/ui";

/* ─────────────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  ["stage", "Stage"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shape"],
  ["buttons", "Buttons"],
  ["selection", "Selection"],
  ["signals", "Signals"],
  ["stats", "Stats"],
  ["overlays", "Overlays"],
  ["legacy", "Legacy"],
] as const;

export default function Styleguide() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="h-dvh overflow-y-auto bg-canvas">
        <header className="sticky top-0 z-(--z-chrome) border-b border-divider bg-canvas/80 backdrop-blur-chrome">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-8">
            <LogoMark size={26} />
            <p className="text-heading font-semibold tracking-tight text-fg-1">
              <span className="font-display text-[19px] font-normal italic text-fg-2">Atlas</span>
            </p>
            <span className="eyebrow mt-px">Design system v2</span>
            <nav aria-label="Sections" className="ml-auto hidden items-center gap-0.5 lg:flex">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-full px-2.5 py-1 text-caption text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg-1">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-8 pb-32">
          <Intro />
          <StageSection />
          <ColourSection />
          <TypeSection />
          <ShapeSection />
          <ButtonsSection />
          <SelectionSection />
          <SignalsSection />
          <StatsSection />
          <OverlaysSection />
          <LegacySection />
        </main>
      </div>
    </MotionConfig>
  );
}

/* ── scaffolding ──────────────────────────────────────────────────────────── */

function Section({ id, index, title, lede, wide, children }: { id: string; index: string; title: string; lede: ReactNode; wide?: boolean; children: ReactNode }) {
  const head = (
    <>
      <span className="num text-caption text-fg-4">{index}</span>
      <h2 id={`${id}-title`} className="mt-2 text-heading font-semibold text-fg-1">
        {title}
      </h2>
      <p className={clsx("mt-2 text-caption text-fg-3", wide ? "max-w-[72ch]" : "max-w-[30ch]")}>{lede}</p>
    </>
  );
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-divider py-14">
      {wide ? (
        <>
          <div className="mb-8">{head}</div>
          <div className="min-w-0 space-y-6">{children}</div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <div className="lg:sticky lg:top-24 lg:self-start">{head}</div>
          <div className="min-w-0 space-y-10">{children}</div>
        </div>
      )}
    </section>
  );
}

function Block({ label, note, children, className }: { label: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-baseline gap-3">
        <Eyebrow as="h3">{label}</Eyebrow>
        {note && <span className="text-caption text-fg-4">{note}</span>}
      </div>
      <div className={className}>{children}</div>
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <span className="num text-caption text-fg-3">{children}</span>;
}

/* ── intro ────────────────────────────────────────────────────────────────── */

function Intro() {
  return (
    <div className="grid grid-cols-1 gap-10 pt-16 pb-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
      <div>
        <Eyebrow>Foundation · components/ui.tsx · app/globals.css</Eyebrow>
        <h1 className="mt-4 max-w-[18ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.03em] text-fg-1">The map is the stage. The UI floats, quietly.</h1>
        <p className="mt-5 max-w-[60ch] text-body text-fg-2">
          Seven type sizes, five radii, three data hues and two status hues. One solid ink control per view. Panels are the only bordered things; everything else is
          a fill, a divider or a word. This page renders every token and primitive — build against it.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["7", "type sizes"],
          ["3 + 2", "data + status hues"],
          ["1", "solid control / view"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-control bg-fill-1 px-3 py-3">
            <dd className="num text-title font-medium text-fg-1">{v}</dd>
            <dt className="eyebrow mt-2 leading-tight">{l}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── stage: materials over a map-like backdrop ────────────────────────────── */

function MapBackdrop() {
  return (
    <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 1100 620" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="sg-land" cx="58%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#31363f" />
          <stop offset="100%" stopColor="#1f252d" />
        </radialGradient>
        <radialGradient id="sg-ring" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4b875" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#d4b875" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <rect width="1100" height="620" fill="url(#sg-land)" />
      {/* county lines */}
      <g fill="none" stroke="#9ca6aa" strokeOpacity="0.15" strokeWidth="1">
        <path d="M430 0 L470 140 L440 260 L520 380 L500 620" />
        <path d="M640 0 L620 120 L700 220 L690 360 L760 470 L740 620" />
        <path d="M360 170 L520 150 L700 220 L900 180 L1100 210" />
        <path d="M380 420 L520 380 L690 360 L880 400 L1100 380" />
        <path d="M880 0 L900 180 L880 400 L930 620" />
      </g>
      {/* river / state line */}
      <path d="M470 -10 C 540 110, 600 170, 650 260 S 760 430, 860 520 S 980 600, 1110 640" fill="none" stroke="#9ca6aa" strokeOpacity="0.34" strokeWidth="1.5" strokeDasharray="4 5" />
      {/* roads */}
      <g fill="none" stroke="#9ca6aa" strokeOpacity="0.16" strokeWidth="1.25">
        <path d="M360 520 C 520 470, 640 420, 1100 300" />
        <path d="M560 0 C 600 200, 720 300, 760 620" />
      </g>
      {/* 25-mi ring around A */}
      <circle cx="700" cy="300" r="150" fill="url(#sg-ring)" stroke="#d4b875" strokeOpacity="0.55" strokeWidth="1" />
      {/* flagged arcs */}
      <path d="M700 300 Q 760 250 812 318" fill="none" stroke="#d4b875" strokeWidth="2" strokeLinecap="round" />
      <path d="M560 420 Q 640 360 700 300" fill="none" stroke="#d4b875" strokeOpacity="0.45" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M840 190 Q 900 150 960 210" fill="none" stroke="#d4b875" strokeOpacity="0.5" strokeWidth="1.25" strokeDasharray="3 4" strokeLinecap="round" />
      {/* project dots */}
      <g stroke="#31363f" strokeWidth="1.5">
        {[
          [700, 300, "#49a8ff", 6],
          [560, 420, "#49a8ff", 4.5],
          [840, 190, "#49a8ff", 4.5],
          [520, 250, "#49a8ff", 4],
          [990, 420, "#49a8ff", 4],
          [812, 318, "#ff5263", 6],
          [960, 210, "#ff5263", 4.5],
          [610, 520, "#ff5263", 4],
          [1030, 120, "#ff5263", 4],
          [760, 470, "#929ca2", 3.5],
          [460, 330, "#929ca2", 3.5],
        ].map(([x, y, c, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={c as string} />
        ))}
      </g>
      <circle cx="700" cy="300" r="8.5" fill="none" stroke="#eeeeee" strokeWidth="1.5" />
      <circle cx="812" cy="318" r="8.5" fill="none" stroke="#eeeeee" strokeWidth="1.5" />
      <g fontFamily="var(--font-geist-mono)" fontSize="11" fill="#c7cccf">
        <text x="742" y="262">6.7 mi · closest approach</text>
      </g>
    </svg>
  );
}

function DemoRow({ rank, a, b, place, time, chips, selected }: { rank: string; a: [string, string]; b: [string, string]; place: ReactNode; time: ReactNode; chips?: ReactNode; selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="relative grid w-full grid-cols-[22px_minmax(0,1fr)_84px] gap-x-2 rounded-control px-2.5 py-2 text-left transition-colors duration-150 hover:bg-fill-2 aria-pressed:bg-fill-3"
    >
      {selected && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[linear-gradient(var(--util-a)_50%,var(--util-b)_50%)]" />}
      <span className="num pt-[3px] text-[11px] text-fg-3">{rank}</span>
      <span className="min-w-0 space-y-1">
        {[a, b].map(([owner, title], i) => (
          <span key={owner} className="flex min-w-0 items-center gap-1.5">
            <UtilityDot utility={i === 0 ? "a" : "b"} />
            <span className="num shrink-0 text-[11px] text-fg-3">{owner}</span>
            <span className="truncate text-ui font-medium text-fg-1">{title}</span>
          </span>
        ))}
        {chips && <span className="flex flex-wrap gap-1 pt-1">{chips}</span>}
      </span>
      <span className="flex flex-col justify-center gap-1 self-stretch border-l border-divider pl-2.5">
        {place}
        {time}
      </span>
    </button>
  );
}

function StageSection() {
  const [tab, setTab] = useState<"needs" | "known" | "possible">("needs");
  const [mode, setMode] = useState<"3d" | "flat">("3d");
  const [basemap, setBasemap] = useState<"night" | "satellite" | "offline">("night");
  const [timing, setTiming] = useState<string[]>(["confirmed"]);
  const [notice, setNotice] = useState(true);
  const toggle = (k: string) => setTiming((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  return (
    <Section
      wide
      id="stage"
      index="00"
      title="Stage & materials"
      lede={
        <>
          <code className="num">panel</code> (blur 22, near-opaque) for text-heavy surfaces, <code className="num">chrome</code> (blur 12) for pills and map controls. Both
          carry <code className="num">data-map-ui</code>.
        </>
      }
    >
      <div className="relative h-[620px] overflow-hidden rounded-dialog ring-1 ring-edge">
        <MapBackdrop />
        <div aria-hidden className="stage-vignette absolute inset-0" />

        {/* opportunities panel */}
        <Panel as="aside" mapPad="left" aria-label="Sample opportunities panel" className="absolute top-4 bottom-4 left-4 flex w-[352px] flex-col overflow-hidden">
          <div className="flex h-7 items-center gap-1 pl-4 pr-2.5 pt-3.5">
            <Eyebrow as="h3" className="whitespace-nowrap">
              Coordination opportunities
            </Eyebrow>
            <span className="num ml-2 truncate text-caption text-fg-3">· 25 mi</span>
            <span className="ml-auto flex items-center">
              <IconButton label="Re-run comparison" size="sm">
                <RotateCw size={14} />
              </IconButton>
              <IconButton label="Export" size="sm">
                <Download size={14} />
              </IconButton>
            </span>
          </div>
          <div className="px-4 pt-3">
            <p className="flex items-baseline gap-2.5">
              <span className="num text-display font-medium text-fg-1">111</span>
              <span className="text-ui text-fg-2">within Sperry&apos;s 25 miles</span>
            </p>
            <p className="mt-1.5 text-caption text-fg-3">
              of <span className="num text-fg-2">7,830</span> pairs checked · <span className="text-fg-1">123 pairs flagged</span> · 12 possible
            </p>
          </div>
          <div className="space-y-2.5 px-4 pt-4">
            <Segmented
              variant="tablist"
              label="Review status"
              fill
              size="sm"
              value={tab}
              onChange={setTab}
              items={[
                { value: "needs", label: "Needs review", count: 95, tooltip: "Needs review — sources are silent; status unknown" },
                { value: "known", label: "Known", count: 0, tooltip: "Known coordination — a documented interface" },
                { value: "possible", label: "Possible", count: 28, tooltip: "Possible — thin evidence; verify first" },
              ]}
            />
            <div className="fade-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
              <Chip size="sm" pressed={timing.includes("confirmed")} count={31} onClick={() => toggle("confirmed")}>
                Schedules overlap
              </Chip>
              <Chip size="sm" pressed={timing.includes("possible")} count={44} onClick={() => toggle("possible")}>
                May overlap
              </Chip>
              <Chip size="sm" pressed={timing.includes("no")} count={0} onClick={() => toggle("no")}>
                No overlap
              </Chip>
            </div>
          </div>
          <div className="fade-edges mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 py-2">
            <DemoRow
              rank="01"
              selected
              a={["DESC", "Okatie – McIntosh 115kV Tie"]}
              b={["GPC", "Goshen – McIntosh 115 kV Line Rebuild"]}
              place={
                <SignalFact kind="place" state="confirmed">
                  6.7 mi
                </SignalFact>
              }
              time={
                <SignalFact kind="time" state="possible">
                  2028
                </SignalFact>
              }
            />
            <DemoRow
              rank="02"
              a={["DESC", "Jasper – Okatie 230 kV #2"]}
              b={["GPC", "Goshen – McIntosh 115 kV Line Rebuild"]}
              place={
                <SignalFact kind="place" state="confirmed">
                  8.1 mi
                </SignalFact>
              }
              time={
                <SignalFact kind="time" state="confirmed">
                  2025–26
                </SignalFact>
              }
              chips={
                <>
                  <Tag mono>Sperry OVL_3</Tag>
                  <Tag tone="warn" icon={<AlertTriangle size={11} strokeWidth={2} />}>
                    Sources disagree
                  </Tag>
                </>
              }
            />
            <DemoRow
              rank="03"
              a={["DESC", "Okatie 230-115kV Substation"]}
              b={["GPC", "Rice Hope New Auto Transformer"]}
              place={
                <SignalFact kind="place" state="possible">
                  10 mi
                </SignalFact>
              }
              time={
                <SignalFact kind="time" state="none" alignIcon>
                  unknown
                </SignalFact>
              }
              chips={<Tag tone="muted">Date passed</Tag>}
            />
          </div>
          <div className="flex items-center gap-2 border-t border-divider px-4 py-3 text-caption text-fg-3">
            <span>Snapshot Sep 26, 2026 · 103 sources</span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </Panel>

        {/* key chip */}
        <div data-map-ui="true" className="chrome absolute top-4 left-[384px] flex h-8 items-center gap-3 rounded-full pr-1 pl-3.5 text-caption text-fg-2">
          <span className="flex items-center gap-1.5">
            <UtilityDot utility="a" /> DESC
          </span>
          <span className="flex items-center gap-1.5">
            <UtilityDot utility="b" /> Georgia Power
          </span>
          <span className="flex items-center gap-1.5">
            <UtilityDot utility="other" /> other
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-overlap" /> flagged pair
          </span>
          <IconButton label="Map key" size="sm" tooltipSide="bottom">
            <Info size={14} />
          </IconButton>
        </div>

        {/* map controls */}
        <div data-map-ui="true" className="absolute right-4 bottom-4 flex flex-col items-end gap-2">
          <IconButton label="Reset view" variant="chrome" size="lg" tooltipSide="left">
            <RotateCcw size={16} />
          </IconButton>
          <Segmented
            surface="map"
            as="div"
            label="Map perspective"
            value={mode}
            onChange={setMode}
            items={[
              { value: "3d", label: "3D", icon: <Box size={14} />, tooltip: "Tilted 3D view (presentation only)" },
              { value: "flat", label: "Flat map", tooltip: "Accurate overhead reading" },
            ]}
          />
          <span className="eyebrow -mt-0.5 mr-2 text-fg-3">3D · symbolic structures</span>
          <Segmented
            surface="map"
            look="subtle"
            label="Basemap"
            value={basemap}
            onChange={setBasemap}
            items={[
              { value: "night", label: "Day" },
              { value: "satellite", label: "Satellite" },
              { value: "offline", label: "Offline" },
            ]}
          />
        </div>

        {/* notice */}
        {notice ? (
          <div className="absolute bottom-4 left-[384px] right-[250px] flex justify-center">
            <Notice icon={<Link2 />} onDismiss={() => setNotice(false)}>
              The linked pair is not flagged at 10 mi.
            </Notice>
          </div>
        ) : (
          <div className="absolute bottom-4 left-[384px] right-[250px] flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setNotice(true)}>
              Show notice again
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["panel", "surface-panel · blur 22 · sat 1.3", "Opportunities, inspector, dock"],
            ["chrome", "surface-chrome · blur 12", "Pills, map controls, key, notices"],
            ["sheet", "surface-solid · pop shadow", "Dialogs, sheets, brief scrim"],
            ["popover", "surface-raised · pop shadow", "Menus, tooltips"],
          ] as const
        ).map(([cls, spec, use]) => (
          <div key={cls} className="relative h-36 overflow-hidden rounded-card bg-canvas ring-1 ring-edge">
            <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 280 144" preserveAspectRatio="xMidYMid slice">
              <path d="M-10 110 C 60 60, 140 130, 290 40" fill="none" stroke="#d4b875" strokeWidth="2" />
              <path d="M40 -10 L 120 160" stroke="#9ca6aa" strokeOpacity="0.22" strokeWidth="1" />
              <circle cx="70" cy="44" r="7" fill="#49a8ff" />
              <circle cx="200" cy="96" r="7" fill="#ff5263" />
              <text x="150" y="30" fontSize="12" fill="#eeeeee" fillOpacity="0.8" fontFamily="var(--font-geist-sans)">
                Hardeeville
              </text>
            </svg>
            <div className={clsx(cls, "absolute inset-y-3 right-3 left-12 flex flex-col justify-end rounded-card p-3")}>
              <span className="num text-ui text-fg-1">.{cls}</span>
              <span className="mt-1 text-caption text-fg-3">{spec}</span>
              <span className="text-caption text-fg-4">{use}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── colour ───────────────────────────────────────────────────────────────── */

function Swatch({ name, value, cls, note }: { name: string; value: string; cls: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className={clsx("h-14 rounded-control ring-1 ring-edge ring-inset", cls)} />
      <p className="num mt-2 truncate text-caption text-fg-1">{name}</p>
      <p className="num truncate text-[11px] text-fg-3">{value}</p>
      {note && <p className="truncate text-[11px] text-fg-4">{note}</p>}
    </div>
  );
}

function ColourSection() {
  return (
    <Section id="colour" index="01" title="Colour" lede="Classes: text-fg-1…4, bg-surface-*, bg-fill-1…3, border-edge, bg-util-a/b/other, text-overlap, text-ok, text-warn, bg-inverse / text-on-inverse.">
      <Block label="Surfaces">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Swatch name="canvas" value="#1f252d" cls="bg-canvas" note="page, behind the map" />
          <Swatch name="surface-chrome" value="#272c33 / .92" cls="bg-surface-chrome" note="+ blur 12" />
          <Swatch name="surface-panel" value="#272c33 / .97" cls="bg-surface-panel" note="+ blur 22 sat 1.3" />
          <Swatch name="surface-solid" value="#272c33" cls="bg-surface-solid" note="dialogs, sheets" />
          <Swatch name="surface-raised" value="#30363e" cls="bg-surface-raised" note="menus, tooltips" />
        </div>
      </Block>
      <Block label="Fills & edges" note="soft white and teal at low alpha on charcoal surfaces">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <Swatch name="fill-1" value="ink .04" cls="bg-fill-1" note="wells, rest" />
          <Swatch name="fill-2" value="ink .07" cls="bg-fill-2" note="hover" />
          <Swatch name="fill-3" value="ink .11" cls="bg-fill-3" note="pressed" />
          <Swatch name="edge" value="ink .12" cls="bg-edge" note="panel hairline" />
          <Swatch name="edge-strong" value="ink .21" cls="bg-edge-strong" note="inputs, rings" />
          <Swatch name="divider" value="ink .08" cls="bg-divider" note="inside panels" />
        </div>
      </Block>
      <Block label="Foreground">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["fg-1", "#eeeeee", "text-fg-1", "Primary text, values"],
              ["fg-2", "#c7cccf", "text-fg-2", "Secondary text, prose"],
              ["fg-3", "#9ca6aa", "text-fg-3", "Labels, meta — AA everywhere"],
              ["fg-4", "#6f7a80", "text-fg-4", "Decorative only, never information"],
            ] as const
          ).map(([n, v, cls, use]) => (
            <div key={n} className="flex items-baseline gap-4 rounded-control bg-fill-1 px-4 py-3">
              <span className={clsx("text-heading font-medium", cls)}>Aa</span>
              <span className={clsx("min-w-0 flex-1 truncate text-ui", cls)}>{use}</span>
              <Meta>
                {n} · {v}
              </Meta>
            </div>
          ))}
        </div>
      </Block>
      <Block label="Data & status hues" note="saffron = source-supported overlap, nothing else">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <Swatch name="util-a" value="#49a8ff" cls="bg-util-a" note="utility A" />
          <Swatch name="util-b" value="#ff5263" cls="bg-util-b" note="utility B" />
          <Swatch name="util-other" value="#929ca2" cls="bg-util-other" note="other utilities" />
          <Swatch name="overlap" value="#d4b875" cls="bg-overlap" note="flagged overlap" />
          <Swatch name="overlap-wash" value="saffron .12" cls="bg-overlap-wash" note="ring fill, band" />
          <Swatch name="ok" value="#8fc5a8" cls="bg-ok" note="known coordination" />
          <Swatch name="warn" value="#e19b87" cls="bg-warn" note="sources disagree" />
        </div>
      </Block>
      <Block label="Inverse">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-10 items-center rounded-full bg-inverse px-5 text-ui font-medium text-on-inverse">inverse / on-inverse</span>
          <span className="text-caption text-fg-3">The primary button and the active inverse segment — one per view.</span>
        </div>
      </Block>
    </Section>
  );
}

/* ── type ─────────────────────────────────────────────────────────────────── */

function TypeSection() {
  const rows: [string, string, ReactNode][] = [
    ["display", "32 / 1.05 · −.025em · 600 / mono 500", <span key="d" className="num text-display font-medium text-fg-1">111</span>],
    ["title", "20 / 1.2 · −.015em", <span key="t" className="text-title font-semibold text-fg-1">Two utilities. Two separate plans.</span>],
    ["heading", "16 / 1.3 · −.01em", <span key="h" className="text-heading font-semibold text-fg-1">Where they meet</span>],
    [
      "body",
      "14 / 1.55",
      <span key="b" className="text-body text-fg-2">
        Dominion Energy South Carolina and Georgia Power publish their future transmission work in different documents.
      </span>,
    ],
    ["ui", "13 / 1.35 · 500", <span key="u" className="text-ui font-medium text-fg-1">Okatie – McIntosh 115kV Tie</span>],
    ["caption", "12 / 1.45", <span key="c" className="text-caption text-fg-3">Public planning data · Snapshot Sep 26, 2026 · 103 sources</span>],
    ["label", "11 / 1 · +.08em · mono uppercase", <span key="l" className="eyebrow">Coordination opportunities</span>],
  ];
  return (
    <Section id="type" index="02" title="Type" lede="Geist for words, Geist Mono (tabular) for every number, id and eyebrow. Instrument Serif italic only in the wordmark and the brief title. Nothing below 11px.">
      <div className="divide-y divide-divider">
        {rows.map(([name, spec, sample]) => (
          <div key={name} className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-6 py-4 first:pt-0">
            <div>
              <p className="num text-ui text-fg-1">text-{name}</p>
              <p className="mt-1 text-[11px] text-fg-3">{spec}</p>
            </div>
            <div className="min-w-0">{sample}</div>
          </div>
        ))}
      </div>
      <Block label="Faces">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-card bg-fill-1 p-4">
            <p className="text-title font-semibold text-fg-1">Geist</p>
            <p className="mt-1 text-caption text-fg-3">font-sans · 400 / 500 / 600</p>
          </div>
          <div className="rounded-card bg-fill-1 p-4">
            <p className="num text-title font-medium text-fg-1">6.7 mi · 2028</p>
            <p className="mt-1 text-caption text-fg-3">num / font-mono · tabular</p>
          </div>
          <div className="rounded-card bg-fill-1 p-4">
            <p className="font-display text-[26px] leading-[1.1] text-fg-1 italic">Atlas</p>
            <p className="mt-1 text-caption text-fg-3">font-display · wordmark, brief title</p>
          </div>
        </div>
      </Block>
      <Block label="Mark" note="LogoMark · app/icon.svg — two utility strokes converging on the overlap node">
        <div className="flex items-end gap-8">
          {[16, 20, 24, 32, 48].map((n) => (
            <div key={n} className="flex flex-col items-center gap-2">
              <LogoMark size={n} />
              <Meta>{n}</Meta>
            </div>
          ))}
          <div className="ml-4 flex items-center gap-3">
            <LogoMark size={28} />
            <span className="leading-none">
              <span className="block text-heading font-semibold text-fg-1">
                <span className="font-display text-[19px] font-normal italic text-fg-2">Atlas</span>
              </span>
              <span className="mt-1.5 flex items-center gap-1.5 text-caption text-fg-3">
                <UtilityDot utility="a" /> Dominion Energy SC <span className="text-fg-4">×</span> <UtilityDot utility="b" /> Georgia Power
              </span>
            </span>
          </div>
        </div>
      </Block>
    </Section>
  );
}

/* ── shape: radii, elevation ──────────────────────────────────────────────── */

function ShapeSection() {
  return (
    <Section id="shape" index="03" title="Shape & depth" lede="Outer radius = inner radius + inset. One shadow family; the hairline edge does the rest. Spacing on a 4-pt grid; --gutter 16 (20 ≥1536).">
      <Block label="Radii">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {(
            [
              ["chip", "6", "rounded-chip"],
              ["control", "10", "rounded-control"],
              ["card", "12", "rounded-card"],
              ["panel", "18", "rounded-panel"],
              ["dialog", "22", "rounded-dialog"],
              ["pill", "999", "rounded-full"],
            ] as const
          ).map(([n, px, cls]) => (
            <div key={n}>
              <div className={clsx("h-16 bg-fill-2 ring-1 ring-edge-strong ring-inset", cls)} />
              <p className="num mt-2 text-caption text-fg-1">{n}</p>
              <p className="num text-[11px] text-fg-3">{px}px</p>
            </div>
          ))}
        </div>
      </Block>
      <Block label="Elevation">
        <div className="grid gap-6 rounded-card bg-[linear-gradient(180deg,#30363e,#1f252d)] p-8 sm:grid-cols-3">
          {(
            [
              ["shadow-float", "Floating panels and chrome (with a 1px top glint)"],
              ["shadow-pop", "Dialogs, menus, tooltips"],
              ["shadow-chip", "HTML markers and labels on the map"],
            ] as const
          ).map(([cls, use]) => (
            <div key={cls} className={clsx("rounded-card border border-edge bg-surface-raised p-4", cls)}>
              <p className="num text-ui text-fg-1">{cls}</p>
              <p className="mt-1 text-caption text-fg-3">{use}</p>
            </div>
          ))}
        </div>
      </Block>
      <Block label="Motion" note="ease-enter for everything that arrives; exits ≈0.6× duration">
        <div className="grid gap-2 sm:grid-cols-5">
          {(
            [
              ["--dur-1", "120ms", "hover, press"],
              ["--dur-2", "200ms", "toggles, pill"],
              ["--dur-3", "320ms", "panel, popover"],
              ["--dur-4", "480ms", "sheet, drawer"],
              ["camera", "1100–1400ms", "flyTo, fitBounds"],
            ] as const
          ).map(([n, v, use]) => (
            <div key={n} className="rounded-control bg-fill-1 px-3 py-2.5">
              <p className="num text-caption text-fg-1">{n}</p>
              <p className="num text-[11px] text-fg-3">{v}</p>
              <p className="text-[11px] text-fg-4">{use}</p>
            </div>
          ))}
        </div>
      </Block>
    </Section>
  );
}

/* ── buttons ──────────────────────────────────────────────────────────────── */

function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  const [pressed, setPressed] = useState(false);
  const run = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1600);
  };
  return (
    <Section id="buttons" index="04" title="Buttons" lede="Pills. primary = the one dark-ink control per view · secondary = glass pill · ghost = text until hovered. Loading keeps the exact width.">
      <Block label="Variants × sizes">
        <div className="space-y-4">
          {(["primary", "secondary", "ghost"] as const).map((v) => (
            <div key={v} className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-4">
              <Meta>{v}</Meta>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={v} size="sm">
                  Small
                </Button>
                <Button variant={v} size="md" icon={<Share2 size={14} />}>
                  Medium
                </Button>
                <Button variant={v} size="lg" icon={<FileText size={16} />}>
                  Create review brief
                </Button>
                <Button variant={v} size="xl" icon={<Play size={15} fill="currentColor" />}>
                  Compare public plans
                </Button>
                <Button variant={v} size="md" disabled>
                  Disabled
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Block>
      <Block label="States">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" icon={<Play size={15} fill="currentColor" />} loading={loading} onClick={run} shortcut="C">
            Compare public plans
          </Button>
          <Button variant="secondary" size="lg" loading={loading} onClick={run}>
            Loading without icon
          </Button>
          <Button variant="secondary" aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>
            {pressed ? "Exit guided demo" : "Guided demo"}
          </Button>
          <Button variant="ghost" icon={<Link2 size={14} />}>
            Link
          </Button>
          <span className="text-caption text-fg-3">Click the first two →</span>
        </div>
        <div className="mt-6 max-w-[352px]">
          <Button variant="primary" size="xl" block icon={<Play size={15} fill="currentColor" />}>
            Compare public plans
          </Button>
          <p className="mt-2 text-center text-caption text-fg-3">Runs the deterministic engine over the frozen public snapshot.</p>
        </div>
      </Block>
      <Block label="IconButton" note="label → aria-label + portal tooltip (hover me)">
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-x-4 gap-y-4">
          <Meta>ghost</Meta>
          <div className="flex items-center gap-2">
            <IconButton label="Close inspector" size="sm">
              <X size={14} />
            </IconButton>
            <IconButton label="Source registry" shortcut="S">
              <Database size={15} />
            </IconButton>
            <IconButton label={pressed ? "Reviewer mode on" : "Reviewer mode"} aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>
              <ClipboardCheck size={15} />
            </IconButton>
            <IconButton label="Disabled" disabled>
              <Download size={15} />
            </IconButton>
          </div>
          <Meta>chrome</Meta>
          <div
            className="relative flex items-center gap-2 rounded-card p-3"
            style={{ background: "linear-gradient(145deg, rgb(8 127 122 / 0.12), rgb(212 95 115 / 0.1)), #eef4f4" }}
          >
            <IconButton label="Reset view" variant="chrome" size="lg">
              <RotateCcw size={16} />
            </IconButton>
            <IconButton label="Layers" variant="chrome" size="lg">
              <Layers size={16} />
            </IconButton>
            <IconButton label="Map key" variant="chrome" size="md">
              <Info size={15} />
            </IconButton>
            <IconButton label="Start guided demo" variant="chrome" size="xl">
              <Play size={16} fill="currentColor" />
            </IconButton>
          </div>
          <Meta>secondary</Meta>
          <div className="flex items-center gap-2">
            <IconButton label="More" variant="secondary">
              <MoreHorizontal size={16} />
            </IconButton>
            <IconButton label="Pressed" variant="secondary" aria-pressed>
              <Box size={15} />
            </IconButton>
          </div>
        </div>
      </Block>
    </Section>
  );
}

/* ── selection: segmented, chips, select, input, range ───────────────────── */

function SelectionSection() {
  const [tab, setTab] = useState<"needs" | "known" | "possible">("needs");
  const [region, setRegion] = useState("sav");
  const [nav, setNav] = useState("where");
  const [gran, setGran] = useState("year");
  const [chips, setChips] = useState<string[]>(["possible"]);
  const [radius, setRadius] = useState(25);
  const toggle = (k: string) => setChips((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <Section
      id="selection"
      index="05"
      title="Selection"
      lede="Segmented variants: tablist (tabs + counts; textContent ends with the count), pressed (nav/group of aria-pressed buttons), radiogroup. The active pill glides via a motion layoutId."
    >
      <Block label="Segmented · tablist · inverse" note="arrow keys move · tooltip carries the full name">
        <div className="max-w-[352px]">
          <Segmented
            variant="tablist"
            label="Review status"
            fill
            value={tab}
            onChange={setTab}
            items={[
              { value: "needs", label: "Needs review", count: 95, tooltip: "Needs review — sources are silent; status unknown" },
              { value: "known", label: "Known", count: 0, tooltip: "Known coordination — a documented interface, not a discovery" },
              { value: "possible", label: "Possible", count: 28, tooltip: "Possible — thin evidence; verify before outreach" },
            ]}
          />
        </div>
      </Block>
      <Block label="Segmented · pressed" note="<nav aria-label='Region'> · buttons with aria-pressed">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented
            as="nav"
            label="Region"
            look="subtle"
            value={region}
            onChange={setRegion}
            items={[
              { value: "sav", label: "Savannah River · SC–GA" },
              { value: "mid", label: "Upper Midwest" },
              { value: "plains", label: "Southern Plains" },
              { value: "all", label: "All" },
            ]}
          />
          <Segmented
            label="Region (compact)"
            size="sm"
            value={region}
            onChange={setRegion}
            items={[
              { value: "sav", label: "SC–GA" },
              { value: "mid", label: "Midwest" },
              { value: "plains", label: "Plains" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </Block>
      <Block label="Segmented · subtle · radiogroup">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented
            look="subtle"
            label="Inspector sections"
            size="sm"
            value={nav}
            onChange={setNav}
            items={[
              { value: "where", label: "Where" },
              { value: "when", label: "When" },
              { value: "coord", label: "Coordination" },
              { value: "impact", label: "Impact" },
              { value: "disagree", label: "Disagree", count: 1 },
              { value: "sources", label: "Sources" },
            ]}
          />
          <Segmented
            variant="radiogroup"
            look="subtle"
            label="Timeline granularity"
            size="sm"
            value={gran}
            onChange={setGran}
            items={[
              { value: "year", label: "Year" },
              { value: "quarter", label: "Quarter" },
            ]}
          />
        </div>
      </Block>
      <Block label="Chips" note="aria-pressed · count · disabled at 0 unless pressed">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["confirmed", "Schedules overlap", 31, "Published schedules (start → in-service) overlap by ≥30 days; field-work dates are not published"],
              ["possible", "May overlap", 44, undefined],
              ["unknown", "Timing unknown", 20, undefined],
              ["none", "No overlap", 0, undefined],
              ["conflicts", "Dates revised or disputed", 74, undefined],
            ] as const
          ).map(([k, label, n, tip]) => (
            <Chip key={k} pressed={chips.includes(k)} count={n} tooltip={tip} onClick={() => toggle(k)}>
              {label}
            </Chip>
          ))}
          <Select label="Utility" hideLabel defaultValue="all" wrapperClassName="ml-1">
            <option value="all">All utilities</option>
            <option value="desc">Dominion Energy South Carolina</option>
            <option value="gpc">Georgia Power</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setChips([])}>
            Clear
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-fill-2 pr-1 pl-3 text-caption text-fg-1">
            With <span className="font-medium">Okatie – McIntosh 115kV Tie</span> <span className="num text-fg-3">· 18 pairs</span>
            <IconButton label="Clear focus" size="sm" className="!size-5">
              <X size={12} />
            </IconButton>
          </span>
          <span className="text-caption text-fg-3">← focus chip (compose from primitives)</span>
        </div>
      </Block>
      <Block label="Fields">
        <div className="grid max-w-[560px] gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Select label="Region" look="field" defaultValue="sav">
              <option value="sav">Savannah River · SC–GA</option>
              <option value="mid">Upper Midwest</option>
            </Select>
            <Input placeholder="Filter sources" icon={<SearchX />} aria-label="Filter sources" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="sg-radius" className="text-caption text-fg-2">
                Review radius
              </label>
              <span className="num text-ui text-fg-1">{radius} mi</span>
            </div>
            <input
              id="sg-radius"
              type="range"
              className="range mt-1.5"
              min={5}
              max={100}
              step={5}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ ["--range-fill" as string]: `${((radius - 5) / 95) * 100}%` }}
            />
            <div className="relative h-4">
              <span className="absolute top-0 h-1.5 w-px bg-fg-3" style={{ left: `calc(${(20 / 95) * 100}% + ${8 - (20 / 95) * 16}px)` }} />
              <span className="num absolute top-2.5 -translate-x-1/2 text-[11px] whitespace-nowrap text-fg-3" style={{ left: `calc(${(20 / 95) * 100}% + ${8 - (20 / 95) * 16}px)` }}>
                Sperry rule
              </span>
            </div>
            <p className="mt-2.5 text-caption text-fg-3">Closest project points within · a review heuristic, not a regulatory standard.</p>
          </div>
        </div>
      </Block>
    </Section>
  );
}

/* ── signals & status ─────────────────────────────────────────────────────── */

function SignalsSection() {
  return (
    <Section
      id="signals"
      index="06"
      title="Signals & status"
      lede="Signals use icons, never dots: amber filled = confirmed, fg-3 outline = possible, no icon = none. Dots only ever mean utilities. Colour is always backed by a word."
    >
      <Block label="SignalFact">
        <div className="grid max-w-[640px] grid-cols-[92px_repeat(3,minmax(0,1fr))] items-center gap-x-4 gap-y-3">
          <span />
          <Meta>confirmed</Meta>
          <Meta>possible</Meta>
          <Meta>none</Meta>
          <Meta>place</Meta>
          <SignalFact kind="place" state="confirmed">
            6.7 mi
          </SignalFact>
          <SignalFact kind="place" state="possible">
            ≈18 mi
          </SignalFact>
          <SignalFact kind="place" state="none">
            Beyond 25 mi
          </SignalFact>
          <Meta>time</Meta>
          <SignalFact kind="time" state="confirmed" tooltip="Published schedules overlap; field-work dates are not published">
            2025–26 schedules
          </SignalFact>
          <SignalFact kind="time" state="possible">
            2028
          </SignalFact>
          <SignalFact kind="time" state="none">
            timing unknown
          </SignalFact>
          <Meta>ui size</Meta>
          <SignalFact kind="place" state="confirmed" size="ui" mono={false}>
            Okatie Substation
          </SignalFact>
          <SignalFact kind="time" state="possible" size="ui">
            2028 · year precision
          </SignalFact>
          <SignalFact kind="time" state="none" size="ui" alignIcon>
            no overlap
          </SignalFact>
        </div>
      </Block>
      <Block label="StatusTag">
        <div className="flex flex-wrap items-center gap-3">
          <StatusTag status="needs-review" />
          <StatusTag status="known-coordination" />
          <StatusTag status="possible" />
          <span className="mx-2 h-4 w-px bg-divider" />
          <StatusTag status="needs-review" size="md" />
          <StatusTag status="known-coordination" size="md" />
          <StatusTag status="possible" size="md" />
        </div>
        <p className="mt-3 max-w-[64ch] text-caption text-fg-3">
          Needs review = sources are silent (never “uncoordinated”) · Known coordination = a documented interface, not a discovery · Possible = thin evidence, verify before
          outreach.
        </p>
      </Block>
      <Block label="Tag" note="the chips line: 20px, chip radius">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag mono onClick={() => undefined} title="Row OVL_3 of Sperry's worked example">
            Sperry OVL_3
          </Tag>
          <Tag tone="warn" icon={<AlertTriangle size={11} strokeWidth={2} />}>
            Sources disagree
          </Tag>
          <Tag tone="muted">Date revised</Tag>
          <Tag tone="muted">Date passed</Tag>
          <Tag tone="neutral">Beyond 25 mi · shared site</Tag>
          <Tag tone="ok">Documented</Tag>
          <Tag tone="overlap">Possible overlap 2028</Tag>
        </div>
      </Block>
      <Block label="UtilityDot" note="6px · decorative · always next to the owner's name">
        <div className="flex flex-wrap items-center gap-5 text-ui text-fg-2">
          <span className="flex items-center gap-2">
            <UtilityDot utility="a" /> Dominion Energy SC
          </span>
          <span className="flex items-center gap-2">
            <UtilityDot utility="b" /> Georgia Power
          </span>
          <span className="flex items-center gap-2">
            <UtilityDot utility="other" /> other utilities
          </span>
          <span className="flex items-center gap-2">
            <UtilityDot utility="a" size={8} /> 8px on the map key
          </span>
        </div>
      </Block>
    </Section>
  );
}

/* ── stats ────────────────────────────────────────────────────────────────── */

function StatsSection() {
  const [filter, setFilter] = useState<string | null>("within");
  return (
    <Section id="stats" index="07" title="Stats" lede="Label + mono value + sub. Static tile (inspector), plain hero figures, or a pressable filter tile with aria-pressed.">
      <Block label="Plain · labelBelow (hero)">
        <div className="grid max-w-[420px] grid-cols-3 gap-6">
          <Stat variant="plain" labelBelow label="Planned projects" value="199" />
          <Stat variant="plain" labelBelow label="Pairs to check" value="7,830" valueLayoutId="sg-pairs" />
          <Stat variant="plain" labelBelow label="Public sources" value="103" />
        </div>
      </Block>
      <Block label="Well · static (inspector tiles)">
        <div className="grid max-w-[520px] grid-cols-3 gap-2">
          <Stat
            label="Distance"
            size="sm"
            value={
              <SignalFact kind="place" state="confirmed" size="body">
                6.7 mi
              </SignalFact>
            }
            sub="closest approach"
          />
          <Stat
            label="Timing"
            size="sm"
            value={
              <SignalFact kind="time" state="possible" size="body">
                2028
              </SignalFact>
            }
            sub="year precision"
          />
          <Stat label="Coordination" size="sm" value={<span className="font-sans">Not found</span>} sub="status unknown" />
        </div>
      </Block>
      <Block label="Well · pressable">
        <div className="grid max-w-[520px] grid-cols-3 gap-2">
          {(
            [
              ["flagged", "Flagged", "123", "default"],
              ["within", "Within 25 mi", "111", "overlap"],
              ["possible", "Possible", "12", "default"],
            ] as const
          ).map(([k, l, v, tone]) => (
            <Stat key={k} label={l} value={v} tone={filter === k ? tone : "default"} pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)} />
          ))}
        </div>
      </Block>
    </Section>
  );
}

/* ── overlays ─────────────────────────────────────────────────────────────── */

function OverlaysSection() {
  const [picked, setPicked] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState(false);
  const [why, setWhy] = useState(false);
  return (
    <Section
      id="overlays"
      index="08"
      title="Overlays & feedback"
      lede="Tooltip (portal, hover/focus only), Menu (role=menu, arrows/Enter/Esc, outside click closes, focus returns), Disclosure (content stays mounted), Notice, EmptyState, Spinner, Kbd."
    >
      <Block label="Tooltip & Menu">
        <div className="flex flex-wrap items-center gap-3">
          <Tooltip content="Tooltips never render inside their trigger">
            <Button variant="secondary">Hover or focus me</Button>
          </Tooltip>
          <Tooltip content="Compare public plans" shortcut="C" side="bottom">
            <Button variant="ghost" icon={<Play size={14} fill="currentColor" />}>
              With shortcut
            </Button>
          </Tooltip>
          <Menu
            align="end"
            header={<span className="eyebrow block leading-[1.4]">Savannah River · SC–GA · 25 mi · whole region — list filters not applied</span>}
            trigger={
              <Button variant="secondary" icon={<Download size={14} />}>
                Export
              </Button>
            }
          >
            <MenuItem icon={<Download />} hint={<span className="num">111 rows · pairs under 25 mi</span>} aria-label="Export overlap table as CSV" onSelect={() => setPicked("Overlap table")}>
              Sperry overlap table (CSV)
            </MenuItem>
            <MenuItem icon={<Download />} hint={<span className="num">199 rows</span>} aria-label="Export project table as CSV" onSelect={() => setPicked("Project table")}>
              Sperry project table (CSV)
            </MenuItem>
            <MenuItem icon={<Download />} onSelect={() => setPicked("All flagged pairs")}>
              All flagged pairs (CSV)
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<FileText />} disabled hint="Open a pair first">
              Review brief (open pair)
            </MenuItem>
            <MenuItem icon={<ClipboardCheck />} shortcut="L" onSelect={() => setPicked("Reviewer labels")}>
              Reviewer labels (CSV) · 3 labeled
            </MenuItem>
          </Menu>
          <Menu
            trigger={
              <IconButton label="More actions" variant="secondary">
                <MoreHorizontal size={16} />
              </IconButton>
            }
          >
            <MenuItem onSelect={() => setPicked("Sources")} hint="103 public documents · 19 utilities">
              Sources
            </MenuItem>
            <MenuItem onSelect={() => setPicked("Method")}>Method</MenuItem>
            {/* checked → role=menuitemcheckbox + aria-checked; the hint is a description (aria-describedby), not part of the name */}
            <MenuItem
              checked={reviewer}
              hint="Label pairs as you review"
              onSelect={() => {
                setReviewer((v) => !v);
                setPicked("Reviewer mode");
              }}
            >
              Reviewer mode
            </MenuItem>
            <MenuItem onSelect={() => setPicked("Reset view")}>Reset view</MenuItem>
          </Menu>
          <span className="text-caption text-fg-3">{picked ? `Selected: ${picked}` : "Try the keyboard: ↓ opens, ↑↓ move, Esc closes"}</span>
        </div>
      </Block>
      <Block label="Disclosure">
        <div className="grid max-w-[720px] gap-8 sm:grid-cols-2">
          <div className="divide-y divide-divider">
            <Disclosure
              summary={
                <span className="flex items-center gap-2">
                  <UtilityDot utility="a" /> Dominion Energy SC
                </span>
              }
              meta="24 plans"
              defaultOpen
            >
              <ul className="space-y-1.5 pb-3 pl-3.5 text-caption text-fg-2">
                <li>Okatie – McIntosh 115kV Tie</li>
                <li>Jasper – Okatie 230 kV #2</li>
                <li>Okatie 230-115kV Substation</li>
              </ul>
            </Disclosure>
            <Disclosure
              summary={
                <span className="flex items-center gap-2">
                  <UtilityDot utility="b" /> Georgia Power
                </span>
              }
              meta="175 plans"
            >
              <ul className="space-y-1.5 pb-3 pl-3.5 text-caption text-fg-2">
                <li>Goshen – McIntosh 115 kV Line Rebuild</li>
                <li>Rice Hope New Auto Transformer</li>
              </ul>
            </Disclosure>
          </div>
          <div>
            <Disclosure variant="inline" summary="Why #01?" open={why} onOpenChange={setWhy}>
              <ul className="mt-2 space-y-1 text-caption text-fg-2">
                <li>Both projects located at named facilities</li>
                <li>Closest points 6.7 mi apart, well inside 25 mi</li>
                <li>No coordination found in reviewed sources</li>
              </ul>
              <p className="mt-2 text-caption text-fg-3">Priority 92 — an explainable ordering, not a probability.</p>
            </Disclosure>
          </div>
        </div>
      </Block>
      <Block label="Notice">
        <div className="flex flex-col items-start gap-3">
          <Notice icon={<Link2 />} onDismiss={() => undefined}>
            The linked pair is not flagged at 10 mi.
          </Notice>
          <Notice tone="warn" icon={<AlertTriangle />} role="none">
            Basemap unavailable — showing bundled Census boundaries. All plan data is local.
          </Notice>
          <Notice icon={<Info />} actionLabel="Show it" onAction={() => undefined} onDismiss={() => undefined} role="none">
            The pair isn&apos;t flagged at 10 mi.
          </Notice>
        </div>
      </Block>
      <Block label="EmptyState · Spinner · Kbd · Divider">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-card bg-fill-1">
            <EmptyState
              icon={<SearchX />}
              title="No pairs match the current filters"
              action={
                <Button variant="secondary" size="sm">
                  Clear filters
                </Button>
              }
            >
              12 pairs in this tab are hidden.
            </EmptyState>
          </div>
          <div className="space-y-5">
            <div className="flex items-center gap-4 text-caption text-fg-2">
              <Spinner />
              <Spinner size={16} className="text-fg-3" />
              <span className="flex items-center gap-2">
                <span className="size-1.5 animate-status-ping rounded-full bg-fg-1" /> Comparing 7,830 pairs…
              </span>
            </div>
            <div className="flex items-center gap-2 text-caption text-fg-3">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> to move · <Kbd>↵</Kbd> to open · <Kbd>Esc</Kbd> to close
            </div>
            <Divider />
            <div className="flex h-6 items-center gap-3 text-caption text-fg-3">
              Sources <Divider orientation="vertical" /> Method <Divider orientation="vertical" /> Reviewer
            </div>
          </div>
        </div>
      </Block>
      <Block label="Error boundary" note="app/error.tsx — Retry re-renders the segment">
        <CrashButton />
      </Block>
    </Section>
  );
}

function CrashButton() {
  const [crash, setCrash] = useState(false);
  if (crash) throw new Error("Styleguide: deliberate render error");
  return (
    <Button variant="ghost" size="sm" icon={<AlertTriangle size={14} />} onClick={() => setCrash(true)}>
      Throw a render error
    </Button>
  );
}

/* ── legacy ───────────────────────────────────────────────────────────────── */

const BOTH = { badge: "BOTH", geo: "confirmed", time: "confirmed" } as unknown as Match;
const GEO_ONLY = { badge: "GEO", geo: "confirmed", time: "possible" } as unknown as Match;

function LegacySection() {
  return (
    <Section id="legacy" index="09" title="Legacy exports" lede="Kept (restyled, same props) so untouched components render until they are rewritten. Don't use in new code.">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm">
          outline
        </Button>
        <Button variant="subtle" size="sm">
          subtle
        </Button>
        <SignalTag kind="GEO" level="confirmed" />
        <SignalTag kind="TIME" level="possible" />
        <MatchBadges m={BOTH} />
        <MatchBadges m={GEO_ONLY} compact />
        <StatusChip status="needs-review" />
        <StatusChip status="known-coordination" size="md" />
        <StatusChip status="possible" />
        <ConflictChip count={1} />
        <ConflictChip count={3} />
        <PrecisionTag precision="named-facility" />
        <PrecisionTag precision="locality" extra="≈3 km" />
        <Dot color="var(--a)" />
        <Dot color="var(--b)" ring />
      </div>
    </Section>
  );
}
