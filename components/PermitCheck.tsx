"use client";

import clsx from "clsx";
import { CircleDashed, MapPin, Radar, Route } from "lucide-react";
import { useMemo, useState } from "react";
import { IDX } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { LEAD_PERMITS, SAVED, type LiveCheck } from "@/lib/permits";
import { rankLabel, rankOf, regionMatches } from "@/lib/rank";
import { ownerNames } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { B, Prose, TD_ROW, TH_ROW, Well } from "./docs/bits";
import { Button, Tag } from "./ui";

const REGION = "southeast";
const TOP = 12;
const COLS = "grid-cols-[16px_minmax(0,1fr)_auto]";
const n = (v: number) => v.toLocaleString("en-US");

const VERDICT = {
  none: { icon: CircleDashed, label: "no filing", cls: "text-fg-3", tone: "muted" },
  related: { icon: Route, label: "nearby filing", cls: "text-fg-2", tone: "neutral" },
  site: { icon: MapPin, label: "filing at site", cls: "text-ok", tone: "ok" },
} as const;

/** Method & audit: state land-disturbance filings as a source of field-work dates (data/permits), with a live re-check. */
export function PermitCheck() {
  const run = useAtlas((s) => s.run);
  const [live, setLive] = useState<LiveCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the projects behind the region's current top needs-review leads, each with the leads it appears in; `lead` = the #1 pair
  const { projects, lead } = useMemo(() => {
    if (!run) return { projects: [], lead: null };
    const top = regionMatches(run, REGION)
      .filter((m) => m.reviewStatus === "needs-review")
      .slice(0, TOP);
    const leads = new Map<string, number[]>();
    for (const m of top) for (const id of [m.projectAId, m.projectBId]) leads.set(id, [...(leads.get(id) ?? []), rankOf(run, REGION, m.id)!]);
    const finding = (id: string) => LEAD_PERMITS.find((f) => f.projectId === id);
    return {
      projects: [...leads].map(([id, ranks]) => ({ id, ranks, finding: finding(id) })),
      lead: top[0] ? [top[0].projectAId, top[0].projectBId].map((id) => ({ p: IDX.project(id), finding: finding(id) })) : null,
    };
  }, [run]);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/permits", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setLive(body as LiveCheck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the permit portals did not answer");
    } finally {
      setBusy(false);
    }
  };

  const saved = SAVED.retrievedAt.slice(0, 10);
  const gaSearched = SAVED.georgia.searches.reduce((k, s) => k + s.results, 0);
  const newCount = live ? live.georgia.newFilings.length + live.southCarolina.newBoundaries.length : 0;
  // the saved check has a finding for both sides of the #1 lead, and neither is a filing at the project's own site
  const leadOpen = !!lead && lead.every((x) => x.p && x.finding && x.finding.verdict !== "site");

  return (
    <>
      <Prose>
        No top Savannah River lead has published field-work dates. Before land is cleared, the work needs a state stormwater permit, and those filings carry dates. We searched Georgia
        EPD&apos;s permit portal (every Effingham and Chatham County filing since January 2024, <B>{n(gaSearched)}</B> results, plus the leads&apos; facility names) and SC DES&apos;s
        coastal land-disturbance boundaries (<B>{n(SAVED.southCarolina.boundariesInRegion)}</B> around the Savannah River).
      </Prose>
      <Well className="mt-4">
        <p className="max-w-[68ch] text-ui text-pretty text-fg-1">
          On {formatDate(saved)} Georgia Power had no land-disturbance filing for its side of any lead the check covered, so no pair has two permit windows to compare.
          {run && leadOpen && (
            <>
              {" "}
              For the top lead at {run.thresholdMiles} mi ({lead!.map((x) => `${ownerNames(x.p!, IDX, true)}'s ${x.p!.shortTitle}`).join(" and ")}) neither utility has filed to clear
              land for this work: the window to coordinate the field work is still open.
            </>
          )}
        </p>
      </Well>

      {!run && <Prose className="mt-5">Run the comparison to see the finding for each project behind the top {TOP} leads.</Prose>}
      {run && (
        <div role="table" aria-label="State permit findings for the top leads" className="mt-5">
          <div role="row" className={clsx(TH_ROW, COLS)}>
            <span role="columnheader" aria-label="Finding" />
            <span role="columnheader">Project · saved finding</span>
            <span role="columnheader" className="text-right">
              Leads
            </span>
          </div>
          {projects.map(({ id, ranks, finding }) => {
            const p = IDX.project(id);
            const v = finding ? VERDICT[finding.verdict] : null;
            const Icon = v?.icon ?? CircleDashed;
            return (
              <div role="row" key={id} className={clsx(TD_ROW, COLS, "items-start")}>
                <span role="cell" className="pt-[2px]">
                  <Icon size={14} strokeWidth={1.75} className={v?.cls ?? "text-fg-3"} aria-hidden />
                </span>
                <span role="cell" className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-fg-1">{p?.shortTitle ?? id}</span>
                    {p && <span className="text-caption text-fg-3">{ownerNames(p, IDX, true)}</span>}
                  </span>
                  <span className="mt-1 block text-caption text-pretty text-fg-2">
                    <Tag mono tone={v?.tone ?? "muted"} className="mr-1.5 align-[1px]">
                      {v?.label ?? "not checked"}
                    </Tag>
                    {finding?.text ?? "This project was not in the top leads when the check was saved."}
                  </span>
                </span>
                <span role="cell" className="num pt-px text-right text-caption text-fg-3">
                  {ranks.map((r) => `#${rankLabel(r)}`).join(" ")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 max-w-[68ch] text-caption text-pretty text-fg-3">
        A filing shows that land disturbance was permitted or requested; it is not a crew schedule. No filing found is not evidence that no work is planned: a Georgia Notice of Intent is
        due at least 14 days before construction. The SC layer gives one date per boundary and does not say whether it is the filing, review or approval date. Nothing here changes the
        engine or the snapshot.
      </p>

      <Well className="mt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="sm" variant="secondary" icon={<Radar size={14} strokeWidth={1.75} />} loading={busy} onClick={check}>
            Check the portals now
          </Button>
          <span className="text-caption text-fg-3">Searches both state portals for utility filings since {formatDate(saved)}. Takes a few seconds.</span>
        </div>
        <div aria-live="polite">
          {error && <p className="mt-3 text-ui text-pretty text-warn">Live check failed: {error}. The saved results above still stand.</p>}
          {live && !error && (
            <div className="mt-3 space-y-1.5 text-ui text-pretty">
              <p className="text-fg-1">
                {newCount === 0 ? "No new utility-like filings" : `${newCount} new utility-like ${newCount === 1 ? "filing" : "filings"}`} since {formatDate(live.since)} · checked{" "}
                {new Date(live.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="text-caption text-fg-3">
                Georgia EPD: {live.georgia.searches.map((s) => `${s.county} ${s.results}`).join(" · ")} filings of any kind · SC DES: {live.southCarolina.boundariesSince} boundaries
              </p>
              {live.georgia.newFilings.map((f) => (
                <p key={f.submissionId} className="text-fg-2">
                  <span className="num mr-1.5 text-caption text-fg-3">GA {f.submitted}</span>
                  {f.facility}{" "}
                  <span className="text-fg-3">
                    ({f.appType || "filing"}, {f.county}, submission {f.submissionId})
                  </span>
                </p>
              ))}
              {live.southCarolina.newBoundaries.map((b) => (
                <p key={b.objectId} className="text-fg-2">
                  <span className="num mr-1.5 text-caption text-fg-3">SC {b.boundaryFiled}</span>
                  {b.project} <span className="text-fg-3">({b.acres} acres)</span>
                </p>
              ))}
              {newCount > 0 && <p className="text-caption text-fg-3">New filings are not linked to a project automatically: check the facility against the leads above before citing it.</p>}
            </div>
          )}
        </div>
      </Well>
    </>
  );
}
