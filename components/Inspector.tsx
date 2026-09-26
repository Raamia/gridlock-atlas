"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Calculator, CalendarRange, Check, FileOutput, Handshake, Link2, Library, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import { SCOPE_LABEL, whyFlagged } from "@/lib/describe";
import type { Evidence, Match, Project, SignalLevel } from "@/lib/domain/types";
import { formatBound, formatDate, formatMiles, formatWindow } from "@/lib/format";
import { useSelectedPair } from "@/lib/hooks";
import { activeWindows } from "@/lib/matching/time";
import { matchSourceIds, ownerNames } from "@/lib/selectors";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { EvidenceCard, SourceRow, type EvidenceTone } from "./Evidence";
import { ImpactEstimate } from "./Impact";
import { Button, ConflictChip, Dot, IconButton, Kbd, MatchBadges, PrecisionTag, StatusChip } from "./ui";

export function Inspector() {
  const open = useAtlas((s) => s.inspectorOpen);
  const pair = useSelectedPair();
  return (
    <AnimatePresence>
      {open && pair && (
        <motion.aside
          key="inspector"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 28 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="glass absolute bottom-3 right-3 top-3 z-20 flex w-[408px] flex-col overflow-hidden rounded-2xl"
          aria-label="Evidence inspector"
        >
          <InspectorBody key={pair.match.id} m={pair.match} a={pair.a} b={pair.b} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function InspectorBody({ m, a, b }: { m: Match; a: Project; b: Project }) {
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const section = useAtlas((s) => s.inspectorSection);
  const scroller = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!section) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section]);

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("pair", m.id);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <>
      <header className="border-b border-line px-5 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Pair under review</span>
          <div className="flex items-center gap-1">
            <span className="hidden items-center gap-1 text-[10.5px] text-text-3 sm:flex">
              <Kbd>Esc</Kbd>
            </span>
            <IconButton label="Close inspector" onClick={() => select(null)}>
              <X size={15} />
            </IconButton>
          </div>
        </div>
        <div className="mt-2 space-y-2.5">
          <PairTitle p={a} color="var(--a)" />
          <div className="flex items-center gap-2 pl-[18px] text-[11px] text-text-3">
            <span className="h-px w-4 bg-line-3" />×<span className="h-px flex-1 bg-line" />
          </div>
          <PairTitle p={b} color="var(--b)" />
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <MatchBadges m={m} />
          <StatusChip status={m.reviewStatus} />
          <ConflictChip count={m.conflicts.length} />
        </div>
        <p className="mt-3 text-[13px] leading-[1.5] text-text-1">{whyFlagged(m)}</p>
      </header>

      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <PlaceSection m={m} a={a} b={b} active={section === "place"} />
        <ScheduleSection m={m} a={a} b={b} active={section === "schedule"} />
        <CoordinationSection m={m} active={section === "coordination"} />
        <Section id="impact" icon={<Calculator size={14} />} title="Rough impact estimate" level={<span className="text-[10px] text-text-3">illustrative</span>} active={section === "impact"}>
          <ImpactEstimate m={m} />
        </Section>
        {m.conflicts.length > 0 && <ConflictSection m={m} active={section === "conflicts"} />}
        <SourcesSection m={m} a={a} b={b} active={section === "sources"} />
        <p className="px-1 pb-2 text-[10.5px] leading-snug text-text-3">
          A match is a review lead, not a finding that crews or equipment can be shared. Engine {m.engineVersion}; ordering P{m.priority} is explainable priority, not a
          probability.
        </p>
      </div>

      <footer className="flex items-center gap-2 border-t border-line bg-bg-1/60 px-4 py-3">
        <Button variant="primary" size="md" className="flex-1" onClick={() => set({ briefOpen: true })}>
          <FileOutput size={14} />
          Create review brief
        </Button>
        <Button variant="outline" size="md" onClick={copyLink} aria-live="polite">
          {copied ? <Check size={14} className="text-known" /> : <Link2 size={14} />}
          {copied ? "Copied" : "Link"}
        </Button>
      </footer>
    </>
  );
}

