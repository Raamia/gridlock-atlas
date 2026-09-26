"use client";

/**
 * The content of Method & audit, one component per TOC entry. All of it is computed live from the snapshot, the run on
 * screen and the committed eval report; every string the tests or the honesty contract rely on is kept verbatim
 * ("All rows match the sponsor's table", "Labels CSV", "review-log.json", "Turn on reviewer mode", "N pair labeled",
 * "N excerpt human-checked", "no longer listed", "never that the utilities are uncoordinated" …).
 */

import clsx from "clsx";
import { ArrowRight, Bot, CheckCircle2, CircleDashed, ClipboardCheck, Download, XCircle } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import EVAL from "@/data/eval/eval.json";
import XEVAL from "@/data/eval/extraction-eval.json";
import { IDX, SNAPSHOT } from "@/lib/data";
import { regionExports } from "@/lib/export";
import { formatDate, pluralize } from "@/lib/format";
import { IN_SERVICE_HORIZON_DAYS, PAST_DUE_PENALTY, runMatching } from "@/lib/matching/engine";
import { MIN_SCHEDULE_OVERLAP_DAYS } from "@/lib/matching/time";
import { download, labelsCsv, useReview } from "@/lib/review";
import { readableNote, regionPairCounts } from "@/lib/selectors";
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
} from "@/lib/sponsor";
import { useAtlas } from "@/lib/store";
import { Button, Stat, Tag } from "../ui";
import { B, Code, Prose, Quote, Rule, Rules, SubHead, TD_ROW, TH_ROW, Well } from "./bits";

const n = (v: number) => v.toLocaleString("en-US");
/** Sperry's worked example is the Savannah River (DESC × Georgia Power) region: the store's default region. */
const SPONSOR_REGION = SNAPSHOT.regions[0]?.id ?? "all";
const regionLabel = (id: string) => SNAPSHOT.regions.find((r) => r.id === id)?.label ?? "All regions";
const TAB_LABEL = { "needs-review": "Needs review", "known-coordination": "Known coordination", possible: "Possible" } as const;
/** "gpt-5.5-2026-04-23" → "GPT-5.5" */
const modelName = (id: string) => id.replace(/^gpt-(\d+(?:\.\d+)?).*$/i, "GPT-$1");
/** Stored excerpts quoting CEII-marked text (live check; the snapshot is static, so once per load). */
const CEII = Object.values(SNAPSHOT.evidence).filter((e) => /\bCEII\b|critical energy infrastructure/i.test(e.exactExcerpt)).length;
const EXCERPTS = Object.keys(SNAPSHOT.evidence).length;

/** One status line: a 14px icon, then prose. */
function Line({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-start gap-2 text-ui text-fg-2", className)}>
      <span className="mt-[2px] shrink-0 [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
    </div>
  );
}
const OK = <CheckCircle2 strokeWidth={1.75} className="text-ok" aria-label="Pass" />;
const NO = <XCircle strokeWidth={1.75} className="text-warn" aria-label="Fail" />;
const OPEN = <CircleDashed strokeWidth={1.75} className="text-fg-3" aria-hidden />;

/* ───────────────────────────────────────────── 01 Proof at a glance ───────────────────────────────────────────── */

