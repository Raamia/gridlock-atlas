"use client";

import clsx from "clsx";
import { BookOpenText, CirclePlay, ClipboardCheck, Ellipsis, Library, RotateCcw, X } from "lucide-react";
import { IDX, SNAPSHOT } from "@/lib/data";
import { useSelectedPair } from "@/lib/hooks";
import { tierOf, useViewport } from "@/lib/layout";
import { FOCAL_UTILITIES } from "@/lib/mapdata";
import { useReview } from "@/lib/review";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, LogoMark, Menu, MenuItem, MenuSeparator, Segmented, Select, Tooltip, UtilityDot } from "./ui";

// the mark lives in ui.tsx (also app/icon.svg); re-exported for anything that still imports it from here
export { LogoMark } from "./ui";

/**
 * The header (SPEC §3): transparent over the map, one variant rendered at a time (JS media query; SSR = desktop), so
 * there is exactly one #demo-toggle and one Region control on the page.
 *
 *   ≥1280  [mark GridLock Atlas / legend] [Region] ………… [Sources 103 · Method · reviewer · reset] [Guided demo]
 *   768+   same, the right capsule collapses to 32px icon buttons with the same accessible names
 *   <768   [mark GridLock] ………… [Region select] [demo] [⋯ Sources · Method · Reviewer mode · Reset view]
 */

const SHORT: Record<string, string> = { southeast: "SC–GA", "upper-midwest": "Midwest", "southern-plains": "Plains" };
const REGIONS = [...SNAPSHOT.regions.map((r) => ({ id: r.id, label: r.label, short: SHORT[r.id] ?? r.label })), { id: "all", label: "All", short: "All" }];
const UTILITY_COUNT = new Set(SNAPSHOT.projects.flatMap((p) => p.owners.map((o) => o.utilityId))).size;
const SOURCE_COUNT = SNAPSHOT.sources.length;
const SOURCES_LABEL = `Source registry: ${SOURCE_COUNT} sources, ${UTILITY_COUNT} utilities`;

/** Legend name for a utility: its full name when it fits ("Dominion Energy SC", "Georgia Power"), else its short name. */
function legendName(utilityId: string): string {
  const u = IDX.utility(utilityId);
  if (!u) return utilityId;
  const name = u.name.replace(/ South Carolina$/, " SC");
  return name.length <= 20 ? name : u.shortName;
}

export function TopBar() {
  const { vw } = useViewport();
  const tier = tierOf(vw);
  return tier === "phone" ? <PhoneHeader /> : <DesktopHeader wide={vw >= 1536} compact={tier !== "xl"} legend={tier !== "md"} />;
}

/* ─────────────────────────────────────────────── desktop / tablet ─────────────────────────────────────────────── */

function DesktopHeader({ wide, compact, legend }: { wide: boolean; compact: boolean; legend: boolean }) {
  const region = useAtlas((s) => s.region);
  const setRegion = useAtlas((s) => s.setRegion);
  const set = useAtlas((s) => s.set);
  const openMethod = useAtlas((s) => s.openMethod);
  const resetView = useAtlas((s) => s.resetView);

  return (
    <header
      role="banner"
      data-map-ui
      data-map-pad="top"
      className="absolute z-(--z-chrome) flex min-w-0 items-center gap-3 xl:gap-5"
      style={{ left: "var(--gutter)", right: "var(--gutter)", top: "var(--gutter)", height: "var(--header-h)" }}
    >
      <Brand legend={legend} />

      <Segmented
        variant="pressed"
        as="nav"
        label="Region"
        look="subtle"
        surface="map"
        // one 40px control height across the header (nav, action capsule, demo pill) at every desktop/tablet width
        size="md"
        className="shrink-0"
        value={region}
        onChange={setRegion}
        items={REGIONS.map((r) => ({
          value: r.id,
          // the accessible name is always the full region name (tests and screen readers); the pill shows the short one below 1536px
          label: wide ? r.label : r.short,
          ariaLabel: r.label,
          tooltip: !wide && r.short !== r.label ? r.label : undefined,
        }))}
      />

      <div data-header-actions="" className="ml-auto flex shrink-0 items-center gap-2">
        <div className="chrome flex items-center gap-0.5 rounded-full p-[3px]">
          {compact ? (
            <>
              <IconButton label={SOURCES_LABEL} tooltipSide="bottom" onClick={() => set({ sourcesOpen: true, methodOpen: false })}>
                <Library size={16} strokeWidth={1.75} />
              </IconButton>
              <IconButton label="Method" tooltip="Method & audit" tooltipSide="bottom" onClick={() => openMethod()}>
                <BookOpenText size={16} strokeWidth={1.75} />
              </IconButton>
            </>
          ) : (
            <>
              <Tooltip content="Every cited public document, hashed and dated" side="bottom">
                <Button
                  variant="ghost"
                  size="md"
                  icon={<Library size={16} strokeWidth={1.75} />}
                  aria-label={SOURCES_LABEL}
                  onClick={() => set({ sourcesOpen: true, methodOpen: false })}
                >
                  Sources
                  <span className="num text-fg-3">{SOURCE_COUNT}</span>
                </Button>
              </Tooltip>
              <Tooltip content="Method & audit: rules, proof, evaluation" side="bottom">
                <Button variant="ghost" size="md" icon={<BookOpenText size={16} strokeWidth={1.75} />} onClick={() => openMethod()}>
                  Method
                </Button>
              </Tooltip>
            </>
          )}
          <ReviewToggle />
          <IconButton label="Reset view" tooltipSide="bottom" onClick={resetView}>
            <RotateCcw size={16} strokeWidth={1.75} />
          </IconButton>
        </div>
        <DemoToggle narrow={!legend} />
      </div>
    </header>
  );
}