function PairTitle({ p, color }: { p: Project; color: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[7px]">
        <Dot color={color} size={8} ring />
      </span>
      <div className="min-w-0">
        <h3 className="font-serif text-[21px] leading-[1.12] tracking-[-0.005em] text-text-0">{p.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-text-2">
          <span>{ownerNames(p, IDX)}</span>
          <span className="text-text-3">·</span>
          <span className={p.status.label ? "" : "capitalize"}>{p.status.label ?? p.status.value}</span>
          {p.docketId && (
            <>
              <span className="text-text-3">·</span>
              <span className="mono text-[10.5px]">{p.docketId}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- sections --------------------------------- */

function Section({
  id,
  icon,
  title,
  level,
  active,
  children,
}: {
  id: InspectorSection;
  icon: ReactNode;
  title: string;
  level?: ReactNode;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-section={id}
      className={clsx(
        "scroll-mt-3 rounded-xl border bg-bg-1/70 p-3.5 transition-[border-color,box-shadow] duration-500",
        active ? "border-amber/50 shadow-[0_0_0_3px_rgba(251,191,36,.12)]" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[12.5px] font-semibold text-text-0">
          <span className="text-text-2">{icon}</span>
          {title}
        </h4>
        {level}
      </div>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </section>
  );
}

function LevelPill({ label, level }: { label: string; level: SignalLevel }) {
  const styles: Record<SignalLevel, string> = {
    confirmed: "text-amber bg-amber/12 ring-amber/35",
    possible: "text-text-1 ring-text-3 ring-dashed",
    "no-match": "text-text-3 ring-line-2",
    unknown: "text-text-3 ring-line-2",
  };
  return (
    <span className={clsx("mono inline-flex h-5 items-center rounded-md px-1.5 text-[10px] uppercase tracking-wide ring-1", styles[level])}>
      {label} · {level.replace("-", " ")}
    </span>
  );
}

function toneFor(e: Evidence, a: Project, b: Project): EvidenceTone {
  const inProject = (p: Project) =>
    [
      ...p.titleEvidenceIds,
      ...p.status.evidenceIds,
      ...p.places.flatMap((x) => x.evidenceIds),
      ...p.constructionWindows.flatMap((x) => x.evidenceIds),
      ...p.completionClaims.flatMap((x) => x.evidenceIds),
      ...p.knownCoordination.flatMap((x) => x.evidenceIds),
      ...(p.route?.evidenceIds ?? []),
    ].includes(e.id);
  if (inProject(a) && !inProject(b)) return "a";
  if (inProject(b) && !inProject(a)) return "b";
  return "amber";
}

function EvidenceList({ ids, a, b, tone, limit = 3 }: { ids: string[]; a: Project; b: Project; tone?: EvidenceTone; limit?: number }) {
  const [all, setAll] = useState(false);
  const list = [...new Set(ids)].map((id) => IDX.evidence(id)).filter(Boolean) as Evidence[];
  if (!list.length) return <p className="text-[11.5px] text-text-3">No excerpt attached.</p>;
  const shown = all ? list : list.slice(0, limit);
  return (
    <div className="space-y-2">
      {shown.map((e) => (
        <EvidenceCard key={e.id} e={e} tone={tone ?? toneFor(e, a, b)} compact />
      ))}
      {list.length > limit && (
        <button onClick={() => setAll((x) => !x)} className="text-[11px] text-text-2 hover:text-text-0">
          {all ? "Show fewer" : `Show ${list.length - limit} more excerpt${list.length - limit > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

function PlaceSection({ m, a, b, active }: { m: Match; a: Project; b: Project; active: boolean }) {
  const rels = IDX.relations(m.geoDetail.relationIds);
  const c = m.geoDetail.center;
  const evidence = [...rels.flatMap((r) => r.evidenceIds), ...[a, b].flatMap((p) => p.places.filter((pl) => pl.role === "endpoint").flatMap((pl) => pl.evidenceIds))];
  return (
    <Section id="place" icon={<MapPin size={14} />} title="Where they meet" level={<LevelPill label="GEO" level={m.geo} />} active={active}>
      <p className="text-[12.5px] leading-[1.5] text-text-1">{m.geoReason}</p>
      {c && (
        <div className="flex items-center gap-3 rounded-lg bg-bg-2/70 px-3 py-2 ring-1 ring-line">
          <div>
            <div className="num text-[20px] leading-none text-text-0">{formatMiles(c.miles)}</div>
            <div className="mt-1 text-[10.5px] text-text-3">center to center</div>
          </div>
          <div className="h-8 w-px bg-line-2" />
          <div className="min-w-0 flex-1 text-[11px] leading-snug text-text-2">
            Range {formatMiles(c.lowMiles)}–{formatMiles(c.highMiles)} with location uncertainty · review radius <span className="num text-text-1">{m.geoDetail.thresholdMiles} mi</span>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-4">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber to-amber/40"
                style={{ width: `${Math.max(3, Math.min(100, (1 - c.miles / m.geoDetail.thresholdMiles) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {[
          [a, "var(--a)"],
          [b, "var(--b)"],
        ].map(([p, color]) => (
          <EndpointList key={(p as Project).id} p={p as Project} color={color as string} />
        ))}
      </div>
      {(a.route || b.route) && (
        <p className="text-[11px] leading-snug text-text-3">
          Dashed routes are schematic traces of official route-options maps — not survey-accurate and never used to measure distance.
        </p>
      )}
      <EvidenceList ids={evidence} a={a} b={b} tone={rels.length ? "amber" : undefined} limit={2} />
    </Section>
  );
}

function EndpointList({ p, color }: { p: Project; color: string }) {
  const eps = p.places.filter((pl) => pl.role === "endpoint");
  const list = eps.length ? eps : p.places.filter((pl) => pl.precision !== "county").slice(0, 2);
  return (
    <div className="rounded-lg bg-bg-2/60 px-3 py-2 ring-1 ring-line">
      <div className="flex items-center gap-2 text-[11px] text-text-2">
        <Dot color={color} size={6} /> <span className="truncate">{p.shortTitle}</span>
        <span className="ml-auto text-[10px] text-text-3">{list.length === 2 ? "center = midpoint" : list.length === 1 ? "center = this point" : ""}</span>
      </div>
      {list.length === 0 && <div className="mt-1 text-[11.5px] text-text-3">No located terminal</div>}
      {list.map((pl) => (
        <div key={pl.id} className="mt-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[12px] text-text-0" title={pl.detail ?? pl.label}>
              {pl.label}
            </div>
            <div className="mono truncate text-[9.5px] text-text-3" title={pl.coordinateSource}>
              {pl.lat.toFixed(4)}, {pl.lon.toFixed(4)} · {pl.coordinateSource}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <PrecisionTag precision={pl.precision} />
            {pl.confidence === "lower-confidence" && <span className="text-[10px] text-conflict">lower confidence</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleSection({ m, a, b, active }: { m: Match; a: Project; b: Project; active: boolean }) {
  const rows: [Project, string][] = [
    [a, "var(--a)"],
    [b, "var(--b)"],
  ];
  return (
    <Section id="schedule" icon={<CalendarRange size={14} />} title="When they build" level={<LevelPill label="TIME" level={m.time} />} active={active}>
      <p className="text-[12.5px] leading-[1.5] text-text-1">{m.timeReason}</p>
      <div className="overflow-hidden rounded-lg ring-1 ring-line">
        {rows.map(([p, color]) => {
          const ws = activeWindows(p);
          return (
            <div key={p.id} className="flex items-start gap-2.5 border-b border-line bg-bg-2/60 px-3 py-2 last:border-b-0">
              <span className="mt-[5px]">
                <Dot color={color} size={6} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] text-text-2">{p.shortTitle}</div>
                {ws.length ? (
                  ws.map((w) => (
                    <div key={w.id} className="flex items-baseline justify-between gap-2">
                      <span className="num text-[13px] text-text-0">{formatWindow(w.start, w.end)}</span>
                      <span className="truncate text-[10.5px] text-text-3">
                        {IDX.source(w.claimSourceId)?.publisher} · {w.start.precision} precision
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] text-text-3">No published construction window</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {m.timeDetail.inService && (
        <div className="flex items-center gap-3 rounded-lg bg-bg-2/70 px-3 py-2 ring-1 ring-line">
          <div>
            <div className="num text-[20px] leading-none text-text-0">{m.timeDetail.inService.gapDays.toLocaleString("en-US")}</div>
            <div className="mt-1 text-[10.5px] text-text-3">days between in-service dates</div>
          </div>
          <div className="h-8 w-px bg-line-2" />
          <div className="num min-w-0 flex-1 space-y-0.5 text-[11px] text-text-2">
            <div className="flex items-center gap-1.5">
              <Dot color="var(--a)" size={5} /> {formatDate(m.timeDetail.inService.a)} <span className="truncate text-text-3">· {m.timeDetail.inService.labelA}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Dot color="var(--b)" size={5} /> {formatDate(m.timeDetail.inService.b)} <span className="truncate text-text-3">· {m.timeDetail.inService.labelB}</span>
            </div>
          </div>
        </div>
      )}
      {m.timeDetail.continuityCaveat && (
        <p className="text-[11px] text-text-3">A source does not describe one continuous construction phase, so overlap is only “possible.”</p>
      )}
      <EvidenceList ids={[...activeWindows(a), ...activeWindows(b)].flatMap((w) => w.evidenceIds)} a={a} b={b} limit={2} />
    </Section>
  );
}

function CoordinationSection({ m, active }: { m: Match; active: boolean }) {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const hasResourceSharing = m.coordination.some((c) => c.scope === "resource-sharing");
  return (
    <Section id="coordination" icon={<Handshake size={14} />} title="Coordination on record" active={active}>
      {m.coordination.length ? (
        <>
          <div className="rounded-lg bg-known/8 p-3 ring-1 ring-known/30">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-known">
              <Check size={13} /> Documented — this is a known interface, not a new discovery
            </div>
            <ul className="mt-2 space-y-1.5">
              {m.coordination.map((c, i) => (
                <li key={i} className="text-[12px] leading-snug text-text-1">
                  <span className="mono mr-1.5 rounded bg-bg-3 px-1 py-0.5 text-[10px] uppercase tracking-wide text-text-2">{SCOPE_LABEL[c.scope]}</span>
                  {c.description}
                </li>
              ))}
            </ul>
          </div>
          {!hasResourceSharing && (
            <div className="flex items-start gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[11.5px] leading-snug text-text-2 ring-1 ring-line">
              <span className="mt-0.5 text-text-3">?</span>
              <span>
                <span className="text-text-1">Shared crews or equipment: not established</span> in the reviewed sources. The existing coordination covers what is quoted — nothing more.
              </span>
            </div>
          )}
          <EvidenceList ids={m.coordination.flatMap((c) => c.evidenceIds)} a={a} b={b} tone="known" limit={2} />
        </>
      ) : (
        <div className="rounded-lg bg-review/8 p-3 text-[12px] leading-snug text-text-1 ring-1 ring-review/25">
          <div className="font-medium text-review">No coordination found in reviewed sources</div>
          <p className="mt-1 text-text-2">
            That is an <em>unknown</em> status — not evidence that the utilities are uncoordinated. Planners should check unpublished arrangements before outreach.
          </p>
        </div>
      )}
    </Section>
  );
}

function ConflictSection({ m, active }: { m: Match; active: boolean }) {
  const set = useAtlas((s) => s.set);
  return (
    <Section
      id="conflicts"
      icon={<AlertTriangle size={14} />}
      title="Sources disagree"
      level={<span className="text-[10.5px] text-conflict">{m.conflicts.length} preserved</span>}
      active={active}
    >
      {m.conflicts.map((c) => {
        const p = IDX.project(c.projectId);
        const claims = c.field === "completion" ? p.completionClaims.filter((x) => c.claimIds.includes(x.id)) : [];
        const windows = c.field === "constructionWindow" ? p.constructionWindows.filter((x) => c.claimIds.includes(x.id)) : [];
        return (
          <div key={c.id} onMouseEnter={() => set({ highlightConflict: true })} onMouseLeave={() => set({ highlightConflict: false })}>
            <div className="text-[11.5px] text-text-2">
              {p.shortTitle} · <span className="text-text-1">{c.field === "completion" ? "completion / in-service date" : "construction window"}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {claims.map((cl) => (
                <ClaimCard key={cl.id} sourceId={cl.claimSourceId} label={cl.label} value={formatBound(cl.date)} evidenceIds={cl.evidenceIds} />
              ))}
              {windows.map((w) => (
                <ClaimCard key={w.id} sourceId={w.claimSourceId} label="construction" value={formatWindow(w.start, w.end)} evidenceIds={w.evidenceIds} />
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-text-3">
              {c.affectsMatch
                ? "This disagreement changes whether the windows overlap; the engine evaluated every combination."
                : "Both claims are kept. Completion dates never drive the construction-window match, so the TIME signal is unaffected."}
            </p>
          </div>
        );
      })}
    </Section>
  );
}

function ClaimCard({ sourceId, label, value, evidenceIds }: { sourceId: string; label: string; value: string; evidenceIds: string[] }) {
  const src = IDX.source(sourceId);
  const e = evidenceIds.map((id) => IDX.evidence(id)).find(Boolean);
  return (
    <div className="flex flex-col rounded-lg bg-bg-2 p-2.5 ring-1 ring-conflict/30">
      <div className="mono truncate text-[9.5px] uppercase tracking-[0.06em] text-text-3">{src?.publisher}</div>
      <div className="num mt-1 text-[17px] leading-none text-text-0">{value}</div>
      <div className="mt-1 text-[10.5px] capitalize text-text-2">{label}</div>
      {e && <div className="mt-2 line-clamp-4 font-serif text-[12.5px] leading-snug text-text-1">“{e.exactExcerpt}”</div>}
      {src && (
        <a href={e?.page && src.mimeType === "application/pdf" ? `${src.url}#page=${e.page}` : src.url} target="_blank" rel="noreferrer" className="mt-auto pt-2 text-[10.5px] text-text-2 hover:text-a">
          Open source ↗
        </a>
      )}
    </div>
  );
}

function SourcesSection({ m, a, b, active }: { m: Match; a: Project; b: Project; active: boolean }) {
  const ids = new Set([...matchSourceIds(m, IDX), ...a.sourceIds, ...b.sourceIds]);
  const sources = [...ids].map((id) => IDX.source(id)).filter(Boolean);
  const counts = new Map<string, number>();
  for (const e of Object.values(IDX.allEvidence())) counts.set(e.sourceId, (counts.get(e.sourceId) ?? 0) + 1);
  return (
    <Section id="sources" icon={<Library size={14} />} title="Public sources" level={<span className="num text-[10.5px] text-text-3">{sources.length}</span>} active={active}>
      <div className="-mx-1.5">
        {sources.map((s) => (
          <SourceRow key={s!.id} s={s!} count={counts.get(s!.id)} />
        ))}
      </div>
      <p className="text-[10.5px] text-text-3">Snapshot {formatDate(IDX.snapshotDate)} · excerpts are short quotations with page anchors; full documents stay with their publishers.</p>
    </Section>
  );
}
