"use client";

import clsx from "clsx";
import { Check, Play } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { FOCAL_UTILITIES } from "@/lib/mapdata";
import { useAtlas } from "@/lib/store";
import { Button, Disclosure, Divider, Eyebrow, Spinner, UtilityDot } from "../ui";
import { Footer } from "./Footer";
import { ProofButton } from "./ProofButton";
import { fmt, pairsToCheck, plannedProjects, regionLabel, regionProjects, regionSourceCount, SNAPSHOT_DATE, SOURCE_COUNT, statusLabel, utilityName, utilityPlans, type UtilityPlans } from "./model";

/** Shared with the results sub-line: the eye follows 7,830 → "of 7,830 pairs checked". */
export const PAIRS_LAYOUT_ID = "opportunities-pairs-checked";

const SHOWN_UTILITIES = 4;
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * State A + B (SPEC §4): the arrive hero and, while the engine runs (≥900 ms), the same hero with the CTA turned into
 * progress and a 4-step checklist. On phones the status line and the CTA come first, so the 132px peek shows them.
 */
export function Hero({ phone, error }: { phone: boolean; error?: ReactNode }) {
  const region = useAtlas((s) => s.region);
  const running = useAtlas((s) => s.running);
  const demo = useAtlas((s) => s.demoStep !== null);
  const compare = useAtlas((s) => s.compare);

  const projects = regionProjects(region);
  // the stat counts what the engine compares: completed / no-longer-listed plans stay in the plans list, not in "planned"
  const planned = plannedProjects(region).length;
  const pairs = pairsToCheck(region);
  const plans = utilityPlans(region);
  const n = plans.length;
  const title = n === 2 ? "Two utilities. Two separate plans." : `${n < 10 ? WORDS[n] : fmt(n)} utilities. Separate plans.`;
  const collapsed = demo; // the demo card narrates; the hero's title and body step aside

  const cta = (
    <div>
      <Button
        variant={demo ? "secondary" : "primary"}
        size="xl"
        block
        loading={running}
        shortcut={running ? undefined : "C"}
        icon={<Play size={16} fill="currentColor" strokeWidth={0} />}
        onClick={() => void compare({ explicit: true })}
        disabled={!projects.length}
        className="justify-center"
      >
        {running ? `Comparing ${fmt(pairs)} pairs…` : "Compare public plans"}
      </Button>
      {running ? <Checklist projects={projects.length} pairs={pairs} /> : <p className="mt-2 text-caption text-fg-3">Runs the deterministic engine over the frozen public snapshot.</p>}
    </div>
  );

  const stats = (
    <div className="grid grid-cols-3 gap-1.5">
      <HeroStat value={fmt(planned)} label="planned projects" />
      <HeroStat value={fmt(pairs)} label="pairs to check" layoutId={PAIRS_LAYOUT_ID} title="Cross-utility pairs: two planned projects in the region with no owner in common" />
      <HeroStat
        value={fmt(SOURCE_COUNT)}
        label="public sources"
        title={region === "all" ? undefined : `${SOURCE_COUNT} documents in the snapshot; ${regionSourceCount(region)} cite ${regionLabel(region)} plans`}
      />
    </div>
  );

  const intro = (
    <motion.div
      initial={false}
      animate={collapsed ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
      inert={collapsed || undefined}
    >
      <h2 className="text-title font-semibold text-fg-1 text-balance">{title}</h2>
      <p className="mt-2 text-ui text-pretty text-fg-2">
        <Intro region={region} plans={plans} />
      </p>
    </motion.div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {phone ? (
          <div className="px-(--panel-pad) pt-1 pb-4">
            <p className="flex h-6 items-center gap-2 text-caption text-fg-3">
              <Eyebrow className="truncate">{regionLabel(region)}</Eyebrow>
              <span className="text-fg-4">·</span>
              <span className="shrink-0">
                <span className="num text-fg-2">{fmt(pairs)}</span> pairs to check
              </span>
            </p>
            <div className="mt-2">{cta}</div>
            {error}
            <div className="mt-5 space-y-4">
              {intro}
              {stats}
              <ProofButton stacked />
            </div>
          </div>
        ) : (
          <div className="px-(--panel-pad) pt-4 pb-4">
            <Eyebrow as="p">{regionLabel(region)}</Eyebrow>
            <div className={clsx("transition-[margin] duration-300", collapsed ? "mt-0" : "mt-3")}>{intro}</div>
            <div className="mt-5">{stats}</div>
            <div className="mt-4">{cta}</div>
            {error}
            <ProofButton stacked className="mt-4" />
          </div>
        )}
        <Divider />
        <PlansList region={region} plans={plans} />
        {/* phones: the sheet's peek must show the CTA, so the caption scrolls with the content */}
        {phone && <Footer />}
      </div>
      {!phone && <Footer />}
    </div>
  );
}

function HeroStat({ value, label, layoutId, title }: { value: string; label: string; layoutId?: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-control bg-fill-1 px-3 pt-2.5 pb-2" title={title}>
      {/* inline-block: the shared-layout morph scales the number itself, not a tile-wide box */}
      <span className="block leading-none">
        {layoutId ? (
          <motion.span layoutId={layoutId} className="num inline-block text-title leading-none font-medium text-fg-1">
            {value}
          </motion.span>
        ) : (
          <span className="num inline-block text-title leading-none font-medium text-fg-1">{value}</span>
        )}
      </span>
      <span className="mt-1.5 block text-caption leading-[1.3] text-fg-3">{label}</span>
    </div>
  );
}

/** Names the focal pair in its map hues, then the rest in grey; states Sperry's rule once. */
function Intro({ region, plans }: { region: string; plans: UtilityPlans[] }) {
  const rule = (
    <>
      Compare them under Sperry’s rule: project centers within <span className="font-medium text-fg-1">25 miles</span>.
    </>
  );
  if (region === "all") {
    return (
      <>
        {plans.length} utilities in three regions publish their transmission plans in separate documents. Each region’s focal pair takes the two hues{" "}
        <InlineDot hue="a" />
        <InlineDot hue="b" />; other owners are named on rows. {rule}
      </>
    );
  }
  const [a, b] = FOCAL_UTILITIES[region] ?? [plans[0]?.id, plans[1]?.id];
  const others = plans.length - 2;
  return (
    <>
      <span className="text-fg-1">{utilityName(a)}</span> <InlineDot hue="a" />
      {others > 0 ? ", " : " and "}
      <span className="text-fg-1">{utilityName(b)}</span> <InlineDot hue="b" />
      {others > 0 && (
        <>
          {" "}
          and {others} other {others === 1 ? "utility" : "utilities"} (grey)
        </>
      )}{" "}
      publish their transmission plans in separate documents. {rule}
    </>
  );
}

function InlineDot({ hue }: { hue: "a" | "b" }) {
  return <UtilityDot utility={hue} size={7} className="mx-px -translate-y-px align-middle" />;
}

const STEP_MS = 220;

/** The four narrated engine steps (existing copy; counts match the hero; the date reads like everywhere else). */
function Checklist({ projects, pairs }: { projects: number; pairs: number }) {
  const steps = [
    `Loading ${fmt(projects)} public plans from the ${SNAPSHOT_DATE} snapshot`,
    "Filtering to active plans with distinct owners",
    `Evaluating ${fmt(pairs)} project pairs — place, then timing`,
    "Checking documented coordination and source conflicts",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), STEP_MS);
    return () => window.clearInterval(t);
  }, [steps.length]);
  return (
    <div role="status" aria-live="polite" className="mt-3 space-y-2 rounded-control bg-fill-1 px-3 py-2.5">
      {steps.map((s, k) => (
        <div key={s} className={clsx("flex items-start gap-2.5 text-caption transition-opacity duration-200", k <= i ? "opacity-100" : "opacity-35")}>
          <span className="mt-px grid size-4 shrink-0 place-items-center">
            {k < i ? (
              <Check aria-hidden size={13} strokeWidth={2.25} className="text-ok" />
            ) : k === i ? (
              <Spinner size={12} className="text-fg-2" />
            ) : (
              <span aria-hidden className="size-1 rounded-full bg-fg-4" />
            )}
          </span>
          <span className={k <= i ? "text-fg-1" : "text-fg-3"}>{s}</span>
        </div>
      ))}
    </div>
  );
}