/**
 * Logo + wordmark (the page's h1) + the colour legend. With the legend the block has a FIXED width (the legend
 * truncates inside it), so a long pair legend never pushes the Region nav sideways.
 */
function Brand({ legend }: { legend: boolean }) {
  return (
    // 292px fits the widest region legend ("● Dominion Energy SC × ● Georgia Power", 236px + the mark); pair legends truncate to it
    <div className={clsx("flex min-w-0 shrink-0 items-center gap-2.5", legend && "w-[292px]")}>
      <LogoMark size={30} />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-baseline gap-[5px] leading-none whitespace-nowrap text-fg-1">
          <span className="text-heading leading-none font-semibold tracking-[-0.02em]">GridLock</span>{" "}
          <span className="font-display text-title leading-none tracking-normal italic">Atlas</span>
        </h1>
        {legend && <HeaderLegend />}
      </div>
    </div>
  );
}
/**
 * The colour key for whatever is on screen: the region's focal pair, the "All" rule, or the selected pair's two owners
 * (A = --util-a, B = --util-b: the hues the map, inspector, timeline and close-up use for them).
 */
function HeaderLegend() {
  const region = useAtlas((s) => s.region);
  const pair = useSelectedPair();

  let key: string;
  let title: string | undefined;
  let body: React.ReactNode;
  if (pair) {
    // lead owner + "+N" (the rows' convention); every owner's full name is in the title
    const owners = (p: typeof pair.a) => `${legendName(p.owners[0]?.utilityId ?? "")}${p.owners.length > 1 ? ` +${p.owners.length - 1}` : ""}`;
    const a = owners(pair.a);
    const b = owners(pair.b);
    const full = (p: typeof pair.a) => p.owners.map((o) => IDX.utility(o.utilityId)?.name ?? o.utilityId).join(" · ");
    title = `${full(pair.a)} × ${full(pair.b)}`;
    key = `pair:${pair.match.id}`;
    body = (
      <>
        <LegendEntry utility="a" name={a} />
        <span className="text-fg-4">×</span>
        <LegendEntry utility="b" name={b} />
      </>
    );
  } else if (region === "all" || !FOCAL_UTILITIES[region]) {
    key = "all";
    body = (
      <>
        <span>Focal pair per region</span>
        <span className="inline-flex items-center gap-1">
          <UtilityDot utility="a" />
          <UtilityDot utility="b" />
        </span>
        <span className="text-fg-4">·</span>
        <span>owners named on rows</span>
      </>
    );
  } else {
    const [u1, u2] = FOCAL_UTILITIES[region];
    key = `region:${region}`;
    body = (
      <>
        <LegendEntry utility="a" name={legendName(u1)} />
        <span className="text-fg-4">×</span>
        <LegendEntry utility="b" name={legendName(u2)} />
      </>
    );
  }
  return (
    <p key={key} title={title} className="mt-[5px] flex min-w-0 animate-fade-in items-center gap-1.5 overflow-hidden text-caption leading-none whitespace-nowrap text-fg-3">
      {body}
    </p>
  );
}

function LegendEntry({ utility, name }: { utility: "a" | "b"; name: string }) {
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1.5">
      <UtilityDot utility={utility} />
      {/* leading-[1.2] keeps descenders inside the truncation box */}
      <span className="min-w-0 truncate leading-[1.2] text-fg-2">{name}</span>
    </span>
  );
}

