"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bot, CheckCircle2, CircleDashed, Search, X, XCircle } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/focus";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { SourceDocument } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { ENGINE_VERSION, IN_SERVICE_HORIZON_DAYS } from "@/lib/matching/engine";
import { readableNote, regionPairCounts } from "@/lib/selectors";
import { sponsorCheck } from "@/lib/sponsor";
import { useAtlas } from "@/lib/store";
import { SourceRow } from "./Evidence";
import { ReviewExports } from "./Review";
import { IconButton } from "./ui";

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
  return (
    <Drawer open={open} onClose={() => set({ methodOpen: false })} eyebrow="How it works" title="Method & audit" width={600}>
      <Pipeline />

      <H>Matching rules</H>
      <ul className="space-y-2 text-[12.5px] leading-[1.55] text-text-1">
        <Rule k="Eligible">
          Distinct work packages in the same region whose owner sets do not overlap, with status proposed, approved or under construction. Completed, cancelled and duplicate records are
          archived.
        </Rule>
        <Rule k="Place first">
          Following the sponsor&apos;s method, each project&apos;s center is the midpoint of its two named sub-points (or the one located point); a pair counts when centers are within the
          review radius (default 25 mi). With location uncertainty: <Code>d_low = max(0, d − e_A − e_B)</Code>, <Code>d_high = d + e_A + e_B</Code> — confirmed if{" "}
          <Code>d_high ≤ 25</Code>, possible if only <Code>d_low ≤ 25</Code>. A shared facility stated in a source (or implied by several sources, flagged as such), or terminals geocoded to the same substation, confirm place regardless of
          line length. County-only evidence is never better than “possible.” Schematic route traces are never measured.
        </Rule>
        <Rule k="Then time">
          Construction windows are compared for every source combination (confirmed when <Code>max(S_latest) ≤ min(E_earliest)</Code>). No window is invented from an in-service
          date alone: when a source gives only a start and a “by”/need date, those dates are kept as bounds with the field work undated, and DESC&apos;s yearly budget gives a coarse
          window — both can support at most a “possible” overlap. The in-service gap in days (the sponsor&apos;s secondary signal) informs ranking; missing windows stay “unknown.”
        </Rule>
        <Rule k="Status">
          Documented joint work, tie lines or interface coordination file a pair under <i>Known coordination</i>. Anything else within the radius is <i>Needs review</i> — which means the
          reviewed sources are silent, never that the utilities are uncoordinated.
        </Rule>
        <Rule k="Rank">
          Explainable ordering, not a probability: shared facility or closer centers first (up to 60 pts), then schedule (window overlap, or in-service gap within {IN_SERVICE_HORIZON_DAYS / 365}{" "}
          years, up to 30), then evidence completeness (up to 10); lower-confidence locations lose 5.
        </Rule>
      </ul>

      <H>Sponsor worked example (live)</H>
      <SponsorExample />

      <H>Corpus checks (live)</H>
      <CorpusChecks />

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
                <span className="mono mr-1.5 text-[10px] uppercase text-text-3">{u.cluster}</span>
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
        expect: "conflict shown, TIME unaffected",
        ok: m ? m.conflicts.some((c) => c.projectId === "xcel-wwtc" && c.field === "completion" && !c.affectsMatch) : null,
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
          Every excerpt is then re-found verbatim by script. The Gemini structured-extraction job (<code className="mono text-[11px]">npm run extract:gemini</code>) records model,
          prompt version and span checks here when run with an API key.
        </p>
      </div>
    );
  return (
    <div className="space-y-2">
      {runs.map((r) => (
        <div key={r.id} className="rounded-xl bg-bg-2 p-3 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <Bot size={14} className={r.status === "completed" ? "text-known" : "text-text-3"} />
            <span className="text-[12.5px] font-medium text-text-0">{IDX.source(r.sourceId)?.title ?? r.sourceId}</span>
            <span className={clsx("mono ml-auto rounded px-1.5 text-[10px] uppercase", r.status === "completed" ? "bg-known/10 text-known" : "bg-bg-3 text-text-3")}>{r.status}</span>
          </div>
          <div className="mono mt-1 text-[10.5px] text-text-3">
            {r.model} · prompt {r.promptVersion}
            {r.runAt && ` · ${formatDate(r.runAt)}`}
          </div>
          {r.note && <p className="mt-1.5 text-[11.5px] leading-snug text-text-2">{r.note}</p>}
          {r.fields.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-line">
              {r.fields.map((f) => (
                <div key={f.field} className="grid grid-cols-[110px_1fr_auto] gap-2 border-b border-line px-2.5 py-1.5 text-[11px] last:border-b-0">
                  <span className="mono text-text-3">{f.field}</span>
                  <span className="truncate text-text-1" title={f.value}>
                    {f.value}
                  </span>
                  <span className={f.located ? "text-known" : "text-conflict"}>{f.located ? "span found" : "span missing"}</span>
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
  return (
    <div>
      <p className="mb-2 text-[12px] leading-snug text-text-2">
        The engine re-runs on the ten projects in Sperry&apos;s starter file (their coordinates and in-service dates) and must reproduce the sponsor&apos;s overlap table.
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
        {r.allOk ? "All rows match the sponsor's table (±0.01 mi, exact days) and no extra pairs are flagged." : `Mismatch: ${r.extra.length} extra pair(s).`}
      </p>
    </div>
  );
}