/** "Separate plans, separate documents": every utility with plans here; each row discloses its plans (hover → map dot). */
function PlansList({ region, plans }: { region: string; plans: UtilityPlans[] }) {
  const [all, setAll] = useState(false);
  const [seen, setSeen] = useState(region);
  if (seen !== region) {
    setSeen(region);
    setAll(false);
  }
  const shown = all ? plans : plans.slice(0, SHOWN_UTILITIES);
  const more = plans.length - shown.length;
  return (
    <section aria-labelledby="separate-plans" className="px-(--panel-pad) pt-4 pb-3">
      <Eyebrow as="h3" id="separate-plans">
        Separate plans, separate documents
      </Eyebrow>
      <div className="mt-2 -mx-2">
        {shown.map((u) => (
          <UtilityRow key={u.id} u={u} />
        ))}
      </div>
      {(more > 0 || all) && plans.length > SHOWN_UTILITIES && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 rounded-chip text-caption font-medium text-fg-2 transition-colors hover:text-fg-1">
          {all ? "Show fewer utilities" : `+ ${more} more ${more === 1 ? "utility" : "utilities"}`}
        </button>
      )}
    </section>
  );
}

function UtilityRow({ u }: { u: UtilityPlans }) {
  const set = useAtlas((s) => s.set);
  const hovered = useAtlas((s) => s.hoveredProjectId);
  return (
    <Disclosure
      buttonClassName="px-2 py-1.5! hover:bg-fill-1 rounded-control!"
      summary={
        <span className="flex min-w-0 items-center gap-2.5">
          <UtilityDot utility={u.hue} size={7} />
          <span className="min-w-0">
            <span className="block truncate text-ui font-medium text-fg-1">{u.name}</span>
            {u.doc && (
              <span className="line-clamp-2 text-caption font-normal text-pretty text-fg-3" title={u.doc}>
                {u.doc}
              </span>
            )}
          </span>
        </span>
      }
      meta={fmt(u.projects.length)}
    >
      <ul className="mb-1.5 ml-[26px] border-l border-divider pl-2">
        {u.projects.map((p) => (
          <li
            key={p.id}
            onMouseEnter={() => set({ hoveredProjectId: p.id })}
            onMouseLeave={() => useAtlas.getState().hoveredProjectId === p.id && set({ hoveredProjectId: null })}
            className={clsx(
              "flex min-w-0 items-baseline gap-2 rounded-chip px-2 py-1 text-caption transition-colors duration-100",
              hovered === p.id ? "bg-fill-2 text-fg-1" : "text-fg-2",
            )}
          >
            <span className="min-w-0 flex-1 truncate" title={p.title}>
              {p.shortTitle}
            </span>
            <span className="shrink-0 text-[11px] text-fg-3">{statusLabel(p)}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
