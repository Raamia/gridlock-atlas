"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bot, CheckCircle2, CircleDashed, Download, ExternalLink, Search, X, XCircle } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/focus";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { SourceDocument } from "@/lib/domain/types";
import { regionExports } from "@/lib/export";
import { formatDate, pluralize } from "@/lib/format";
import EVAL from "@/data/eval/eval.json";
import XEVAL from "@/data/eval/extraction-eval.json";
import { ENGINE_VERSION, IN_SERVICE_HORIZON_DAYS, PAST_DUE_PENALTY } from "@/lib/matching/engine";
import { MIN_SCHEDULE_OVERLAP_DAYS } from "@/lib/matching/time";
import { readableNote, regionPairCounts } from "@/lib/selectors";
import { download } from "@/lib/review";
import {
  CONTEXT,
  CONTEXT_SOURCES,
  facilityKey,
  facilityNameSpread,
  PACKET,
  SEARCHES,
  SPONSOR_RADIUS_MILES,
  sponsorCheck,
  sponsorReplay,
  sponsorSheetCheck,
  starterBlanks,
  starterNameSpread,
  terminalCounts,
  withinSponsorRule,
  type Cite,
} from "@/lib/sponsor";
import { useAtlas } from "@/lib/store";
import { SourceRow } from "./Evidence";
import { ReviewExports } from "./Review";
import { Button, IconButton } from "./ui";