export function ProofAtAGlance() {
  const run = useAtlas((s) => s.run);
  const check = useMemo(() => sponsorCheck(), []);
  const sheet = useMemo(() => sponsorSheetCheck(), []);
  const ceii = CEII;
  const q = EVAL.queue;
  const naive = EVAL.baselines.find((b) => b.id === "B3");
  const current = EVAL.meta.snapshot === SNAPSHOT.version;
  const x = XEVAL;
  const model = modelName(Object.keys(x.models)[0] ?? "model");
  const okRows = check.rows.filter((r) => r.ok).length;
  const sheetOk = sheet.filter((r) => r.ok).length;
  const bad = check.rows.length - okRows;
  const same = PACKET.filter((f) => IDX.source(f.sourceId)?.sha256 === f.sha256);

  // Sperry-format downloads always use Sperry's region and 25 mi rule; without a 25 mi run on screen the engine runs here
  const sponsorRun = () => (run && run.thresholdMiles === SPONSOR_RADIUS_MILES ? run : runMatching(SNAPSHOT, { thresholdMiles: SPONSOR_RADIUS_MILES }));
  const overlapRows = run && run.thresholdMiles === SPONSOR_RADIUS_MILES ? regionExports(run, SPONSOR_REGION).overlaps.rows : current ? q.withinSponsorRule : undefined;
  const projectRows = SNAPSHOT.projects.filter((p) => SPONSOR_REGION === "all" || p.region === SPONSOR_REGION).length;
  const save = (kind: "overlaps" | "projects") => {
    const f = regionExports(sponsorRun(), SPONSOR_REGION)[kind];
    download(f.name, f.csv(), "text/csv");
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          size="lg"
          label="Sperry's example"
          tone={check.allOk ? "ok" : "warn"}
          value={`${okRows}/${check.rows.length}`}
          sub={`overlap rows · ${sheetOk}/${sheet.length} project rows · ${check.extra.length} extra`}
        />
        <Stat
          size="lg"
          label="Flagged"
          value={`${q.flagged.pct}%`}
          sub={`${n(q.flagged.k)} of ${n(q.flagged.n)}${naive ? ` vs ${n(naive.flagged)} (${((naive.flagged / q.flagged.n) * 100).toFixed(1)}%) naive` : ""}`}
        />
        <Stat size="lg" label="Verbatim quotes" value={n(x.verbatimQuote.all.k)} sub={`of ${n(x.verbatimQuote.all.n)} ${model} quotes · ${n(x.pagesScored)} pages`} />
        <Stat size="lg" label="CEII excerpts" tone={ceii ? "warn" : "default"} value={ceii} sub={`of ${n(EXCERPTS)} stored`} />
      </div>

      <SubHead meta="live" className="mt-7">
        Sperry&apos;s worked example
      </SubHead>
      <p className="mb-3 max-w-[68ch] text-ui text-pretty text-fg-2">
        The engine re-runs on the ten projects in Sperry&apos;s starter file (their coordinates and in-service dates) and must reproduce both of the guide&apos;s tables.
      </p>
      <div role="table" aria-label="Sperry's overlap table, reproduced">
        <div role="row" className={clsx(TH_ROW, "grid-cols-[48px_minmax(0,1fr)_60px_60px_16px] sm:grid-cols-[56px_minmax(0,1fr)_72px_72px_72px_72px_16px]")}>
          <span role="columnheader">Row</span>
          <span role="columnheader">Pair</span>
          <span role="columnheader" className="hidden text-right sm:block">
            Sperry mi
          </span>
          <span role="columnheader" className="text-right">
            <span className="hidden sm:inline">Engine </span>mi
          </span>
          <span role="columnheader" className="hidden text-right sm:block">
            Sperry d
          </span>
          <span role="columnheader" className="text-right">
            <span className="hidden sm:inline">Engine d</span>
            <span className="sm:hidden">Days</span>
          </span>
          <span role="columnheader" aria-label="Match" />
        </div>
        {check.rows.map((row) => (
          <div role="row" key={row.id} className={clsx(TD_ROW, "grid-cols-[48px_minmax(0,1fr)_60px_60px_16px] sm:grid-cols-[56px_minmax(0,1fr)_72px_72px_72px_72px_16px]")}>
            <span role="cell" className="num text-caption text-fg-3">
              {row.id}
            </span>
            <span role="cell" className="num min-w-0 truncate text-caption text-fg-2">
              {row.pair}
            </span>
            <span role="cell" className="num hidden text-right text-fg-3 sm:block">
              {row.sponsorMiles.toFixed(2)}
            </span>
            <span role="cell" className="num text-right text-fg-1" title={`Sperry ${row.sponsorMiles}`}>
              {row.ourMiles?.toFixed(2) ?? "—"}
            </span>
            <span role="cell" className="num hidden text-right text-fg-3 sm:block">
              {n(row.sponsorDays)}
            </span>
            <span role="cell" className="num text-right text-fg-1" title={`Sperry ${row.sponsorDays}`}>
              {row.ourDays === null ? "—" : n(row.ourDays)}
            </span>
            <span role="cell" className="grid place-items-center [&_svg]:size-3.5">
              {row.ok ? OK : NO}
            </span>
          </div>
        ))}
      </div>
      <Line icon={check.allOk ? OK : NO} className="mt-4 text-fg-1">
        {check.allOk
          ? "All rows match the sponsor's table (±0.01 mi, exact days) and no extra pairs are flagged."
          : `Overlap table mismatch: ${bad} row(s) differ, ${check.extra.length} extra pair(s).`}
        <span className="mt-1 block text-caption text-fg-3">
          {sheet.every((x) => x.ok)
            ? `Project table: centers (the starter file's midpoint formula), overlap_count and overlap_1…3 match for all ${sheet.length} projects.`
            : `Project table mismatch: ${sheet
                .filter((x) => !x.ok)
                .map((x) => x.id)
                .join(", ")}.`}
          {same.length > 0 && ` The packet's ${same.length === 2 ? "two" : same.length} plan PDFs are byte-identical (SHA-256) to our cached ${same.map((f) => f.label).join(" and ")}.`}
        </span>
      </Line>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" size="md" icon={<Download size={14} strokeWidth={1.75} />} onClick={() => save("overlaps")}>
          Download overlap table (Sperry format)
          {overlapRows !== undefined && <span className="num font-normal text-fg-3">· {n(overlapRows)} rows</span>}
        </Button>
        <Button variant="secondary" size="md" icon={<Download size={14} strokeWidth={1.75} />} onClick={() => save("projects")}>
          Download project table (Sperry format)
          <span className="num font-normal text-fg-3">· {n(projectRows)} projects</span>
        </Button>
      </div>
      <p className="mt-2.5 max-w-[80ch] text-caption text-pretty text-fg-3">
        {regionLabel(SPONSOR_REGION)} at Sperry&apos;s {SPONSOR_RADIUS_MILES} mi rule, whatever the radius or filters on screen; the starter file&apos;s columns come first. Sperry&apos;s
        example re-runs live in this browser; the flag rate and the extraction cross-check come from the committed <Code>npm run eval</Code> report
        {current ? ` for this snapshot (${EVAL.meta.snapshot})` : ` for ${EVAL.meta.snapshot} — this app runs ${SNAPSHOT.version}`}, where the naive rule flags a pair that is close OR on
        a similar schedule.
      </p>
    </>
  );
}

/* ─────────────────────────────────────────── 02 Sperry's six rows today ─────────────────────────────────────────── */

const edition = (sourceId: string) => sourceId.match(/(\d{4})-(\d{4})$/)?.slice(1).join("–").concat(" list") ?? sourceId;
/** "the 2025–2029 and 2026–2030 lists" */
const editions = (ids: string[]) => (ids.length === 1 ? edition(ids[0]) : `${ids.map((id) => edition(id).replace(/ list$/, "")).join(" and ")} lists`);