function ReviewToggle() {
  const enabled = useReview((s) => s.enabled);
  const toggle = useReview((s) => s.toggle);
  return (
    <IconButton label={enabled ? "Reviewer mode on" : "Reviewer mode"} tooltipSide="bottom" onClick={toggle} aria-pressed={enabled}>
      <ClipboardCheck size={16} strokeWidth={1.75} className={clsx("transition-colors", enabled && "text-ok")} />
    </IconButton>
  );
}

/** Start / exit the guided demo. The single #demo-toggle on the page (the demo returns focus to it on exit). */
function useDemoToggle() {
  const demoStep = useAtlas((s) => s.demoStep);
  const set = useAtlas((s) => s.set);
  const on = demoStep !== null;
  const toggle = () => set(on ? { demoStep: null, briefOpen: false, highlightConflict: false, focusConflict: null } : { demoStep: 0 });
  return { on, toggle, label: on ? "Exit guided demo" : "Start guided demo" };
}

function DemoToggle({ narrow }: { narrow: boolean }) {
  const { on, toggle, label } = useDemoToggle();
  return (
    <Button
      id="demo-toggle"
      variant="secondary"
      size="md"
      aria-label={label}
      className={clsx("h-10! px-4!", on ? "bg-fill-3!" : "bg-surface-chrome! hover:bg-surface-raised!")}
      icon={on ? <X size={16} strokeWidth={1.75} /> : <CirclePlay size={16} strokeWidth={1.75} />}
      onClick={toggle}
    >
      {/* visible text stays inside the accessible name (Start guided demo / Exit guided demo) */}
      {on ? (narrow ? "Exit" : "Exit guided demo") : "Guided demo"}
    </Button>
  );
}

/* ─────────────────────────────────────────────────── phone ─────────────────────────────────────────────────── */

function PhoneHeader() {
  const region = useAtlas((s) => s.region);
  const setRegion = useAtlas((s) => s.setRegion);
  const set = useAtlas((s) => s.set);
  const openMethod = useAtlas((s) => s.openMethod);
  const resetView = useAtlas((s) => s.resetView);
  const reviewOn = useReview((s) => s.enabled);
  const toggleReview = useReview((s) => s.toggle);
  const demo = useDemoToggle();

  return (
    <header
      role="banner"
      data-map-ui
      data-map-pad="top"
      className="absolute z-(--z-chrome) flex min-w-0 items-center gap-2"
      style={{ left: "var(--gutter)", right: "var(--gutter)", top: "max(var(--gutter), var(--safe-t))", height: "var(--header-h)" }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <LogoMark size={28} />
        <h1 className="text-heading leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-fg-1">
          GridLock<span className="sr-only"> Atlas</span>
        </h1>
      </div>

      <Select
        label="Region"
        hideLabel
        look="field"
        value={region}
        title={REGIONS.find((r) => r.id === region)?.label}
        onChange={(e) => setRegion(e.target.value)}
        wrapperClassName="ml-auto min-w-0"
        className="h-11! max-w-[36vw] rounded-full! bg-surface-chrome! pl-3.5! text-ui backdrop-blur-chrome"
      >
        {REGIONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.short}
          </option>
        ))}
      </Select>

      <IconButton id="demo-toggle" label={demo.label} tooltip={false} size="xl" variant="chrome" className={demo.on ? "bg-surface-raised" : undefined} onClick={demo.toggle}>
        {demo.on ? <X size={18} strokeWidth={1.75} /> : <CirclePlay size={18} strokeWidth={1.75} />}
      </IconButton>

      <Menu
        align="end"
        minWidth={236}
        label="More options"
        trigger={
          <IconButton label="More options" tooltip={false} size="xl" variant="chrome">
            <Ellipsis size={18} strokeWidth={1.75} />
          </IconButton>
        }
      >
        <MenuItem icon={<Library />} hint={`${SOURCE_COUNT} public documents · ${UTILITY_COUNT} utilities`} onSelect={() => set({ sourcesOpen: true, methodOpen: false })}>
          Sources
        </MenuItem>
        <MenuItem icon={<BookOpenText />} hint="Rules, proof, evaluation" onSelect={() => openMethod()}>
          Method
        </MenuItem>
        {/* a menuitemcheckbox: the on/off state is aria-checked (and the check at the end), not part of the name */}
        <MenuItem icon={<ClipboardCheck className={reviewOn ? "text-ok" : undefined} />} hint="Label pairs as you review" checked={reviewOn} onSelect={toggleReview}>
          Reviewer mode
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<RotateCcw />} onSelect={resetView}>
          Reset view
        </MenuItem>
      </Menu>
    </header>
  );
}