function Drawer({ open, onClose, title, eyebrow, children, width = 540 }: { open: boolean; onClose: () => void; title: string; eyebrow: string; children: ReactNode; width?: number }) {
  const panel = useRef<HTMLElement>(null);
  useDialogFocus(panel, open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-bg-0/55 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-0 right-0 top-0 flex max-w-full flex-col border-l border-line-2 bg-bg-1 shadow-[-30px_0_80px_-20px_rgba(0,0,0,.7)]"
            style={{ width }}
          >
            <header className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <div className="eyebrow">{eyebrow}</div>
                <h2 className="mt-1 font-serif text-[26px] leading-none text-text-0">{title}</h2>
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </header>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden break-words px-6 py-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* --------------------------------- sources --------------------------------- */

export function SourcesDrawer() {
  const open = useAtlas((s) => s.sourcesOpen);
  const set = useAtlas((s) => s.set);
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of Object.values(SNAPSHOT.evidence)) m.set(e.sourceId, (m.get(e.sourceId) ?? 0) + 1);
    return m;
  }, []);
  const cited = SNAPSHOT.sources.filter((s) => counts.get(s.id));
  const filtered = cited.filter((s) => `${s.title} ${s.publisher} ${s.url}`.toLowerCase().includes(q.toLowerCase()));
  const groups: [SourceDocument["sourceType"], string][] = [
    ["regulator", "State regulators"],
    ["utility", "Utilities"],
    ["rto", "Regional transmission organizations"],
  ];
  const verified = Object.values(SNAPSHOT.evidence).filter((e) => e.verifiedInSource).length;
  const total = Object.keys(SNAPSHOT.evidence).length;

  return (
    <Drawer open={open} onClose={() => set({ sourcesOpen: false })} eyebrow="Provenance" title="Source registry">
      <div className="grid grid-cols-3 gap-2">
        <Metric n={cited.length} label="cited public documents" />
        <Metric n={total} label="short excerpts" />
        <Metric n={total ? Math.round((verified / total) * 100) : 0} suffix="%" label="located verbatim" />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-text-2">
        Every source was fetched, hashed (SHA-256) and cached on {formatDate(SNAPSHOT.snapshotDate)}. The app reads this frozen snapshot, so it works when publisher sites or APIs are down. Only short
        excerpts with page anchors are stored.
      </p>
      <div className="relative mt-4">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter sources"
          aria-label="Filter sources"
          className="h-8 w-full rounded-lg border border-line-2 bg-bg-2 pl-8 pr-3 text-[12.5px] text-text-0 outline-none placeholder:text-text-3 focus:border-a"
        />
      </div>
      {groups.map(([type, label]) => {
        const list = filtered.filter((s) => s.sourceType === type);
        if (!list.length) return null;
        return (
          <div key={type} className="mt-5">
            <div className="eyebrow mb-1.5">
              {label} <span className="text-text-3">· {list.length}</span>
            </div>
            <div className="-mx-2.5">
              {list.map((s) => (
                <SourceRow key={s.id} s={s} count={counts.get(s.id)} />
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <p className="mt-6 text-center text-[12px] text-text-3">No sources match “{q.trim()}”.</p>}
    </Drawer>
  );
}

function Metric({ n, label, suffix }: { n: number; label: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2 p-3">
      <div className="num text-[24px] leading-none text-text-0">
        {n}
        {suffix && <span className="text-[15px] text-text-2">{suffix}</span>}
      </div>
      <div className="mt-1.5 text-[11px] leading-tight text-text-2">{label}</div>
    </div>
  );
}

/* ---------------------------------- method ---------------------------------- */

const CLUSTER_LABEL: Record<string, string> = {
  "beci-columbia": "BECI · Columbia",
  controls: "Upper Midwest controls",
  "dairyland-alma-blair": "Alma–Blair",
  "grid-forward": "Grid Forward",
  "mn-lrtp": "Minnesota LRTP",
  "potter-beckham": "Potter–Beckham",
  "sc-ga-context": "SC–GA context",
  "sc-ga-desc": "DESC plan",
  "sc-ga-gpc": "Georgia Power plan",
  "xcel-wwtc": "Western Wisconsin (WWTC)",
};

export function MethodDrawer() {
  const open = useAtlas((s) => s.methodOpen);
  const set = useAtlas((s) => s.set);
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  // the queue footer that opens this drawer counts the region on screen; show that same count here
  const regionCounts = useMemo(() => (run && region !== "all" ? regionPairCounts(run, SNAPSHOT.projects, region) : null), [run, region]);
  const regionName = SNAPSHOT.regions.find((r) => r.id === region)?.label;
  const inRegion = (id: string) => region === "all" || IDX.project(id)?.region === region;
  const excludedProjects = run?.excludedProjects.filter((x) => inRegion(x.projectId)) ?? [];
  const sharedOwner = run?.excludedPairs.filter((p) => p.reason === "shared-owner" && inRegion(p.projectAId)) ?? [];
  const openQs = useMemo(() => SNAPSHOT.unresolved.map((u) => ({ ...u, note: readableNote(u.note, IDX) })).filter((u) => u.note), []);
  const where = regionName ?? "All regions";
  const rule = useMemo(() => {
    if (!run) return null;
    const ms = run.matches.filter((m) => region === "all" || IDX.project(m.projectAId)?.region === region);
    const out = ms.filter((m) => !withinSponsorRule(m));
    const parts: [number, string][] = [
      [out.filter((m) => m.geoDetail.method === "shared-site" || m.geoDetail.method === "shared-endpoint").length, "shared facility"],
      [out.filter((m) => m.geoDetail.method === "measured" && m.geo === "possible").length, "location uncertainty"],
      [out.filter((m) => m.geoDetail.method === "measured" && m.geo === "confirmed").length, `the ${run.thresholdMiles} mi review radius`],
      [out.filter((m) => !m.geoDetail.center).length, "county-level"],
    ];
    return {
      where,
      inside: ms.length - out.length,
      possible: ms.filter((m) => withinSponsorRule(m) && m.geo === "possible").length,
      beyond: out.length,
      beyondText: parts
        .filter(([n]) => n)
        .map(([n, t]) => `${n} ${t}`)
        .join(", "),
    };
  }, [run, region, where]);
  return (
    <Drawer open={open} onClose={() => set({ methodOpen: false })} eyebrow="How it works" title="Method & audit" width={600}>
      <Pipeline />

      <H>Matching rules</H>
      <ul className="space-y-2 text-[12.5px] leading-[1.55] text-text-1">
        <Rule k="Eligible">
          Distinct work packages in the same region whose owner sets do not overlap, with status proposed, approved or under construction. Completed (a source says so), cancelled and
          duplicate records are archived. A plan whose in-service date has passed without a source confirming completion stays in the queue, flagged “planned date passed; completion
          not confirmed”, with TIME at most “possible” and {PAST_DUE_PENALTY} points off its rank.
        </Rule>
        <Rule k="Place first">
          Sperry&apos;s rule: a pair counts when the project centers are under {SPONSOR_RADIUS_MILES} mi apart. Each center is the midpoint of the project&apos;s two named sub-points (or
          its one located point), exactly as in the guide.
          {rule && (
            <>
              {" "}
              {rule.where}: <b className="font-medium text-text-0">{rule.inside}</b> {rule.inside === 1 ? "pair meets" : "pairs meet"} it
              {rule.possible > 0 && ` (${rule.possible} only “possible” because a location is approximate)`}.
            </>
          )}{" "}
          Only these go into the sponsor-format overlap CSV, numbered OVL_1… by distance as in the starter file. With location uncertainty,{" "}
          <Code>d_low = max(0, d − e_A − e_B)</Code>, <Code>d_high = d + e_A + e_B</Code>: confirmed if <Code>d_high ≤ 25</Code>, possible if only <Code>d_low ≤ 25</Code>. Beyond
          Sperry&apos;s rule we also flag, with the reason stated in the “all flagged pairs” export: a shared facility stated in a source (or implied by several, flagged as such) or
          terminals geocoded to the same substation, whatever the line length; uncertainty that reaches inside the radius; county-level evidence (never better than “possible”)
          {rule && rule.beyond > 0 && ` — ${rule.beyond} here: ${rule.beyondText}`}. Schematic route traces are never measured.
        </Rule>
        <Rule k="Then time">
          Construction windows are compared for every source combination (confirmed when <Code>max(S_latest) ≤ min(E_earliest)</Code>). No window is invented from an in-service
          date alone: a start plus a “by”/need date is kept as bounds with the field work undated, and DESC&apos;s yearly budget gives a coarse window — both support at most a
          “possible” overlap. Published schedules are compared separately: Georgia Power&apos;s Start Date (the Ten-Year Plan&apos;s “schedule for implementation”) or DESC&apos;s
          first evidenced spending, to the current in-service date. When two schedules certainly overlap for at least {MIN_SCHEDULE_OVERLAP_DAYS} days, TIME is confirmed on a
          schedule basis (“Published schedules overlap (start → in-service) for N months; field-work dates are not published”) — never called a construction overlap; a
          construction-window result that confirms or rules out overlap takes precedence. If a plan&apos;s in-service date has passed without a source confirming completion, TIME is
          at most “possible”. The in-service gap in days (the sponsor&apos;s secondary signal) informs ranking; missing windows stay “unknown.”
        </Rule>
        <Rule k="Status">
          Documented joint work or interface coordination between the two projects (a sourced coordination claim naming the other project, or a shared initiative) files a pair under{" "}
          <i>Known coordination</i>; a tie line alone does not. Anything else within the radius is <i>Needs review</i> — which means the reviewed sources are silent, never that the
          utilities are uncoordinated.
        </Rule>
        <Rule k="Rank">
          Explainable ordering, not a probability: shared facility or closer centers first (up to 60 pts), then schedule (construction-window overlap 30; overlapping published
          schedules 28–30; possible overlap or in-service gap within {IN_SERVICE_HORIZON_DAYS / 365} years, up to 30), then evidence completeness (up to 10); lower-confidence
          locations lose 5 and a passed planned date loses {PAST_DUE_PENALTY}. A pair flagged only by a shared facility while its centers are beyond the radius ranks after every
          within-radius needs-review pair.
        </Rule>
      </ul>

      <H>Sponsor worked example (live)</H>
      <SponsorExample />

      <H>Sperry&apos;s six rows in today&apos;s plans</H>
      <SponsorReplay />

      <H>Sponsor-format exports</H>
      <SponsorExports />

      <H>Location workflow (Sperry&apos;s guide, three steps)</H>
      <LocationWorkflow region={region} where={where} />

      <H>Context the challenge names</H>
      <ChallengeContext />

      <H>Corpus checks (live)</H>
      <CorpusChecks />

      <H>Evaluation (npm run eval)</H>
      <Evaluation />

      {run && (
        <>
          <H>What the engine excluded</H>
          <div className="space-y-1.5">
            {excludedProjects.map((x) => (
              <div key={x.projectId} className="flex items-start gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[12px] ring-1 ring-line">
                <span className="mono mt-0.5 rounded bg-bg-3 px-1.5 text-[10px] uppercase text-text-2">{x.reason}</span>
                <span>
                  <span className="text-text-0">{IDX.project(x.projectId)?.title}</span>
                  <span className="block text-[11px] text-text-3">{x.detail}</span>
                </span>
              </div>
            ))}
            {sharedOwner.slice(0, 8).map((p) => (
              <div key={`${p.projectAId}-${p.projectBId}`} className="flex items-start gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[12px] ring-1 ring-line">
                <span className="mono mt-0.5 rounded bg-bg-3 px-1.5 text-[10px] uppercase text-text-2">shared owner</span>
                <span>
                  <span className="text-text-0">
                    {IDX.project(p.projectAId)?.shortTitle} × {IDX.project(p.projectBId)?.shortTitle}
                  </span>
                  <span className="block text-[11px] text-text-3">{p.detail}</span>
                </span>
              </div>
            ))}
            {regionCounts && (
              <p className="pt-1 text-[11px] leading-snug text-text-2">
                {regionName}: {regionCounts.beyond.toLocaleString("en-US")} {regionCounts.beyond === 1 ? "pair" : "pairs"} not flagged (farther than {run.thresholdMiles} mi, no shared
                facility) · {regionCounts.unlocated.toLocaleString("en-US")} with a location not yet established.
              </p>
            )}
            <p className="pt-1 text-[11px] leading-snug text-text-3">
              Pair totals, all regions: {run.excludedCounts["shared-owner"].toLocaleString("en-US")} shared-owner (internal context; {Math.min(8, sharedOwner.length)} nearby{" "}
              {regionCounts ? "ones in this region" : "ones"} shown) ·{" "}
              {(run.excludedCounts["beyond-radius"] + run.excludedCounts["no-signal"]).toLocaleString("en-US")} farther than {run.thresholdMiles} mi ·{" "}
              {run.excludedCounts["location-unknown"].toLocaleString("en-US")} with a location not yet established · {run.excludedCounts["different-region"].toLocaleString("en-US")} across regions.
            </p>
          </div>
        </>
      )}

      <H>Reviewer mode</H>
      <ReviewExports />

      <H>AI extraction</H>
      <ExtractionRuns />

      {openQs.length > 0 && (
        <>
          <H>Open research questions</H>
          <p className="mb-2 text-[12px] text-text-2">Gaps recorded during source review. They are shown, not hidden.</p>
          <ul className="space-y-1.5">
            {openQs.map((u, i) => (
              <li key={i} className="rounded-lg bg-bg-2 px-3 py-2 text-[11.5px] leading-snug text-text-1 ring-1 ring-line [overflow-wrap:anywhere]">
                <span className="mono mr-1.5 text-[10px] uppercase text-text-3">{CLUSTER_LABEL[u.cluster] ?? u.cluster}</span>
                {u.note}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-[11px] text-text-3">
        {ENGINE_VERSION} · snapshot {SNAPSHOT.version} · {formatDate(SNAPSHOT.snapshotDate)}
      </p>
    </Drawer>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mb-2.5 mt-7 text-[13px] font-semibold text-text-0">{children}</h3>;
}
function Code({ children }: { children: ReactNode }) {
  return <code className="mono rounded bg-bg-3 px-1 py-0.5 text-[11px] text-text-0">{children}</code>;
}
function Rule({ k, children }: { k: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[78px_1fr] gap-3">
      <span className="eyebrow pt-[3px]">{k}</span>
      <span>{children}</span>
    </li>
  );
}

function Pipeline() {
  const steps = ["Public URL", "Fetch + SHA-256", "Page text", "Structured extraction", "Verbatim span check", "Snapshot", "Deterministic engine", "Map · timeline · brief"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={clsx("rounded-md px-2 py-1 text-[11px] ring-1", i === 6 ? "bg-bg-3 text-text-0 ring-line-3" : "bg-bg-2 text-text-1 ring-line")}>{s}</span>
          {i < steps.length - 1 && <ArrowRight size={11} className="text-text-3" />}
        </span>
      ))}
    </div>
  );
}

function CorpusChecks() {
  const run = useAtlas((s) => s.run);
  const checks = useMemo(() => {
    if (!run) return [];
    const find = (a: string, b: string) => run.matches.find((m) => (m.projectAId === a && m.projectBId === b) || (m.projectAId === b && m.projectBId === a));
    const out: { label: string; expect: string; ok: boolean | null; got: string }[] = [];
    const add = (label: string, expect: string, a: string, b: string, test: (m: NonNullable<ReturnType<typeof find>>) => boolean) => {
      if (!IDX.project(a) || !IDX.project(b)) return;
      const m = find(a, b);
      out.push({ label, expect, ok: m ? test(m) : false, got: m ? `${m.badge} · ${m.reviewStatus}` : "not flagged" });
    };
    add("Dairyland Alma–Blair × Xcel WWTC", "GEO confirmed · known coordination", "dpc-alma-blair", "xcel-wwtc", (m) => m.geo === "confirmed" && m.time !== "no-match" && m.reviewStatus === "known-coordination");
    add("Potter–Beckham TX × OK segments", "known coordination", "sps-potter-beckham-tx", "transource-potter-beckham-ok", (m) => m.reviewStatus === "known-coordination");
    const archived = run.excludedProjects.filter((x) => x.reason === "complete" || x.reason === "cancelled");
    out.push({ label: "Completed / cancelled plans", expect: "excluded from queue", ok: archived.length > 0, got: `${archived.length} archived` });
    const xcel = IDX.project("xcel-wwtc");
    if (xcel) {
      const m = run.matches.find((x) => x.projectAId === "xcel-wwtc" || x.projectBId === "xcel-wwtc");
      out.push({
        label: "Xcel vs PSC completion dates",
        expect: "conflict shown, every source's window evaluated",
        ok: m ? m.conflicts.some((c) => c.projectId === "xcel-wwtc" && c.field === "completion" && c.sides.length > 1) && m.time !== "no-match" : null,
        got: m ? `${m.conflicts.length} conflict(s) · TIME ${m.time}` : "—",
      });
    }
    return out;
  }, [run]);
  if (!run) return <p className="text-[12px] text-text-3">Run the comparison to see live checks against the real corpus.</p>;
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      {checks.map((c) => (
        <div key={c.label} className="grid grid-cols-[18px_1fr_auto] items-start gap-2 border-b border-line bg-bg-2/60 px-3 py-2 last:border-b-0">
          {c.ok === null ? <CircleDashed size={14} className="mt-0.5 text-text-3" /> : c.ok ? <CheckCircle2 size={14} className="mt-0.5 text-known" /> : <XCircle size={14} className="mt-0.5 text-danger" />}
          <div>
            <div className="text-[12px] text-text-0">{c.label}</div>
            <div className="text-[11px] text-text-3">expected: {c.expect}</div>
          </div>
          <div className="mono text-right text-[10.5px] text-text-2">{c.got}</div>
        </div>
      ))}
    </div>
  );
}

const BASELINES: [string, string][] = [
  ["B1", "Same county + same in-service year"],
  ["B2", "Centers under 25 mi (Sperry's rule alone)"],
  ["B3", "Close OR on a similar schedule"],
  ["B5", "Under 25 mi AND a similar schedule"],
  ["B6", "Same facility name in both plans"],
  ["B4", "GridLock engine"],
];

/** The committed `npm run eval` report (data/eval), with its snapshot shown: it is not recomputed in the browser. */
function Evaluation() {
  const e = EVAL;
  const recall = e.interfaces.recall as Record<string, { all: { hit: number; of: number } }>;
  const frac = (id: string) => `${recall[id]?.all.hit ?? "–"}/${e.interfaces.inUniverse}`;
  const n = (v: number) => v.toLocaleString("en-US");
  const nc = e.negativeControls;
  const noSite = e.ablations.find((a) => a.id === "A3b");
  const steady = e.sweep.filter((s, i) => e.sweep.slice(i).every((t) => t.topLeadRank === 1));
  const x = XEVAL;
  const need = x.fields["gpc.inServiceDate"];
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-text-2">
        No human labels. “Documented interfaces” are the {e.interfaces.inUniverse} cross-utility links the filings state or imply (none in the Savannah River region); the engine&apos;s
        shared-facility rule reads the same statements, so its score there is a design check, not accuracy
        {noSite && ` (without that rule it keeps ${noSite.recall.all.hit}/${noSite.recall.all.of})`}. Unflagged pairs are not labeled negatives, so no precision is claimed.
        {e.meta.snapshot === SNAPSHOT.version
          ? ` Committed report for this snapshot (${e.meta.snapshot}, ${e.meta.engine}, ${e.meta.radiusMiles} mi).`
          : ` Computed on ${e.meta.snapshot}; this app runs ${SNAPSHOT.version} — re-run npm run eval.`}
      </p>
      <div className="overflow-hidden rounded-xl ring-1 ring-line">
        <div className="mono grid grid-cols-[1fr_58px_62px_62px] gap-2 border-b border-line bg-bg-3/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-3">
          <span>Method · {n(e.queue.universePairs)} pairs</span>
          <span className="text-right">Flagged</span>
          <span className="text-right">DESC×GPC</span>
          <span className="text-right">Interfaces</span>
        </div>
        {BASELINES.map(([id, label]) => {
          const b = e.baselines.find((x) => x.id === id);
          if (!b) return null;
          return (
            <div key={id} className={clsx("grid grid-cols-[1fr_58px_62px_62px] items-center gap-2 border-b border-line px-3 py-1.5 text-[11.5px] last:border-b-0", id === "B4" ? "bg-bg-3/40" : "bg-bg-2/60")}>
              <span className={id === "B4" ? "font-medium text-text-0" : "text-text-1"}>{label}</span>
              <span className="num text-right text-text-0">{n(b.flagged)}</span>
              <span className="num text-right text-text-0">{n(b.descGpc)}</span>
              <span className="num text-right text-text-0">{frac(id)}</span>
            </div>
          );
        })}
      </div>
      <ul className="mt-2 space-y-1 text-[11.5px] leading-snug text-text-1">
        <li>
          Sperry&apos;s example: overlap table {e.sponsor.overlapTable.matched}/{e.sponsor.overlapTable.of} rows exact, 0 extra pairs at every radius up to{" "}
          {Math.max(...nc.starterFile.byRadius.filter((r) => r.extra === 0).map((r) => r.R))} mi; project table {e.sponsor.projectSheet.matched}/{e.sponsor.projectSheet.of}.
        </li>
        <li>
          Negative controls: {nc.archived.B4} of {nc.archived.pairs} pairs with a completed project flagged; {nc.pastDue.B4timeConfirmed} of {nc.pastDue.B4flagged} flagged past-due
          pairs with TIME confirmed; {nc.far.B4notSharedFacility} pairs over 50 mi without a shared facility; {nc.crossRegion.B4} across regions.
        </li>
        {steady.length > 0 && (
          <li>
            The top Savannah River lead is #1 at every radius from {steady[0].R} to {steady[steady.length - 1].R} mi.
          </li>
        )}
        <li>
          Extraction cross-check: {Object.keys(x.models).join(", ")} re-read {x.pagesScored} plan pages. {n(x.verbatimQuote.all.k)} of{" "}
          {n(x.verbatimQuote.all.n)} quoted fields are verbatim on the page; where model and parser both give a value they agree {pct(x.overall.exact.rate)} (
          {n(x.overall.exact.k)}/{n(x.overall.exact.n)}). That is agreement with our parser, not accuracy; the model leaves Georgia Power&apos;s Need Date out on{" "}
          {need.counts.missed} of {need.stated} pages.
        </li>
      </ul>
    </div>
  );
}

function ExtractionRuns() {
  const runs = SNAPSHOT.extractionRuns;
  if (!runs.length)
    return (
      <div className="rounded-xl bg-bg-2 p-3 text-[12px] leading-snug text-text-2 ring-1 ring-line">
        <div className="flex items-center gap-2 text-text-1">
          <Bot size={14} className="text-text-3" /> No model extraction run is recorded in this snapshot.
        </div>
        <p className="mt-1.5">
          Plan fields were parsed deterministically from the DESC and Georgia Power documents; other facts were located by AI research agents and checked by adversarial agents.
          Every excerpt is then re-found verbatim by script. The structured model-extraction job (<code className="mono text-[11px]">npm run extract</code>, OpenAI or Gemini) records
          provider, model, prompt version and span checks here when run with an API key.
        </p>
      </div>
    );
  const located = runs.reduce((n, r) => n + r.fields.filter((f) => f.located).length, 0);
  const total = runs.reduce((n, r) => n + r.fields.length, 0);
  const cited = runs.reduce((n, r) => n + r.fields.filter((f) => f.inSnapshot).length, 0);
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-snug text-text-2">
        {runs[0].model} independently re-read {runs.length} source {runs.length === 1 ? "page" : "pages"}:{" "}
        <span className="num text-text-0">{located}</span> of <span className="num text-text-0">{total}</span> quoted spans were re-found verbatim (the rest are rejected), and{" "}
        <span className="num text-text-0">{cited}</span> quote a passage the snapshot already cites. Runs are a cross-check; they never add facts.
      </p>
      {runs.map((r) => (
        <div key={r.id} className="rounded-xl bg-bg-2 p-3 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <Bot size={14} className={r.status === "completed" ? "text-known" : "text-text-3"} />
            <span className="text-[12.5px] font-medium text-text-0">{IDX.source(r.sourceId)?.title ?? r.sourceId}</span>
            <span className={clsx("mono ml-auto rounded px-1.5 text-[10px] uppercase", r.status === "completed" ? "bg-known/10 text-known" : "bg-bg-3 text-text-3")}>{r.status}</span>
          </div>
          <div className="mono mt-1 text-[10.5px] text-text-3">
            {r.provider ? `${r.provider} · ` : ""}
            {r.model}
            {r.page ? ` · p. ${r.page}` : ""} · prompt {r.promptVersion}
            {r.runAt && ` · ${formatDate(r.runAt)}`}
          </div>
          {r.note && <p className="mt-1.5 text-[11.5px] leading-snug text-text-2">{r.note}</p>}
          {r.fields.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-line">
              {r.fields.map((f) => (
                <div key={f.field} className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-2 border-b border-line px-2.5 py-1.5 text-[11px] last:border-b-0">
                  <span className="mono truncate text-text-3">{f.field}</span>
                  <span className="truncate text-text-1" title={f.excerpt ? `${f.value}\n“${f.excerpt}”` : f.value}>
                    {f.value}
                  </span>
                  <span className={clsx("whitespace-nowrap", f.located ? "text-known" : "text-conflict")}>
                    {f.located ? (f.inSnapshot ? "span found · also cited" : "span found") : "span missing · rejected"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SponsorExample() {
  const r = useMemo(() => sponsorCheck(), []);
  const sheet = useMemo(() => sponsorSheetCheck(), []);
  const bad = r.rows.filter((x) => !x.ok).length;
  const sheetOk = sheet.every((x) => x.ok);
  const same = PACKET.filter((f) => IDX.source(f.sourceId)?.sha256 === f.sha256);
  return (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-text-2">
        The engine re-runs on the ten projects in Sperry&apos;s starter file (their coordinates and in-service dates) and must reproduce both of the guide&apos;s tables.
      </p>
      <div className="overflow-hidden rounded-xl ring-1 ring-line">
        <div className="mono grid grid-cols-[52px_1fr_78px_78px_18px] gap-2 border-b border-line bg-bg-3/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-3">
          <span>Row</span>
          <span>Pair</span>
          <span className="text-right">Miles</span>
          <span className="text-right">Days</span>
          <span />
        </div>
        {r.rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[52px_1fr_78px_78px_18px] items-center gap-2 border-b border-line bg-bg-2/60 px-3 py-1.5 text-[11.5px] last:border-b-0">
            <span className="mono text-text-3">{row.id}</span>
            <span className="text-text-1">{row.pair}</span>
            <span className="num text-right text-text-0" title={`sponsor ${row.sponsorMiles}`}>
              {row.ourMiles?.toFixed(2) ?? "—"}
            </span>
            <span className="num text-right text-text-0" title={`sponsor ${row.sponsorDays}`}>
              {row.ourDays?.toLocaleString("en-US") ?? "—"}
            </span>
            {row.ok ? <CheckCircle2 size={13} className="text-known" /> : <XCircle size={13} className="text-danger" />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-3">
        {r.allOk
          ? "All rows match the sponsor's table (±0.01 mi, exact days) and no extra pairs are flagged."
          : `Overlap table mismatch: ${bad} row(s) differ, ${r.extra.length} extra pair(s).`}{" "}
        {sheetOk
          ? `Project table: centers (the starter file's midpoint formula), overlap_count and overlap_1…3 match for all ${sheet.length} projects.`
          : `Project table mismatch: ${sheet.filter((x) => !x.ok).map((x) => x.id).join(", ")}.`}
        {same.length > 0 &&
          ` The packet's ${same.length === 2 ? "two" : same.length} plan PDFs are byte-identical (SHA-256) to our cached ${same.map((f) => f.label).join(" and ")}.`}
      </p>
    </div>
  );
}

const edition = (sourceId: string) => sourceId.match(/(\d{4})-(\d{4})$/)?.slice(1).join("–").concat(" list") ?? sourceId;
/** "the 2025–2029 and 2026–2030 lists" */
const editions = (ids: string[]) => (ids.length === 1 ? edition(ids[0]) : `${ids.map((id) => edition(id).replace(/ list$/, "")).join(" and ")} lists`);
const sourceOf = (id: string) => IDX.source(id) ?? CONTEXT_SOURCES[id];
const shortPublisher = (p: string) => p.replace(/\s*\(.*\)$/, "");

/** A short verbatim excerpt with its page and a link to the public source. */
function Quote({ c }: { c: Cite }) {
  const src = sourceOf(c.sourceId);
  const href = src && c.page && /\.pdf($|[?#])/i.test(src.url) ? `${src.url}#page=${c.page}` : src?.url;
  return (
    <blockquote className="mt-1.5 rounded-lg bg-bg-2/80 px-3 py-1.5 text-[11.5px] leading-snug text-text-1 ring-1 ring-line" title={c.supports}>
      <span className="italic text-text-0">“{c.excerpt}”</span>{" "}
      <span className="text-[10.5px] text-text-3">
        — {src ? shortPublisher(src.publisher) : c.sourceId}
        {c.page ? `, p. ${c.page}` : ""}
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-text-2 hover:text-a" aria-label={`Open source: ${src!.title}${c.page ? `, p. ${c.page}` : ""}`}>
            Open <ExternalLink size={9} />
          </a>
        )}
      </span>
    </blockquote>
  );
}

function SponsorReplay() {
  const run = useAtlas((s) => s.run);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const rows = useMemo(() => sponsorReplay(run, SNAPSHOT), [run]);
  const open = (id: string) => {
    set({ methodOpen: false });
    select(id);
  };
  const regionLabel = (id: string) => SNAPSHOT.regions.find((r) => r.id === IDX.project(id)?.region)?.label.split(" · ")[0];
  const tabLabel = (t?: string) => (t === "needs-review" ? "Needs review" : t === "known-coordination" ? "Known coordination" : "Possible");
  const days = (n?: number, atLeast?: boolean) => (n === undefined ? "no gap" : `${atLeast && n > 0 ? "≥" : ""}${n.toLocaleString("en-US")} d`);
  return (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-text-2">
        What became of each overlap row in the starter file, on today&apos;s plans. Starter projects are matched to plan records by title and in-service date; a project missing
        from the current list is “no longer listed,” never “completed.”
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const gone = [r.a, r.b].filter((s) => s.notListed);
          return (
            <div key={r.id} className="rounded-lg bg-bg-2 px-3 py-2 text-[11.5px] leading-snug ring-1 ring-line">
              <div className="flex items-baseline gap-2">
                <span className="mono shrink-0 text-[10.5px] text-text-3">{r.id}</span>
                <span className="min-w-0 flex-1 text-text-0">
                  {r.a.name} × {r.b.name}
                </span>
                <span className="num shrink-0 text-[10.5px] text-text-3" title="Sperry's starter table">
                  Sperry {r.sponsorMiles.toFixed(2)} mi · {r.sponsorDays.toLocaleString("en-US")} d
                </span>
              </div>
              {r.status === "in-queue" && (
                <div className="mt-1 flex items-start gap-1.5 text-text-1">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-known" />
                  <span className="flex-1">
                    In our queue: <b className="font-medium text-text-0">#{r.rank}</b> · {tabLabel(r.tab)} · {regionLabel(r.matchId!.split("__")[0])} — today {r.miles?.toFixed(2)} mi ·{" "}
                    {days(r.days, r.daysAtLeast)} on current plan dates.{r.pastDue && ` Kept although a planned date has passed — ${r.pastDue.join(" ")}`}
                  </span>
                  <button onClick={() => open(r.matchId!)} className="shrink-0 text-[10.5px] text-text-2 underline-offset-2 hover:text-a hover:underline">
                    Open pair
                  </button>
                </div>
              )}
              {r.status === "hidden" && (
                <div className="mt-1 flex items-start gap-1.5 text-text-1">
                  <CircleDashed size={12} className="mt-0.5 shrink-0 text-text-3" />
                  <span>
                    Both projects are still listed, but the pair is not in the queue — {r.reasons!.join(" ")}
                    {r.miles !== undefined && ` Today: ${r.miles.toFixed(2)} mi · ${days(r.days, r.daysAtLeast)}.`}
                  </span>
                </div>
              )}
              {r.status === "not-run" && <div className="mt-1 text-text-3">Run the comparison to see this pair&apos;s status.</div>}
              {gone.map((s) => (
                <div key={s.sponsorId} className="mt-1 flex items-start gap-1.5 text-text-1">
                  <CircleDashed size={12} className="mt-0.5 shrink-0 text-text-3" />
                  <span className="min-w-0 flex-1">
                    {s.sponsorId} (DESC project {s.notListed!.planId}) is no longer listed in the 2026–2030 list. It was last listed in the {edition(s.notListed!.lastListed.sourceId)}, p.{" "}
                    {s.notListed!.lastListed.page}; a text search of the {editions(s.notListed!.absentFrom)} finds no Project ID {s.notListed!.planId}. No source we
                    reviewed says it was completed.
                    <Quote c={s.notListed!.lastListed} />
                  </span>
                </div>
              ))}
              {r.related && (
                <div className="mt-1.5 border-t border-line pt-1.5 text-text-2">
                  Related (same corridor name, different Project ID): DESC&apos;s next listing, 6809 G, is still listed, now as {IDX.project(r.related.pair[0])?.title ?? r.related.pair[0]}.
                  {r.related.matchId
                    ? ` Its pair with ${r.b.sponsorId} is #${r.related.rank} · ${tabLabel(r.related.tab)} (${r.related.miles?.toFixed(2)} mi).`
                    : ` Its pair with ${r.b.sponsorId} is not flagged in this run.`}
                  {r.related.matchId && (
                    <button onClick={() => open(r.related!.matchId!)} className="ml-1.5 text-[10.5px] text-text-2 underline-offset-2 hover:text-a hover:underline">
                      Open pair
                    </button>
                  )}
                  {r.related.evidence.map((c) => (
                    <Quote key={`${c.sourceId}-${c.page}`} c={c} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SponsorExports() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  if (!run) return <p className="text-[12px] text-text-3">Run the comparison to export the region on screen.</p>;
  const x = regionExports(run, region);
  const files = [
    [x.overlaps, "Overlap table", `sponsor format: ${pluralize(x.overlaps.rows, "pair")} under ${SPONSOR_RADIUS_MILES} mi, closest first`],
    [x.projects, "Project table", `sponsor format: ${pluralize(x.projects.rows, "project")}, centers and overlap_1…n`],
    [x.flagged, "All flagged pairs", `${pluralize(x.flagged.rows, "pair")} in priority order, with sponsor_rule and beyond_rule_reason`],
  ] as const;
  return (
    <div className="space-y-1.5">
      {files.map(([f, label, hint]) => (
        <div key={f.name} className="flex items-center gap-2 rounded-lg bg-bg-2 px-3 py-1.5 ring-1 ring-line">
          <span className="min-w-0 flex-1 text-[11.5px] leading-snug">
            <span className="text-text-0">{label}</span> <span className="text-text-3">· {hint}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => download(f.name, f.csv(), "text/csv")} aria-label={`Download ${label} CSV`}>
            <Download size={12} /> CSV
          </Button>
        </div>
      ))}
    </div>
  );
}

function LocationWorkflow({ region, where }: { region: string; where: string }) {
  const projects = useMemo(() => SNAPSHOT.projects.filter((p) => region === "all" || p.region === region), [region]);
  const n = useMemo(() => terminalCounts(projects), [projects]);
  const blanks = useMemo(() => starterBlanks(SNAPSHOT.projects), []);
  const names = useMemo(() => facilityNameSpread(SNAPSHOT.projects), []);
  const starterDupes = useMemo(() => starterNameSpread(), []);
  const pointsNamed = (name: string) => {
    const pls = SNAPSHOT.projects.flatMap((p) => p.places.filter((pl) => pl.precision === "named-facility" && facilityKey(pl.label) === facilityKey(name)));
    return { size: new Set(pls.map((pl) => `${pl.lat},${pl.lon}`)).size, label: pls.find((pl) => facilityKey(pl.label) === pl.label.toLowerCase())?.label ?? pls[0]?.label ?? name };
  };
  const found = blanks.filter((b) => b.found);
  const missing = blanks.filter((b) => !b.found);
  return (
    <div>
      <ul className="space-y-2 text-[12.5px] leading-[1.55] text-text-1">
        <Rule k="1 · Find">
          Terminal names are matched to OpenStreetMap power features (an Overpass export of SC and GA that includes features with no operator tag, then matched by name and line
          topology) and Nominatim, as the guide suggests.
        </Rule>
        <Rule k="2 · Confirm">
          Each match is checked against the plan&apos;s own wording; a match that cannot be confirmed is lower-confidence, as the guide says. {where}, the points behind project
          centers: <b className="font-medium text-text-0">{n.confirmed}</b> named facilities confirmed, <b className="font-medium text-text-0">{n.lowerConfidence}</b> named but
          lower-confidence, <b className="font-medium text-text-0">{n.townLevel}</b> town-level. Both weaker kinds cost 5 ranking points, and a center resting only on town-level
          points is never better than “possible.”
          {blanks.length > 0 &&
            ` Of the starter file's sub-points without coordinates, we located ${found.map((b) => `${b.found!.label}${b.found!.lowerConfidence ? " (lower-confidence)" : ""}`).join(" and ") || "none"}${missing.length ? `; ${missing.map((b) => b.name.replace(/ Sub$/, "")).join(", ")} ${missing.length === 1 ? "is" : "are"} not located` : ""}.`}
        </Rule>
        <Rule k="3 · Measure">
          Center = midpoint of the two points (the starter file&apos;s <Code>IF(ISBLANK…)</Code> formula), haversine distance between centers, and days between in-service dates;
          the worked example above checks both tables.
        </Rule>
      </ul>
      <div className="mt-3 rounded-lg bg-bg-2 px-3 py-2 text-[11.5px] leading-snug text-text-1 ring-1 ring-line">
        <div className="flex items-center gap-1.5 text-text-0">
          {names.spread.every((s) => GOSHEN_KEYS.has(s.key)) ? <CheckCircle2 size={12} className="text-known" /> : <XCircle size={12} className="text-danger" />}
          One facility name, one location (live audit)
        </div>
        <p className="mt-1">
          {names.names} facility names across all regions; each resolves to one location (within {names.toleranceMiles} mi, the engine&apos;s same-site tolerance)
          {names.spread.length ? ", except:" : "."}
        </p>
        {names.spread.map((s) => (
          <div key={s.key} className="mt-1.5">
            <b className="font-medium capitalize text-text-0">{s.key}</b> ({s.miles.toFixed(1)} mi apart, {s.points.map((x) => IDX.project(x.projectId)?.shortTitle ?? x.projectId).join("; ")}):{" "}
            {GOSHEN_KEYS.has(s.key) ? (
              <>
                two different Georgia Power substations, the Savannah-area “Goshen (SAV)” and the Goshen on the Goshen – Vogtle corridor. They are kept apart and never treated as one
                site.
                {CONTEXT.filter((c) => c.topic === "goshen").map((c) => (
                  <Quote key={c.page} c={c} />
                ))}
              </>
            ) : (
              <span className="text-danger">unexplained — check the geocodes.</span>
            )}
          </div>
        ))}
        {starterDupes.map((d) => {
          const ours = pointsNamed(d.name);
          return (
            <p key={d.name} className="mt-1.5 text-text-2">
              Starter file: “{d.name}” has two coordinates {d.miles.toFixed(2)} mi apart ({d.ids.join(", ")}); our snapshot uses{" "}
              {ours.size === 1 ? `one point for every ${ours.label} terminal` : `${ours.size} points for ${ours.label}`}.
            </p>
          );
        })}
      </div>
    </div>
  );
}
const GOSHEN_KEYS = new Set(["goshen"]);

function ChallengeContext() {
  const cites = (topic: string) => CONTEXT.filter((c) => c.topic === topic).map((c) => <Quote key={`${c.sourceId}-${c.page}-${c.excerpt.slice(0, 12)}`} c={c} />);
  const ceii = useMemo(() => Object.values(SNAPSHOT.evidence).filter((e) => /\bCEII\b|critical energy infrastructure/i.test(e.exactExcerpt)).length, []);
  const total = Object.keys(SNAPSHOT.evidence).length;
  const search = SEARCHES.find((s) => s.term);
  const q2 = CONTEXT_SOURCES["sertp-2026-q2-prelim"];
  const gpc = PACKET.find((f) => f.sourceId === "gpc-irp-2025-vol3" && IDX.source(f.sourceId)?.sha256 === f.sha256);
  return (
    <ul className="space-y-3 text-[12.5px] leading-[1.55] text-text-1">
      <Rule k="Order 1920">
        FERC&apos;s 2024 final rule on regional transmission planning and cost allocation, effective August 12, 2024. Each transmission provider must include in its in-kind replacement
        estimates the facilities it owns at or above 200 kV (or a lower proposed threshold) that it expects to replace.
        {cites("order-1920")}
      </Rule>
      <Rule k="SCRTP → SERTP">
        Dominion Energy South Carolina and Santee Cooper plan to join SERTP, effective with DESC&apos;s Order 1920 compliance filing.
        {cites("sertp-join")}
      </Rule>
      <Rule k="Newest source">
        The challenge asks teams to check for a newer SCRTP source. On {formatDate(CONTEXT_SOURCES["scrtp-home"].retrievedAt)} the SCRTP home page linked one planned-facilities list,
        the 2026–2030 edition, which is our current DESC source (the 2025–2029 and 2024–2028 editions are kept as version history). SERTP has not taken over DESC&apos;s list yet (our
        reading): {search && `a text search of its ${formatDate(q2.publishedAt ?? undefined)} preliminary expansion plan (${q2.pageCount} pages) finds ${search.hits === 0 ? "no" : search.hits} “${search.term}”, and`} its
        September 2026 meeting still lists SCRTP as a neighboring region.
        {cites("newest")}
      </Rule>
      <Rule k="CEII">
        Only public editions are used. SERTP&apos;s regional plan is published without CEII. Georgia Power&apos;s Ten-Year Plan is the public-disclosure file from Georgia PSC Docket
        56002{gpc ? ", byte-identical to the copy in the challenge packet" : ""}; its pages still carry a CEII banner, fields marked REDACTED stay redacted, and only short excerpts are
        stored. Live check: <b className={clsx("font-medium", ceii ? "text-danger" : "text-text-0")}>{ceii}</b> of {total.toLocaleString("en-US")} stored excerpts quote CEII-marked
        text.
        {cites("ceii")}
      </Rule>
    </ul>
  );
}
