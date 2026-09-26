"use client";

import { CircleDashed, MapPin, Radar, Route } from "lucide-react";
import { useMemo, useState } from "react";
import { IDX } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { LEAD_PERMITS, SAVED, type LiveCheck } from "@/lib/permits";
import { rankLabel, rankOf, regionMatches } from "@/lib/rank";
import { ownerNames } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { Button } from "./ui";

const REGION = "southeast";
const TOP = 12;

const VERDICT = {
  none: { icon: CircleDashed, label: "no filing", cls: "text-text-3" },
  related: { icon: Route, label: "nearby filing", cls: "text-text-2" },
  site: { icon: MapPin, label: "filing at site", cls: "text-known" },
} as const;

/** Method drawer: state land-disturbance filings as a source of field-work dates (data/permits), with a live re-check. */
export function PermitCheck() {
  const run = useAtlas((s) => s.run);
  const [live, setLive] = useState<LiveCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the projects behind the region's current top needs-review leads, each with the leads it appears in
  const projects = useMemo(() => {
    if (!run) return [];
    const top = regionMatches(run, REGION)
      .filter((m) => m.reviewStatus === "needs-review")
      .slice(0, TOP);
    const leads = new Map<string, number[]>();
    for (const m of top) for (const id of [m.projectAId, m.projectBId]) leads.set(id, [...(leads.get(id) ?? []), rankOf(run, REGION, m.id)!]);
    return [...leads].map(([id, ranks]) => ({ id, ranks, finding: LEAD_PERMITS.find((f) => f.projectId === id) }));
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
  const gaSearched = SAVED.georgia.searches.reduce((n, s) => n + s.results, 0);
  const newCount = live ? live.georgia.newFilings.length + live.southCarolina.newBoundaries.length : 0;

  return (
    <div className="space-y-3 text-[12.5px] leading-[1.55] text-text-1">
      <p>
        No top Savannah River lead has published field-work dates. Before land is cleared, the work needs a state stormwater permit, and those filings carry dates. We searched
        Georgia EPD&apos;s permit portal (every Effingham and Chatham County filing since January 2024, {gaSearched.toLocaleString("en-US")} results, plus the leads&apos; facility
        names) and SC DES&apos;s coastal land-disturbance boundaries ({SAVED.southCarolina.boundariesInRegion.toLocaleString("en-US")} around the Savannah River).
      </p>
      <p className="rounded-lg bg-bg-2 px-3 py-2 text-text-0 ring-1 ring-line">
        On {formatDate(saved)} Georgia Power had no land-disturbance filing for its side of any top-{TOP} lead, so no pair has two permit windows to compare. For the top lead at 25 mi
        (DESC&apos;s Okatie – McIntosh reactor and Georgia Power&apos;s Goshen – McIntosh rebuild) neither utility has filed to clear land: the window to coordinate the field work is
        still open.
      </p>

      {!run && <p className="text-[12px] text-text-3">Run the comparison to see the finding for each project behind the top {TOP} leads.</p>}
      {run && (
        <div className="overflow-hidden rounded-xl ring-1 ring-line">
          {projects.map(({ id, ranks, finding }) => {
            const p = IDX.project(id);
            const v = finding ? VERDICT[finding.verdict] : null;
            const Icon = v?.icon ?? CircleDashed;
            return (
              <div key={id} className="grid grid-cols-[16px_1fr] gap-2 border-b border-line bg-bg-2/60 px-3 py-2 last:border-b-0">
                <Icon size={14} className={`mt-0.5 ${v?.cls ?? "text-text-3"}`} aria-hidden />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] text-text-0">{p?.shortTitle ?? id}</span>
                    <span className="text-[11px] text-text-3">{p ? ownerNames(p, IDX, true) : ""}</span>
                    <span className="mono ml-auto text-[10.5px] text-text-3">{ranks.map((r) => `#${rankLabel(r)}`).join(" ")}</span>
                  </div>
                  <div className="text-[11.5px] leading-snug text-text-2">
                    <span className={`mono mr-1.5 text-[10px] uppercase ${v?.cls ?? "text-text-3"}`}>{v?.label ?? "not checked"}</span>
                    {finding?.text ?? "This project was not in the top leads when the check was saved."}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-snug text-text-3">
        A filing shows that land disturbance was permitted or requested; it is not a crew schedule. No filing found is not evidence that no work is planned: a Georgia Notice of Intent is
        due at least 14 days before construction. The SC layer gives one date per boundary and does not say whether it is the filing, review or approval date. Nothing here changes the
        engine or the snapshot.
      </p>

      <div className="rounded-xl bg-bg-2/60 px-3 py-2.5 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" icon={<Radar size={13} />} loading={busy} onClick={check}>
            Check the portals now
          </Button>
          <span className="text-[11px] text-text-3">Searches both state portals for utility filings since {formatDate(saved)}. Takes a few seconds.</span>
        </div>
        <div aria-live="polite">
          {error && <p className="mt-2 text-[11.5px] text-danger">Live check failed: {error}. The saved results above still stand.</p>}
          {live && !error && (
            <div className="mt-2 space-y-1 text-[11.5px] leading-snug">
              <p className="text-text-0">
                {newCount === 0 ? "No new utility-like filings" : `${newCount} new utility-like ${newCount === 1 ? "filing" : "filings"}`} since {formatDate(live.since)} · checked{" "}
                {new Date(live.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="text-text-3">
                Georgia EPD: {live.georgia.searches.map((s) => `${s.county} ${s.results}`).join(" · ")} filings of any kind · SC DES: {live.southCarolina.boundariesSince} boundaries
              </p>
              {live.georgia.newFilings.map((f) => (
                <p key={f.submissionId} className="text-text-1">
                  <span className="mono mr-1.5 text-[10px] text-text-3">GA {f.submitted}</span>
                  {f.facility} <span className="text-text-3">({f.appType || "filing"}, {f.county}, submission {f.submissionId})</span>
                </p>
              ))}
              {live.southCarolina.newBoundaries.map((b) => (
                <p key={b.objectId} className="text-text-1">
                  <span className="mono mr-1.5 text-[10px] text-text-3">SC {b.boundaryFiled}</span>
                  {b.project} <span className="text-text-3">({b.acres} acres)</span>
                </p>
              ))}
              {newCount > 0 && <p className="text-text-3">New filings are not linked to a project automatically: check the facility against the leads above before citing it.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