export function SponsorRowsToday() {
  const run = useAtlas((s) => s.run);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const rows = useMemo(() => sponsorReplay(run, SNAPSHOT), [run]);
  const open = (id: string) => {
    set({ methodOpen: false });
    select(id);
  };
  const regionOf = (id: string) => SNAPSHOT.regions.find((r) => r.id === IDX.project(id)?.region)?.label.split(" · ")[0];
  const days = (d?: number, atLeast?: boolean) => (d === undefined ? "no gap" : `${atLeast && d > 0 ? "≥" : ""}${n(d)} d`);
  const inQueue = rows.filter((r) => r.status === "in-queue").sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const gone = rows.filter((r) => r.a.notListed || r.b.notListed);

  return (
    <>
      <Well className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-ui text-fg-2">
        {run ? (
          <span>
            <B>{inQueue.length}</B> of {rows.length} rows in today&apos;s queue
            {inQueue[0] && (
              <>
                {" "}
                — <B>{inQueue[0].id}</B> is <B>#{inQueue[0].rank}</B>
              </>
            )}
          </span>
        ) : (
          <span>Run the comparison to place these rows in today&apos;s queue.</span>
        )}
        <span>
          <B>{gone.length}</B> involve a project that is no longer listed
        </span>
      </Well>
      <ol className="divide-y divide-divider">
        {rows.map((r) => {
          const lost = [r.a, r.b].filter((s) => s.notListed);
          return (
            <li key={r.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 py-4 first:pt-0">
              <span className="pt-px">
                <Tag mono tone={r.status === "in-queue" ? "neutral" : "muted"}>
                  {r.id}
                </Tag>
              </span>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="text-ui font-medium text-fg-1">
                    {r.a.name} × {r.b.name}
                  </span>
                  <span className="num text-caption text-fg-3" title="Sperry's starter table">
                    Sperry {r.sponsorMiles.toFixed(2)} mi · {n(r.sponsorDays)} d
                  </span>
                </div>
                {r.status === "in-queue" && (
                  <Line icon={OK}>
                    <span>
                      In our queue: <B>#{r.rank}</B> · {TAB_LABEL[r.tab ?? "possible"]} · {regionOf(r.matchId!.split("__")[0])} — today{" "}
                      <span className="num">{r.miles?.toFixed(2)} mi</span> · <span className="num">{days(r.days, r.daysAtLeast)}</span> on current plan dates.
                      {r.pastDue && ` Kept although a planned date has passed — ${r.pastDue.join(" ")}`}
                    </span>
                    <Button variant="ghost" size="sm" className="ml-1 -my-1 text-fg-1" iconRight={<ArrowRight size={13} strokeWidth={1.75} />} onClick={() => open(r.matchId!)}>
                      Open pair
                    </Button>
                  </Line>
                )}
                {r.status === "hidden" && (
                  <Line icon={OPEN}>
                    Both projects are still listed, but the pair is not in the queue — {r.reasons!.join(" ")}
                    {r.miles !== undefined && ` Today: ${r.miles.toFixed(2)} mi · ${days(r.days, r.daysAtLeast)}.`}
                  </Line>
                )}
                {r.status === "not-run" && <Line icon={OPEN}>Run the comparison to see this pair&apos;s status.</Line>}
                {lost.map((s) => (
                  <Line key={s.sponsorId} icon={OPEN}>
                    {s.sponsorId} (DESC project {s.notListed!.planId}) is no longer listed in the 2026–2030 list. It was last listed in the {edition(s.notListed!.lastListed.sourceId)}, p.{" "}
                    {s.notListed!.lastListed.page}; a text search of the {editions(s.notListed!.absentFrom)} finds no Project ID {s.notListed!.planId}. No source we reviewed says
                    it was completed.
                    <Quote c={s.notListed!.lastListed} />
                  </Line>
                ))}
                {r.related && (
                  <div className="ml-[22px] border-t border-divider pt-2.5 text-ui text-fg-2">
                    Related (same corridor name, different Project ID): DESC&apos;s next listing, 6809 G, is still listed, now as {IDX.project(r.related.pair[0])?.title ?? r.related.pair[0]}.
                    {r.related.matchId
                      ? ` Its pair with ${r.b.sponsorId} is #${r.related.rank} · ${TAB_LABEL[r.related.tab ?? "possible"]} (${r.related.miles?.toFixed(2)} mi).`
                      : ` Its pair with ${r.b.sponsorId} is not flagged in this run.`}
                    {r.related.matchId && (
                      <Button variant="ghost" size="sm" className="ml-1 -my-1 text-fg-1" iconRight={<ArrowRight size={13} strokeWidth={1.75} />} onClick={() => open(r.related!.matchId!)}>
                        Open pair
                      </Button>
                    )}
                    {r.related.evidence.map((c) => (
                      <Quote key={`${c.sourceId}-${c.page}`} c={c} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ───────────────────────────────────────────── 03 Matching rules ───────────────────────────────────────────── */

function Pipeline() {
  const steps = ["Public URL", "Fetch + SHA-256", "Page text", "Structured extraction", "Verbatim span check", "Snapshot", "Deterministic engine", "Map · timeline · brief"];
  return (
    <ol aria-label="Pipeline" className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={clsx("inline-flex h-6 items-center rounded-chip px-2 text-caption", i === 6 ? "bg-fill-3 font-medium text-fg-1" : "bg-fill-1 text-fg-2")}>{s}</span>
          {i < steps.length - 1 && <ArrowRight aria-hidden size={12} strokeWidth={1.75} className="text-fg-4" />}
        </li>
      ))}
    </ol>
  );
}

export function MatchingRules() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const where = regionLabel(region);
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
      inside: ms.length - out.length,
      possible: ms.filter((m) => withinSponsorRule(m) && m.geo === "possible").length,
      beyond: out.length,
      beyondText: parts
        .filter(([k]) => k)
        .map(([k, t]) => `${k} ${t}`)
        .join(", "),
    };
  }, [run, region]);

  return (
    <>
      <Pipeline />
      <Rules>
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
              {where}: <B>{rule.inside}</B> {rule.inside === 1 ? "pair meets" : "pairs meet"} it
              {rule.possible > 0 && ` (${rule.possible} only “possible” because a location is approximate)`}.
            </>
          )}{" "}
          Only these go into the sponsor-format overlap CSV, numbered OVL_1… by distance as in the starter file. With location uncertainty, <Code>d_low = max(0, d − e_A − e_B)</Code>,{" "}
          <Code>d_high = d + e_A + e_B</Code>: confirmed if <Code>d_high ≤ 25</Code>, possible if only <Code>d_low ≤ 25</Code>. Beyond Sperry&apos;s rule we also flag, with the reason
          stated in the “all flagged pairs” export: a shared facility stated in a source (or implied by several, flagged as such) or terminals geocoded to the same substation,
          whatever the line length; uncertainty that reaches inside the radius; county-level evidence (never better than “possible”)
          {rule && rule.beyond > 0 && ` — ${rule.beyond} here: ${rule.beyondText}`}. Schematic route traces are never measured.
        </Rule>
        <Rule k="Then time">
          Construction windows are compared for every source combination (confirmed when <Code>max(S_latest) ≤ min(E_earliest)</Code>). No window is invented from an in-service date
          alone: a start plus a “by”/need date is kept as bounds with the field work undated, and DESC&apos;s yearly budget gives a coarse window — both support at most a “possible”
          overlap. Published schedules are compared separately: Georgia Power&apos;s Start Date (the Ten-Year Plan&apos;s “schedule for implementation”) or DESC&apos;s first evidenced
          spending, to the current in-service date. When two schedules certainly overlap for at least {MIN_SCHEDULE_OVERLAP_DAYS} days, TIME is confirmed on a schedule basis
          (“Published schedules overlap (start → in-service) for N months; field-work dates are not published”) — never called a construction overlap; a construction-window result
          that confirms or rules out overlap takes precedence. If a plan&apos;s in-service date has passed without a source confirming completion, TIME is at most “possible”. The
          in-service gap in days (the sponsor&apos;s secondary signal) informs ranking; missing windows stay “unknown.”
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
          within-radius needs-review pair. The rank on each row (#01) is the pair&apos;s place in its region&apos;s unfiltered tab — the same number as the CSV&apos;s queue_rank.
        </Rule>
        <Rule k="Words">
          The screen speaks of place and time; the CSV exports keep the engine&apos;s codes. Place + time = <Code>BOTH</Code> (both signals confirmed) · place confirmed ={" "}
          <Code>GEO</Code> · place only possible = <Code>POSSIBLE</Code> (the Possible status). The <Code>geo_signal</Code> and <Code>time_signal</Code> columns read confirmed,
          possible, unknown or no-match: an amber filled pin or calendar on screen is “confirmed”, an outline one “possible”.
        </Rule>
      </Rules>
    </>
  );
}

/* ───────────────────────────────────────────────── 04 Exports ───────────────────────────────────────────────── */

export function SponsorExports() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  if (!run) return <Prose>Run the comparison to export the region on screen.</Prose>;
  const x = regionExports(run, region);
  const files = [
    [x.overlaps, "Overlap table", `sponsor format: ${pluralize(x.overlaps.rows, "pair")} under ${SPONSOR_RADIUS_MILES} mi, closest first`],
    [x.projects, "Project table", `sponsor format: ${pluralize(x.projects.rows, "project")}, centers and overlap_1…n`],
    [x.flagged, "All flagged pairs", `${pluralize(x.flagged.rows, "pair")} in priority order, with sponsor_rule and beyond_rule_reason`],
  ] as const;
  return (
    <>
      <ul className="divide-y divide-divider">
        {files.map(([f, label, hint]) => (
          <li key={f.name} className="flex items-center gap-4 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <div className="text-ui font-medium text-fg-1">{label}</div>
              <div className="mt-0.5 text-caption text-fg-3">
                {hint} · <span className="num whitespace-nowrap">{f.name}</span>
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={<Download size={14} strokeWidth={1.75} />} onClick={() => download(f.name, f.csv(), "text/csv")} aria-label={`Download ${label} CSV`}>
              CSV
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-fg-3">
        {regionLabel(region)} at the run&apos;s {run.thresholdMiles} mi radius, whole region (list filters not applied) — the same files as the results panel&apos;s Export menu.
      </p>
    </>
  );
}

/* ───────────────────────────────────────────── 05 Location workflow ───────────────────────────────────────────── */

const GOSHEN_KEYS = new Set(["goshen"]);

export function LocationWorkflow() {
  const region = useAtlas((s) => s.region);
  const where = regionLabel(region);
  const projects = useMemo(() => SNAPSHOT.projects.filter((p) => region === "all" || p.region === region), [region]);
  const t = useMemo(() => terminalCounts(projects), [projects]);
  const blanks = useMemo(() => starterBlanks(SNAPSHOT.projects), []);
  const names = useMemo(() => facilityNameSpread(SNAPSHOT.projects), []);
  const starterDupes = useMemo(() => starterNameSpread(), []);
  const pointsNamed = (name: string) => {
    const pls = SNAPSHOT.projects.flatMap((p) => p.places.filter((pl) => pl.precision === "named-facility" && facilityKey(pl.label) === facilityKey(name)));
    return { size: new Set(pls.map((pl) => `${pl.lat},${pl.lon}`)).size, label: pls.find((pl) => facilityKey(pl.label) === pl.label.toLowerCase())?.label ?? pls[0]?.label ?? name };
  };
  const found = blanks.filter((b) => b.found);
  const missing = blanks.filter((b) => !b.found);
  const clean = names.spread.every((s) => GOSHEN_KEYS.has(s.key));
  return (
    <>
      <Rules>
        <Rule k="1 · Find">
          Terminal names are matched to OpenStreetMap power features (an Overpass export of SC and GA that includes features with no operator tag, then matched by name and line
          topology) and Nominatim, as the guide suggests.
        </Rule>
        <Rule k="2 · Confirm">
          Each match is checked against the plan&apos;s own wording; a match that cannot be confirmed is lower-confidence, as the guide says. {where}, the points behind project centers:{" "}
          <B>{t.confirmed}</B> named facilities confirmed, <B>{t.lowerConfidence}</B> named but lower-confidence, <B>{t.townLevel}</B> town-level. Both weaker kinds cost 5 ranking
          points, and a center resting only on town-level points is never better than “possible.”
          {blanks.length > 0 &&
            ` Of the starter file's sub-points without coordinates, we located ${found.map((b) => `${b.found!.label}${b.found!.lowerConfidence ? " (lower-confidence)" : ""}`).join(" and ") || "none"}${missing.length ? `; ${missing.map((b) => b.name.replace(/ Sub$/, "")).join(", ")} ${missing.length === 1 ? "is" : "are"} not located` : ""}.`}
        </Rule>
        <Rule k="3 · Measure">
          Center = midpoint of the two points (the starter file&apos;s <Code>IF(ISBLANK…)</Code> formula), haversine distance between centers, and days between in-service dates; the
          worked example above checks both tables.
        </Rule>
      </Rules>
      <Well className="mt-5">
        <Line icon={clean ? OK : NO} className="font-medium text-fg-1">
          One facility name, one location (live audit)
        </Line>
        <p className="mt-1.5 text-ui text-pretty text-fg-2">
          {names.names} facility names across all regions; each resolves to one location (within {names.toleranceMiles} mi, the engine&apos;s same-site tolerance)
          {names.spread.length ? ", except:" : "."}
        </p>
        {names.spread.map((s) => (
          <div key={s.key} className="mt-2.5 text-ui text-pretty text-fg-2">
            <b className="font-medium text-fg-1 capitalize">{s.key}</b> ({s.miles.toFixed(1)} mi apart, {s.points.map((x) => IDX.project(x.projectId)?.shortTitle ?? x.projectId).join("; ")}):{" "}
            {GOSHEN_KEYS.has(s.key) ? (
              <>
                two different Georgia Power substations, the Savannah-area “Goshen (SAV)” and the Goshen on the Goshen – Vogtle corridor. They are kept apart and never treated as one
                site.
                {CONTEXT.filter((c) => c.topic === "goshen").map((c) => (
                  <Quote key={c.page} c={c} />
                ))}
              </>
            ) : (
              <span className="text-warn">unexplained — check the geocodes.</span>
            )}
          </div>
        ))}
        {starterDupes.map((d) => {
          const ours = pointsNamed(d.name);
          return (
            <p key={d.name} className="mt-2.5 text-ui text-pretty text-fg-2">
              Starter file: “{d.name}” has two coordinates {d.miles.toFixed(2)} mi apart ({d.ids.join(", ")}); our snapshot uses{" "}
              {ours.size === 1 ? `one point for every ${ours.label} terminal` : `${ours.size} points for ${ours.label}`}.
            </p>
          );
        })}
      </Well>
    </>
  );
}

/* ───────────────────────────────────────────────── 06 Context ───────────────────────────────────────────────── */

export function ChallengeContext() {
  const cites = (topic: string) => CONTEXT.filter((c) => c.topic === topic).map((c) => <Quote key={`${c.sourceId}-${c.page}-${c.excerpt.slice(0, 12)}`} c={c} />);
  const ceii = CEII;
  const search = SEARCHES.find((s) => s.term);
  const q2 = CONTEXT_SOURCES["sertp-2026-q2-prelim"];
  const gpc = PACKET.find((f) => f.sourceId === "gpc-irp-2025-vol3" && IDX.source(f.sourceId)?.sha256 === f.sha256);
  return (
    <Rules>
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
        The challenge asks teams to check for a newer SCRTP source. On {formatDate(CONTEXT_SOURCES["scrtp-home"].retrievedAt)} the SCRTP home page linked one planned-facilities list, the
        2026–2030 edition, which is our current DESC source (the 2025–2029 and 2024–2028 editions are kept as version history). SERTP has not taken over DESC&apos;s list yet (our
        reading):{" "}
        {search &&
          `a text search of its ${formatDate(q2.publishedAt ?? undefined)} preliminary expansion plan (${q2.pageCount} pages) finds ${search.hits === 0 ? "no" : search.hits} “${search.term}”, and`}{" "}
        its September 2026 meeting still lists SCRTP as a neighboring region.
        {cites("newest")}
      </Rule>
      <Rule k="CEII">
        Only public editions are used. SERTP&apos;s regional plan is published without CEII. Georgia Power&apos;s Ten-Year Plan is the public-disclosure file from Georgia PSC Docket
        56002{gpc ? ", byte-identical to the copy in the challenge packet" : ""}; its pages still carry a CEII banner, fields marked REDACTED stay redacted, and only short excerpts are
        stored. Live check: <b className={clsx("num font-medium", ceii ? "text-warn" : "text-fg-1")}>{ceii}</b> of {n(EXCERPTS)} stored excerpts quote CEII-marked text.
        {cites("ceii")}
      </Rule>
    </Rules>
  );
}

/* ─────────────────────────────────────────────── 07 Corpus checks ─────────────────────────────────────────────── */

export function CorpusChecks() {
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
  if (!run) return <Prose>Run the comparison to see live checks against the real corpus.</Prose>;
  return (
    <div role="table" aria-label="Corpus checks">
      <div role="row" className={clsx(TH_ROW, "grid-cols-[16px_minmax(0,1fr)_auto]")}>
        <span role="columnheader" aria-label="Result" />
        <span role="columnheader">Check · expected</span>
        <span role="columnheader" className="text-right">
          Engine
        </span>
      </div>
      {checks.map((c) => (
        <div role="row" key={c.label} className={clsx(TD_ROW, "grid-cols-[16px_minmax(0,1fr)_auto] items-start")}>
          <span role="cell" className="pt-[2px] [&_svg]:size-3.5">
            {c.ok === null ? OPEN : c.ok ? OK : NO}
          </span>
          <span role="cell" className="min-w-0">
            <span className="block text-fg-1">{c.label}</span>
            <span className="block text-caption text-fg-3">expected: {c.expect}</span>
          </span>
          <span role="cell" className="num pt-px text-right text-caption text-fg-2">
            {c.got}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────── 08 Evaluation ───────────────────────────────────────────────── */

const BASELINES: [string, string][] = [
  ["B1", "Same county + same in-service year"],
  ["B2", "Centers under 25 mi (Sperry's rule alone)"],
  ["B3", "Close OR on a similar schedule"],
  ["B5", "Under 25 mi AND a similar schedule"],
  ["B6", "Same facility name in both plans"],
  ["B4", "GridLock engine"],
];

/** The committed `npm run eval` report (data/eval), with its snapshot shown: it is not recomputed in the browser. */
export function Evaluation() {
  const e = EVAL;
  const recall = e.interfaces.recall as Record<string, { all: { hit: number; of: number } }>;
  const frac = (id: string) => `${recall[id]?.all.hit ?? "–"}/${e.interfaces.inUniverse}`;
  const nc = e.negativeControls;
  const noSite = e.ablations.find((a) => a.id === "A3b");
  const steady = e.sweep.filter((s, i) => e.sweep.slice(i).every((t) => t.topLeadRank === 1));
  const x = XEVAL;
  const need = x.fields["gpc.inServiceDate"];
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  const COLS = "grid-cols-[minmax(0,1fr)_56px_76px] sm:grid-cols-[minmax(0,1fr)_64px_76px_88px]";
  return (
    <>
      <Prose className="mb-5">
        No human labels. “Documented interfaces” are the {e.interfaces.inUniverse} cross-utility links the filings state or imply (none in the Savannah River region); the engine&apos;s
        shared-facility rule reads the same statements, so its score there is a design check, not accuracy
        {noSite && ` (without that rule it keeps ${noSite.recall.all.hit}/${noSite.recall.all.of})`}. Unflagged pairs are not labeled negatives, so no precision is claimed.
        {e.meta.snapshot === SNAPSHOT.version
          ? ` Committed report for this snapshot (${e.meta.snapshot}, ${e.meta.engine}, ${e.meta.radiusMiles} mi).`
          : ` Computed on ${e.meta.snapshot}; this app runs ${SNAPSHOT.version} — re-run npm run eval.`}
      </Prose>
      <div role="table" aria-label="Baselines">
        <div role="row" className={clsx(TH_ROW, COLS)}>
          <span role="columnheader">Method · {n(e.queue.universePairs)} pairs</span>
          <span role="columnheader" className="text-right">
            Flagged
          </span>
          <span role="columnheader" className="hidden text-right sm:block">
            DESC×GPC
          </span>
          <span role="columnheader" className="text-right">
            Interfaces
          </span>
        </div>
        {BASELINES.map(([id, label]) => {
          const b = e.baselines.find((y) => y.id === id);
          if (!b) return null;
          const ours = id === "B4";
          return (
            <div role="row" key={id} className={clsx(TD_ROW, COLS, ours && "-mx-2 rounded-control border-b-0 bg-fill-2 px-2")}>
              <span role="cell" className={clsx("min-w-0", ours ? "font-medium text-fg-1" : "text-fg-2")}>
                <span className="num mr-2 text-caption text-fg-3">{id}</span>
                {label}
              </span>
              <span role="cell" className="num text-right text-fg-1">
                {n(b.flagged)}
              </span>
              <span role="cell" className="num hidden text-right text-fg-1 sm:block">
                {n(b.descGpc)}
              </span>
              <span role="cell" className="num text-right text-fg-1">
                {frac(id)}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="mt-5 space-y-2.5">
        {[
          <>
            Sperry&apos;s example: overlap table {e.sponsor.overlapTable.matched}/{e.sponsor.overlapTable.of} rows exact, 0 extra pairs at every radius up to{" "}
            {Math.max(...nc.starterFile.byRadius.filter((r) => r.extra === 0).map((r) => r.R))} mi; project table {e.sponsor.projectSheet.matched}/{e.sponsor.projectSheet.of}.
          </>,
          <>
            Negative controls: {nc.archived.B4} of {nc.archived.pairs} pairs with a completed project flagged; {nc.pastDue.B4timeConfirmed} of {nc.pastDue.B4flagged} flagged past-due
            pairs with TIME confirmed; {nc.far.B4notSharedFacility} pairs over 50 mi without a shared facility; {nc.crossRegion.B4} across regions.
          </>,
          steady.length > 0 ? (
            <>
              The top Savannah River lead is #1 at every radius from {steady[0].R} to {steady[steady.length - 1].R} mi.
            </>
          ) : null,
          <>
            Extraction cross-check: {Object.keys(x.models).join(", ")} re-read {x.pagesScored} plan pages. {n(x.verbatimQuote.all.k)} of {n(x.verbatimQuote.all.n)} quoted fields are
            verbatim on the page; where model and parser both give a value they agree {pct(x.overall.exact.rate)} ({n(x.overall.exact.k)}/{n(x.overall.exact.n)}). That is agreement
            with our parser, not accuracy; the model leaves Georgia Power&apos;s Need Date out on {need.counts.missed} of {need.stated} pages.
          </>,
        ]
          .filter(Boolean)
          .map((item, i) => (
            <li key={i} className="flex gap-3 text-body text-pretty text-fg-2">
              <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-4" />
              <span className="min-w-0 max-w-[68ch]">{item}</span>
            </li>
          ))}
      </ul>
    </>
  );
}

/* ──────────────────────────────────────────── 09 What the engine excluded ──────────────────────────────────────────── */

export function Excluded() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const regionCounts = useMemo(() => (run && region !== "all" ? regionPairCounts(run, SNAPSHOT.projects, region) : null), [run, region]);
  if (!run) return <Prose>Run the comparison to see what the engine excluded in {regionLabel(region)}.</Prose>;
  const inRegion = (id: string) => region === "all" || IDX.project(id)?.region === region;
  const excludedProjects = run.excludedProjects.filter((x) => inRegion(x.projectId));
  const sharedOwner = run.excludedPairs.filter((p) => p.reason === "shared-owner" && inRegion(p.projectAId));
  const regionName = SNAPSHOT.regions.find((r) => r.id === region)?.label;
  const ROW = "grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-divider py-2.5 last:border-b-0";
  return (
    <>
      <div>
        {excludedProjects.map((x) => (
          <div key={x.projectId} className={ROW}>
            <span className="pt-px">
              <Tag mono tone="muted">
                {x.reason}
              </Tag>
            </span>
            <span className="min-w-0">
              <span className="block text-ui text-fg-1">{IDX.project(x.projectId)?.title}</span>
              <span className="mt-0.5 block text-caption text-fg-3">{x.detail}</span>
            </span>
          </div>
        ))}
        {sharedOwner.slice(0, 8).map((p) => (
          <div key={`${p.projectAId}-${p.projectBId}`} className={ROW}>
            <span className="pt-px">
              <Tag mono tone="muted">
                shared owner
              </Tag>
            </span>
            <span className="min-w-0">
              <span className="block text-ui text-fg-1">
                {IDX.project(p.projectAId)?.shortTitle} × {IDX.project(p.projectBId)?.shortTitle}
              </span>
              <span className="mt-0.5 block text-caption text-fg-3">{p.detail}</span>
            </span>
          </div>
        ))}
      </div>
      {regionCounts && (
        <p className="mt-4 text-ui text-pretty text-fg-2">
          {regionName}: <B>{n(regionCounts.beyond)}</B> {regionCounts.beyond === 1 ? "pair" : "pairs"} not flagged (farther than {run.thresholdMiles} mi, no shared facility) ·{" "}
          <B>{n(regionCounts.unlocated)}</B> with a location not yet established.
        </p>
      )}
      <p className="mt-2 text-caption text-pretty text-fg-3">
        Pair totals, all regions: {n(run.excludedCounts["shared-owner"])} shared-owner (internal context; {Math.min(8, sharedOwner.length)} nearby{" "}
        {regionCounts ? "ones in this region" : "ones"} shown) · {n(run.excludedCounts["beyond-radius"] + run.excludedCounts["no-signal"])} farther than {run.thresholdMiles} mi ·{" "}
        {n(run.excludedCounts["location-unknown"])} with a location not yet established · {n(run.excludedCounts["different-region"])} across regions.
      </p>
    </>
  );
}

/* ───────────────────────────────────────────────── 10 Reviewer mode ───────────────────────────────────────────────── */

export function ReviewerMode() {
  const labels = useReview((s) => s.labels);
  const checked = useReview((s) => s.checked);
  const enabled = useReview((s) => s.enabled);
  const toggle = useReview((s) => s.toggle);
  const clear = useReview((s) => s.clear);
  const pairs = Object.keys(labels).length;
  const checks = Object.keys(checked).length;
  const meta = (id: string) => {
    const [a, b] = id.split("__");
    return { project_a: IDX.project(a)?.title ?? a, project_b: IDX.project(b)?.title ?? b };
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-fg-2">
          <B>{pairs}</B> {pairs === 1 ? "pair" : "pairs"} labeled · <B>{checks}</B> {checks === 1 ? "excerpt" : "excerpts"} human-checked
        </p>
        <Button size="sm" variant="secondary" icon={<ClipboardCheck size={14} strokeWidth={1.75} className={enabled ? "text-ok" : undefined} />} onClick={toggle}>
          {enabled ? "Reviewer mode on" : "Turn on reviewer mode"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Download size={14} strokeWidth={1.75} />} disabled={!pairs} onClick={() => download("gridlock-labels.csv", labelsCsv(labels, meta), "text/csv")}>
          Labels CSV
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Download size={14} strokeWidth={1.75} />}
          disabled={!checks}
          onClick={() => download("review-log.json", JSON.stringify({ reviewedEvidenceIds: Object.keys(checked).sort(), exportedAt: new Date().toISOString() }, null, 1), "application/json")}
        >
          review-log.json
        </Button>
        <Button size="sm" variant="ghost" disabled={!pairs && !checks} onClick={clear}>
          Clear
        </Button>
      </div>
      <p className="mt-3 max-w-[68ch] text-caption text-pretty text-fg-3">
        Labels stay in this browser. Commit review-log.json to data/ and rebuild the snapshot to publish excerpts as human-checked.
      </p>
    </>
  );
}

/* ───────────────────────────────────────────────── 11 AI extraction ───────────────────────────────────────────────── */

export function ExtractionRuns() {
  const runs = SNAPSHOT.extractionRuns;
  if (!runs.length)
    return (
      <Well>
        <Line icon={<Bot className="text-fg-3" aria-hidden />} className="text-fg-1">
          No model extraction run is recorded in this snapshot.
        </Line>
        <p className="mt-1.5 text-ui text-pretty text-fg-2">
          Plan fields were parsed deterministically from the DESC and Georgia Power documents; other facts were located by AI research agents and checked by adversarial agents. Every
          excerpt is then re-found verbatim by script. The structured model-extraction job (<Code>npm run extract</Code>, OpenAI or Gemini) records provider, model, prompt version and
          span checks here when run with an API key.
        </p>
      </Well>
    );
  const located = runs.reduce((k, r) => k + r.fields.filter((f) => f.located).length, 0);
  const total = runs.reduce((k, r) => k + r.fields.length, 0);
  const cited = runs.reduce((k, r) => k + r.fields.filter((f) => f.inSnapshot).length, 0);
  return (
    <>
      <Prose>
        {runs[0].model} independently re-read {runs.length} source {runs.length === 1 ? "page" : "pages"}: <B>{located}</B> of <B>{total}</B> quoted spans were re-found verbatim (the
        rest are rejected), and <B>{cited}</B> quote a passage the snapshot already cites. Runs are a cross-check; they never add facts.
      </Prose>
      <div className="mt-5 divide-y divide-divider">
        {runs.map((r) => (
          <article key={r.id} className="py-4 first:pt-0">
            <div className="flex items-start gap-2.5">
              <Bot aria-hidden size={14} strokeWidth={1.75} className={clsx("mt-[3px] shrink-0", r.status === "completed" ? "text-ok" : "text-fg-3")} />
              <h5 className="min-w-0 flex-1 text-ui font-medium text-fg-1">{IDX.source(r.sourceId)?.title ?? r.sourceId}</h5>
              <Tag mono tone={r.status === "completed" ? "ok" : "muted"}>
                {r.status}
              </Tag>
            </div>
            <div className="num mt-1 pl-[24px] text-caption text-fg-3">
              {r.provider ? `${r.provider} · ` : ""}
              {r.model}
              {r.page ? ` · p. ${r.page}` : ""} · prompt {r.promptVersion}
              {r.runAt && ` · ${formatDate(r.runAt)}`}
            </div>
            {r.note && <p className="mt-1.5 pl-[24px] text-ui text-pretty text-fg-2">{r.note}</p>}
            {r.fields.length > 0 && (
              <div className="mt-2.5 ml-[24px] rounded-control bg-fill-1 px-3 py-1">
                {r.fields.map((f) => (
                  <div key={f.field} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto] gap-3 border-b border-divider py-1.5 text-caption last:border-b-0">
                    <span className="num truncate text-fg-3">{f.field}</span>
                    <span className="truncate text-fg-1" title={f.excerpt ? `${f.value}\n“${f.excerpt}”` : f.value}>
                      {f.value}
                    </span>
                    <span className={clsx("whitespace-nowrap", f.located ? "text-ok" : "text-warn")}>
                      {f.located ? (f.inSnapshot ? "span found · also cited" : "span found") : "span missing · rejected"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

/* ──────────────────────────────────────────── 12 Open research questions ──────────────────────────────────────────── */

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

export const OPEN_QUESTIONS = SNAPSHOT.unresolved.map((u) => ({ ...u, note: readableNote(u.note, IDX) })).filter((u) => u.note);

export function OpenQuestions() {
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const u of OPEN_QUESTIONS) m.set(u.cluster, [...(m.get(u.cluster) ?? []), u.note]);
    return [...m];
  }, []);
  return (
    <>
      <Prose className="mb-2">Gaps recorded during source review. They are shown, not hidden.</Prose>
      {groups.map(([cluster, notes]) => (
        <div key={cluster} className="mt-6">
          <h4 className="flex items-baseline gap-2 border-b border-divider pb-2">
            <span className="eyebrow">{CLUSTER_LABEL[cluster] ?? cluster}</span>
            <span className="num text-caption text-fg-3">{notes.length}</span>
          </h4>
          <ul>
            {notes.map((note, i) => (
              <li key={i} className="border-b border-divider py-2.5 text-ui text-pretty text-fg-2 [overflow-wrap:anywhere] last:border-b-0">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
