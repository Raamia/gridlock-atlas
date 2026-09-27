"use client";

import clsx from "clsx";
import { AlertTriangle, Calculator, CalendarRange, Check, ExternalLink, Handshake, Library, MapPin } from "lucide-react";
import { catchError } from "next/error";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import { firstSentence, SCOPE_LABEL } from "@/lib/describe";
import type { Conflict, ConflictSide, Disagreement, Evidence, Match, Place, Precision, Project, SignalLevel } from "@/lib/domain/types";
import { formatBound, formatDate, formatMilesNear, precisionLabel } from "@/lib/format";
import { useTier } from "@/lib/layout";
import { definiteTouch } from "@/lib/mapdata";
import { centerOf } from "@/lib/matching/geo";
import { activeWindows, coarsest, currentInService, dayWord, displayWindowGroups } from "@/lib/matching/time";
import { conflictMatches, evidenceHref, matchSourceIds, pageLabel, readableNote, windowGroupText, windowSourceText } from "@/lib/selectors";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { EvidenceList, SourceRow, type EvidenceTone } from "../Evidence";
import { ImpactEstimate } from "../Impact";
import { PairGantt } from "../timeline/PairGantt";
import { Disclosure, SignalFact, signalState, Tag, Tooltip, UtilityDot, windowDocs, windowNote } from "../ui";
import { conflictSplit, ownerFull, TIER_LABEL } from "./facts";
import { scrollInspectorTo } from "./SectionNav";
import { WhatIf } from "./WhatIf";

/* ────────────────────────────────────────── shell ────────────────────────────────────────── */

/** One inspector section: a hairline above, an icon + title row, then the content. Never a bordered box. */
export function Section({
  id,
  icon,
  title,
  level,
  pulse,
  children,
}: {
  id: InspectorSection;
  icon: ReactNode;
  title: string;
  level?: ReactNode;
  /** Bumped when the demo (or a chip) points at this section: its title row gets one white spotlight pulse. */
  pulse?: number;
  children: ReactNode;
}) {
  return (
    <section data-section={id} aria-labelledby={`insp-h-${id}`} className="border-t border-divider pt-4 pb-6">
      <div key={pulse ?? 0} className={clsx("-mx-2 mb-3 flex min-h-8 items-center gap-2 rounded-control px-2", pulse ? "animate-spotlight" : "")}>
        <span aria-hidden className="text-fg-3 [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 id={`insp-h-${id}`} className="text-body font-semibold text-fg-1">
          {title}
        </h3>
        {level && <span className="ml-auto flex min-w-0 items-center">{level}</span>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const LEVEL_WORD: Record<SignalLevel, string> = { confirmed: "confirmed", possible: "possible", "no-match": "no overlap", unknown: "unknown" };

function Level({ kind, level }: { kind: "place" | "time"; level: SignalLevel }) {
  const word = kind === "place" && level === "no-match" ? "no match" : LEVEL_WORD[level];
  return (
    <SignalFact kind={kind} state={signalState(level)} mono={false}>
      {word}
    </SignalFact>
  );
}

const ROLE_TONE = (e: Evidence, a: Project, b: Project): EvidenceTone => {
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
  const inA = inProject(a);
  const inB = inProject(b);
  if (inA && !inB) return "a";
  if (inB && !inA) return "b";
  return "neutral";
};

function ProjectLabel({ p, role, right }: { p: Project; role: "a" | "b"; right?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UtilityDot utility={role} />
      <span className="min-w-0 truncate text-caption font-medium text-fg-2" title={p.title}>
        {p.shortTitle}
      </span>
      {right && <span className="ml-auto max-w-[55%] shrink-0 truncate text-right text-caption text-fg-3">{right}</span>}
    </div>
  );
}

/* ────────────────────────────────────── Where they meet ────────────────────────────────────── */

const PRECISION_TEXT: Record<Precision, string> = {
  "official-gis": "Official GIS",
  "official-map-digitized": "Digitized from official map · approximate",
  "named-facility": "Named facility",
  locality: "Locality · approximate",
  county: "County-level only",
  unknown: "Location unknown",
};

export function PlaceSection({ m, a, b, pulse }: { m: Match; a: Project; b: Project; pulse?: number }) {
  const rels = IDX.relations(m.geoDetail.relationIds);
  const c = m.geoDetail.closest;
  const legacy = m.geoDetail.center;
  const radius = m.geoDetail.thresholdMiles;
  const method = m.geoDetail.method;
  // a shared site or terminal (or lines that cross) is a zero-mile contact: named as touching, never measured on a meter
  const touching = definiteTouch(c);
  const statedRel = rels.find((r) => r.basis !== "inferred");
  const implied = method === "shared-site" && rels.length > 0 && !statedRel;
  const facility = method === "shared-site" ? (statedRel?.siteLabel ?? rels.find((x) => x.siteLabel)?.siteLabel) : m.geoDetail.sharedEndpoint?.labelA;
  const mi = (x: number) => formatMilesNear(x, radius);
  const evidence = [...rels.flatMap((r) => r.evidenceIds), ...[a, b].flatMap((p) => p.places.filter((pl) => pl.role === "endpoint").flatMap((pl) => pl.evidenceIds))];
  const fill = c ? Math.min(100, (c.miles / radius) * 100) : 0;
  const band = c ? [Math.min(100, (c.lowMiles / radius) * 100), Math.min(100, (c.highMiles / radius) * 100)] : [0, 0];
  return (
    <Section id="place" icon={<MapPin />} title="Where they meet" level={<Level kind="place" level={m.geo} />} pulse={pulse}>
      <p className="text-ui text-pretty text-fg-2">{m.geoReason}</p>
      {c && (
        <div className="flex items-center gap-4 rounded-card bg-fill-1 px-3.5 py-3">
          <div className="shrink-0">
            <div className={clsx("text-title font-medium text-fg-1", !touching && "num")}>{touching ? "Touching" : `${c.approximate && !mi(c.miles).startsWith("<") ? "≈" : ""}${mi(c.miles)}`}</div>
            <div className="mt-1 text-caption text-fg-3">closest approach</div>
          </div>
          <div aria-hidden className="h-10 w-px shrink-0 bg-divider" />
          <div className="min-w-0 flex-1">
            <p className="text-caption text-pretty text-fg-3">
              <span className="font-medium text-fg-1">{TIER_LABEL[c.tier]}</span>
              {c.approximate ? " · estimated from mapped/digitized geometry" : " · measured from located work geometry"}
              {facility && (
                <>
                  {` · ${method === "shared-site" ? (implied ? "source-implied" : "source-stated") : "shared terminal"}: `}
                  <span className="text-fg-2">{facility}</span>
                </>
              )}
            </p>
            {!touching && (
              <div className="relative mt-2 h-1.5 rounded-full bg-fill-3" role="img" aria-label={`${mi(c.miles)} closest approach of the ${radius} mi review radius`}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-fg-2" style={{ width: `${Math.max(2, fill)}%` }} />
                {band[1] - band[0] > 1 && <div className="absolute inset-y-0 rounded-full bg-fg-1/25" style={{ left: `${band[0]}%`, width: `${band[1] - band[0]}%` }} />}
              </div>
            )}
            <div className="mt-1.5 text-caption text-fg-3">
              {mi(c.lowMiles) === mi(c.highMiles) ? "±<1 mi location uncertainty" : `Range ${mi(c.lowMiles)}–${mi(c.highMiles)} with location uncertainty`} · review radius{" "}
              <span className="num text-fg-2">{radius} mi</span>
            </div>
          </div>
        </div>
      )}
      {legacy && (
        <p className="text-caption text-pretty text-fg-3">
          Legacy starter-file center distance: <span className="num text-fg-2">{mi(legacy.miles)}</span>. Shown for benchmark comparison; it does not control the flag.
        </p>
      )}
      <div className="space-y-3.5">
        <Endpoints p={a} role="a" />
        <Endpoints p={b} role="b" />
      </div>
      {(a.route || b.route) && (
        <p className="text-caption text-pretty text-fg-3">
          Dashed routes are digitized from official route-options maps. They are used for closest approach only as an explicitly labeled estimate.
        </p>
      )}
      <EvidenceList ids={evidence} toneOf={(e) => ROLE_TONE(e, a, b)} />
      <Disclosure variant="inline" summary={<span className="text-caption">Coordinates &amp; provenance</span>} contentClassName="space-y-3 pt-2">
        {[a, b].map((p) => (
          <div key={p.id} className="space-y-1">
            <p className="text-caption font-medium text-fg-2">
              {p.shortTitle}
              {p.docketId && <span className="num font-normal text-fg-3"> · {p.docketId}</span>}
            </p>
            {p.places
              .filter((pl) => pl.precision !== "county")
              .map((pl) => (
                <p key={pl.id} className="num text-[11px] break-words text-fg-3">
                  {pl.label}: {pl.lat.toFixed(4)}, {pl.lon.toFixed(4)} · {pl.coordinateSource}
                </p>
              ))}
          </div>
        ))}
      </Disclosure>
    </Section>
  );
}

function Endpoints({ p, role }: { p: Project; role: "a" | "b" }) {
  const eps = p.places.filter((pl) => pl.role === "endpoint");
  const list: Place[] = eps.length ? eps : p.places.filter((pl) => pl.precision !== "county").slice(0, 2);
  // the starter-workbook center stays visible as a secondary benchmark: the points it is computed from, named when the list shows more
  const used = centerOf(p)?.places ?? [];
  const extra = list.some((pl) => !used.some((u) => u.id === pl.id));
  const center =
    used.length === 2 ? (extra ? `legacy center = midpoint of ${used[0].label} & ${used[1].label}` : "legacy center = midpoint") : used.length === 1 ? (extra ? `legacy center = ${used[0].label}` : "legacy center = this point") : "";
  return (
    <div>
      <ProjectLabel p={p} role={role} right={center ? <span title={center}>{center}</span> : undefined} />
      {list.length === 0 && <p className="mt-1.5 pl-3.5 text-caption text-fg-3">No located terminal</p>}
      <ul className="mt-1.5 space-y-1 pl-3.5">
        {list.map((pl) => (
          <li key={pl.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
            <span className="min-w-0 text-ui text-pretty break-words text-fg-1" title={pl.detail ?? pl.label}>
              {pl.label}
            </span>
            <span className="flex max-w-[11rem] flex-wrap justify-end gap-x-1.5 text-right text-caption text-fg-3">
              <span>{PRECISION_TEXT[pl.precision]}</span>
              {pl.confidence === "lower-confidence" && <span className="text-warn">lower confidence</span>}
              {extra && !used.some((u) => u.id === pl.id) && <span>not used for center</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ────────────────────────────────────── When they build ────────────────────────────────────── */

/** The phone's compact pair Gantt is a bonus view: if it throws, the section keeps its dated list below. */
const GanttBoundary = catchError(() => null);
/** The schedule what-if is a bonus view too: if it throws, the section above it is untouched. */
const WhatIfBoundary = catchError(() => null);

export function ScheduleSection({ m, a, b, pulse }: { m: Match; a: Project; b: Project; pulse?: number }) {
  const phone = useTier() === "phone";
  const g = m.timeDetail.inService;
  return (
    <Section id="schedule" icon={<CalendarRange />} title="When they build" level={<Level kind="time" level={m.time} />} pulse={pulse}>
      <p className="text-ui text-pretty text-fg-2">{m.timeReason}</p>
      {phone && (
        <div className="-mx-1">
          <GanttBoundary>
            <PairGantt matchId={m.id} compact />
          </GanttBoundary>
        </div>
      )}
      <div className="space-y-3.5">
        {(
          [
            [a, "a"],
            [b, "b"],
          ] as const
        ).map(([p, role]) => (
          <Windows key={p.id} p={p} role={role} />
        ))}
      </div>
      {g && (
        <div className="flex items-center gap-4 rounded-card bg-fill-1 px-3.5 py-3">
          <div className="w-[104px] shrink-0">
            <div className="num text-title font-medium text-fg-1">
              {g.coarse && g.gapDays > 0 ? "≥" : ""}
              {g.gapDays.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-caption text-fg-3">
              {g.coarse ? (g.gapDays === 0 ? "days · ranges overlap" : `${dayWord(g.gapDays)} · nearest edges`) : `${dayWord(g.gapDays)} between in-service dates`}
            </div>
          </div>
          <div aria-hidden className="w-px self-stretch bg-divider" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-caption text-fg-3">In-service gap · secondary signal</p>
            {(
              [
                [g.boundA, g.labelA, "a"],
                [g.boundB, g.labelB, "b"],
              ] as const
            ).map(([bound, label, role]) => (
              <div key={role} className="flex min-w-0 items-baseline gap-2">
                <UtilityDot utility={role} className="translate-y-[-1px]" />
                <span className="num shrink-0 text-ui text-fg-1">{formatBound(bound)}</span>
                <span className="min-w-0 truncate text-caption text-fg-3" title={label}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.timeDetail.continuityCaveat && <p className="text-caption text-fg-3">A source does not describe one continuous construction phase, so overlap is only “possible.”</p>}
      <EvidenceList ids={[...activeWindows(a), ...activeWindows(b)].flatMap((w) => w.evidenceIds)} toneOf={(e) => ROLE_TONE(e, a, b)} />
      {/* keyed by pair: each pair's what-if starts "as planned" */}
      <WhatIfBoundary key={m.id}>
        <WhatIf key={m.id} m={m} />
      </WhatIfBoundary>
    </Section>
  );
}

function Windows({ p, role }: { p: Project; role: "a" | "b" }) {
  const groups = displayWindowGroups(p, (id) => IDX.source(id)?.publisher);
  return (
    <div>
      <ProjectLabel p={p} role={role} />
      <div className="mt-1.5 space-y-2 pl-3.5">
        {groups.length ? (
          groups.map(({ ws, sourceIds }) => {
            const coarse = ws.some((w) => !w.continuous);
            const src = windowSourceText(ws, IDX);
            const meta = `${sourceIds.length > 1 ? `${sourceIds.length} documents · ` : ""}${ws.length > 1 ? `${ws.length} components` : `${ws.some((w) => w.start.label || w.end.label) ? "season" : precisionLabel(coarsest(ws))} precision`}${coarse ? " · coarse" : ""}`;
            const notes = ws.map(windowNote).filter(Boolean);
            const tip = [...windowDocs(ws, sourceIds), `${src} · ${meta}`, ...notes].join("\n");
            return (
              <div key={ws[0].id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="num text-ui whitespace-nowrap text-fg-1">{windowGroupText(ws)}</span>
                  <Tooltip content={<span className="line-clamp-[10] whitespace-pre-line">{tip}</span>}>
                    <span tabIndex={0} className="min-w-0 cursor-help truncate text-right text-caption text-fg-3">
                      {src} · {meta}
                    </span>
                  </Tooltip>
                </div>
                {ws.length === 1 && notes[0] && <ClampedNote text={notes[0]} />}
              </div>
            );
          })
        ) : (
          <p className="text-caption text-fg-3">No published construction window</p>
        )}
      </div>
    </div>
  );
}

/** A window's note under its schedule row: two lines, the rest on demand (full text stays in the DOM). */
function ClampedNote({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <p className="mt-1 text-caption text-fg-3">
      <span ref={ref} className={open ? "block" : "line-clamp-2"}>
        {text}
      </span>
      {(clipped || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-chip font-medium text-fg-2 hover:text-fg-1">
          {open ? "less" : "more"}
        </button>
      )}
    </p>
  );
}

/* ────────────────────────────────────── Coordination on record ────────────────────────────────────── */

export function CoordinationSection({ m, a, b, pulse }: { m: Match; a: Project; b: Project; pulse?: number }) {
  const hasResourceSharing = m.coordination.some((c) => c.scope === "resource-sharing");
  const who = (
    <>
      <span className="text-fg-1">{ownerFull(a)}</span> and <span className="text-fg-1">{ownerFull(b)}</span>
    </>
  );
  return (
    <Section
      id="coordination"
      icon={<Handshake />}
      title="Coordination on record"
      level={
        m.coordination.length ? (
          <span className="inline-flex items-center gap-1 text-caption font-medium text-ok">
            <Check aria-hidden size={12} strokeWidth={2} /> documented
          </span>
        ) : (
          <span className="text-caption text-fg-3">none found</span>
        )
      }
      pulse={pulse}
    >
      {m.coordination.length ? (
        <>
          <p className="text-ui text-pretty text-fg-2">
            {who}: documented — this is a known interface, not a new discovery.
          </p>
          <ul className="space-y-2.5">
            {m.coordination.map((c, i) => (
              <CoordinationItem key={i} scope={SCOPE_LABEL[c.scope]} text={c.description} />
            ))}
          </ul>
          {!hasResourceSharing && (
            <p className="text-caption text-pretty text-fg-3">
              <span className="text-fg-2">Shared crews or equipment: not established</span> in the reviewed sources. The existing coordination covers what is quoted — nothing
              more.
            </p>
          )}
          <EvidenceList ids={m.coordination.flatMap((c) => c.evidenceIds)} tone="known" />
        </>
      ) : (
        <>
          <p className="text-ui text-pretty text-fg-2">No coordination between {who} was found in the reviewed sources.</p>
          <p className="text-caption text-pretty text-fg-3">
            That is an <em>unknown</em> status — not evidence that the utilities are uncoordinated. Planners should check unpublished arrangements before outreach.
          </p>
        </>
      )}
    </Section>
  );
}

function CoordinationItem({ scope, text }: { scope: string; text: string }) {
  const [more, setMore] = useState(false);
  const short = firstSentence(text, 28);
  return (
    <li className="text-ui text-pretty text-fg-1">
      <span className="num mr-2 inline-flex h-5 translate-y-[-1px] items-center rounded-chip bg-fill-2 px-1.5 align-middle text-[11px] font-medium tracking-[0.02em] text-fg-2 uppercase">
        {scope}
      </span>
      {more ? text : short}
      {short !== text && (
        <button type="button" onClick={() => setMore((x) => !x)} aria-expanded={more} className="ml-1 rounded-chip text-caption font-medium text-fg-3 hover:text-fg-1">
          {more ? "less" : "more"}
        </button>
      )}
    </li>
  );
}

/* ────────────────────────────────────── Rough impact estimate ────────────────────────────────────── */

export function ImpactSection({ m, pulse }: { m: Match; pulse?: number }) {
  return (
    <Section id="impact" icon={<Calculator />} title="Rough impact estimate" level={<span className="text-caption text-fg-3">illustrative · never summed</span>} pulse={pulse}>
      <ImpactEstimate m={m} />
    </Section>
  );
}

/* ────────────────────────────────────── Sources disagree ────────────────────────────────────── */

export function disagreementsOf(a: Project, b: Project): { p: Project; d: Disagreement; role: "a" | "b" }[] {
  return [
    ...(a.disagreements ?? []).map((d) => ({ p: a, d, role: "a" as const })),
    ...(b.disagreements ?? []).map((d) => ({ p: b, d, role: "b" as const })),
  ];
}

export function ConflictSection({ m, a, b, pulse }: { m: Match; a: Project; b: Project; pulse?: number }) {
  const set = useAtlas((s) => s.set);
  const focus = useAtlas((s) => s.focusConflict);
  const focused = useRef<HTMLDivElement>(null);
  const hit = (c: Conflict) => !!focus && conflictMatches(c, focus);
  // the conflict a caller points at (e.g. the guided demo) leads the list and is scrolled to
  const list = [...m.conflicts].sort((x, y) => Number(hit(y)) - Number(hit(x)));
  const hasFocus = !!list[0] && hit(list[0]);
  const others = disagreementsOf(a, b);
  const { live, revised } = conflictSplit(m);
  useEffect(() => {
    if (!hasFocus) return;
    const t = setTimeout(() => {
      // the focused conflict leads the list, so the section's own top (title, count line, then that conflict) is the target
      const el = focused.current?.closest<HTMLElement>("[data-section]");
      const scroller = el?.closest<HTMLElement>("[data-inspector-scroll]");
      if (!el || !scroller) return;
      scrollInspectorTo(scroller, el, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }, 120);
    return () => clearTimeout(t);
  }, [focus, hasFocus]);
  const roleOf = (projectId: string): "a" | "b" => (projectId === a.id ? "a" : "b");
  const counts = [
    `${revised} date${revised === 1 ? "" : "s"} revised by a newer edition`,
    `${live} current disagreement${live === 1 ? "" : "s"}`,
    ...(others.length ? [`${others.length} ${others.length === 1 ? `${others[0].d.field} disagreement` : "scope or owner disagreements"}`] : []),
  ];
  return (
    <Section
      id="conflicts"
      icon={<AlertTriangle />}
      title="Sources disagree"
      level={<span className="num text-caption text-fg-3">{m.conflicts.length + others.length} kept</span>}
      pulse={pulse}
    >
      <p className="text-caption text-fg-3">{counts.join(" · ")}</p>
      {list.map((c) => {
        const p = IDX.project(c.projectId);
        const focusedHere = hit(c);
        return (
          <div
            key={c.id}
            ref={focusedHere && c === list[0] ? focused : undefined}
            data-conflict-id={c.id}
            className={clsx("relative", focusedHere && "pl-3.5")}
            onMouseEnter={() => set({ highlightConflict: true })}
            onMouseLeave={() => set({ highlightConflict: false })}
            onFocusCapture={() => set({ highlightConflict: true })}
            onBlurCapture={() => set({ highlightConflict: false })}
          >
            {focusedHere && <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 rounded-full bg-warn" />}
            <div className="flex min-w-0 items-center gap-2">
              <UtilityDot utility={roleOf(c.projectId)} />
              <span className="min-w-0 truncate text-caption text-fg-2">
                {p.shortTitle} · <span className="text-fg-1">{c.field === "completion" ? "completion / in-service date" : "construction window"}</span>
              </span>
              <span className="ml-auto shrink-0">
                {c.versionOnly ? (
                  <Tag tone="muted">Date revised</Tag>
                ) : (
                  <Tag tone="warn" icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} />}>
                    Sources disagree
                  </Tag>
                )}
              </span>
            </div>
            <div className={clsx("mt-2 grid rounded-card bg-fill-1", c.sides.length >= 2 ? "grid-cols-2 divide-x divide-divider" : "grid-cols-1")}>
              {c.sides.map((side) => (
                <SideCell key={side.value + side.sourceIds.join()} p={p} side={side} field={c.field} />
              ))}
            </div>
            <p className="mt-2 text-caption text-pretty text-fg-3">
              {c.field === "constructionWindow" ? "Windows differ by source; the engine evaluated every source combination before calling the TIME signal." : completionNote(c, p)}
            </p>
          </div>
        );
      })}
      {others.map(({ p, d, role }, i) => (
        <div key={`${p.id}-${i}`}>
          <div className="flex min-w-0 items-center gap-2">
            <UtilityDot utility={role} />
            <span className="min-w-0 truncate text-caption text-fg-2">
              {p.shortTitle} · <span className="text-fg-1">{d.field === "owner" ? "owner" : "scope"}</span>
            </span>
            <span className="ml-auto shrink-0">
              <Tag tone="warn" icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} />}>
                Sources disagree
              </Tag>
            </span>
          </div>
          <div className={clsx("mt-2 grid rounded-card bg-fill-1", d.sides.length >= 2 ? "grid-cols-2 divide-x divide-divider" : "grid-cols-1")}>
            {d.sides.map((s) => {
              const e = IDX.evidenceList(s.evidenceIds)[0];
              const src = e ? IDX.source(e.sourceId) : IDX.source(s.sourceIds[0]);
              const href = e ? evidenceHref(e, src) : src?.url;
              return (
                <div key={s.value} className="flex min-w-0 flex-col gap-1.5 p-3">
                  <div className="text-ui font-medium text-fg-1">{s.value}</div>
                  <div className="truncate text-caption text-fg-3" title={s.sourceIds.map((id) => IDX.source(id)?.title).join("\n")}>
                    {[...new Set(s.sourceIds.map((id) => IDX.source(id)?.publisher ?? id))].join(" · ")}
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 text-caption font-medium text-fg-2 hover:text-fg-1">
                      Open source{e && pageLabel(e) ? ` · ${pageLabel(e)}` : ""} <ExternalLink aria-hidden size={11} strokeWidth={1.75} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-caption text-pretty text-fg-3">{d.description}</p>
        </div>
      ))}
    </Section>
  );
}

/** What a completion disagreement does to TIME: a date that ends a current window feeds the window match; the in-service gap always uses the current date. */
function completionNote(c: Conflict, p: Project): string {
  const cur = currentInService(p);
  const gap = cur ? `the in-service gap (secondary signal) uses the current date, ${formatBound(cur.date)}` : "no in-service gap is computed";
  const bound = c.sides.filter((s) => s.claimIds.some((id) => c.boundClaimIds?.includes(id)));
  const old = c.sides.filter((s) => s.earlier).map((s) => s.value);
  const history = `the superseded date${old.length > 1 ? "s" : ""} from the older source${old.length > 1 ? "s" : ""} (${old.join(", ")}) ${old.length > 1 ? "are" : "is"} kept as version history`;
  if (!c.affectsMatch || !bound.length) return `All claims are kept. These dates do not bound a construction window; ${gap}${c.versionOnly ? `, and ${history}` : ""}.`;
  if (c.versionOnly)
    return `All claims are kept. The current date, ${bound[0].value}, also falls within the end of this project's current schedule window, so it feeds the TIME match and the in-service gap; ${history}.`;
  // a side whose sources publish no window is kept for review but never matched (e.g. AEP's 2034 for BECI)
  const windowed = new Set(activeWindows(p).map((w) => w.claimSourceId));
  const unwindowed = c.sides.filter((s) => !s.sourceIds.some((id) => windowed.has(id)));
  if (unwindowed.length) {
    const vals = (xs: typeof c.sides) => xs.map((s) => s.value).join(" and ");
    const many = unwindowed.length > 1;
    return `All claims are kept. Only ${vals(bound)} comes with a schedule window, so the TIME match uses it; ${vals(unwindowed)} ${many ? "have" : "has"} no window of ${many ? "their" : "its"} own and ${many ? "are" : "is"} kept for review but not matched. ${gap[0].toUpperCase()}${gap.slice(1)}.`;
  }
  const n = new Set(bound.flatMap((s) => s.sourceIds)).size;
  return `All claims are kept. ${bound.map((s) => s.value).join(" and ")} also falls within the end of ${n > 1 ? "those sources' own schedule windows" : "its source's own schedule window"}; the window match evaluates every source combination, so ${c.sides.length > 2 ? "no date is picked over the others" : "neither date is picked over the other"}. ${gap[0].toUpperCase()}${gap.slice(1)}.`;
}

function SideCell({ p, side, field }: { p: Project; side: ConflictSide; field: Conflict["field"] }) {
  // in the side's own claim order, so the excerpt and link come from the claim whose value is shown
  const claims: { id: string; evidenceIds: string[] }[] = field === "completion" ? p.completionClaims : p.constructionWindows;
  const evs = IDX.evidenceList(side.claimIds.flatMap((id) => claims.find((c) => c.id === id)?.evidenceIds ?? []));
  // the quote shown is one that states the value: it names the side's year (and, for a completion, says in-service/complete)
  const yr = side.value.match(/\b(?:19|20)\d\d\b/g)?.at(-1);
  const states = (x: Evidence) => !!yr && (x.exactExcerpt.includes(yr) || new RegExp(`\\d/${yr.slice(2)}(?![\\d/])`).test(x.exactExcerpt));
  const e = evs.find((x) => states(x) && (field !== "completion" || /in[- ]?service|complet/i.test(x.exactExcerpt))) ?? evs.find(states) ?? evs[0];
  const srcs = side.sourceIds.map((id) => IDX.source(id)).filter(Boolean);
  const first = e ? IDX.source(e.sourceId) : srcs[0];
  const pubs = [...new Set(srcs.map((s) => s!.publisher))];
  return (
    <div className="flex min-w-0 flex-col gap-1.5 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={clsx("num text-heading font-medium whitespace-nowrap", side.earlier ? "text-fg-2" : "text-fg-1")}>{side.value}</span>
        {side.earlier && <span className="text-caption text-fg-3">superseded</span>}
      </div>
      <div className="space-y-0.5">
        {pubs.map((pub) => {
          const docs = srcs.filter((s) => s!.publisher === pub);
          return (
            <div key={pub} className="truncate text-caption text-fg-3" title={docs.map((d) => d!.title).join("\n")}>
              {pub}
              {docs.length > 1 && ` · ${docs.length} docs`}
            </div>
          );
        })}
      </div>
      {e && <p className="line-clamp-4 text-caption text-pretty text-fg-2">“{e.exactExcerpt}”</p>}
      {first && e && (
        <a
          href={evidenceHref(e, first)}
          target="_blank"
          rel="noreferrer"
          className="mt-auto inline-flex items-center gap-1 pt-0.5 text-caption font-medium text-fg-2 transition-colors hover:text-fg-1"
        >
          Open source{pageLabel(e) ? ` · ${pageLabel(e)}` : ""} <ExternalLink aria-hidden size={11} strokeWidth={1.75} />
        </a>
      )}
    </div>
  );
}

/* ────────────────────────────────────── Research notes, Public sources ────────────────────────────────────── */

export function NotesSection({ a, b }: { a: Project; b: Project }) {
  const rows = (
    [
      [a, "a"],
      [b, "b"],
    ] as const
  )
    .map(([p, role]) => ({ p, role, notes: p.caveats.map((c) => readableNote(c, IDX)).filter(Boolean) }))
    .filter((r) => r.notes.length);
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.notes.length, 0);
  return (
    <section aria-label="Research notes" className="border-t border-divider py-2">
      <Disclosure
        summary={<span className="text-body font-semibold text-fg-1">Research notes</span>}
        meta={`${total} note${total === 1 ? "" : "s"}`}
        buttonClassName="min-h-10"
        contentClassName="space-y-3.5 pt-1 pb-4"
      >
        {rows.map(({ p, role, notes }) => (
          <div key={p.id}>
            <ProjectLabel p={p} role={role} />
            <ul className="mt-1.5 space-y-1.5 pl-3.5">
              {notes.map((c, i) => (
                <li key={i} className="text-caption text-pretty text-fg-2">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-caption text-fg-3">Qualifications recorded while reading and geocoding the sources.</p>
      </Disclosure>
    </section>
  );
}

export function SourcesSection({ m, a, b, pulse }: { m: Match; a: Project; b: Project; pulse?: number }) {
  const ids = new Set([...matchSourceIds(m, IDX), ...a.sourceIds, ...b.sourceIds]);
  const sources = [...ids].map((id) => IDX.source(id)).filter(Boolean);
  return (
    <Section id="sources" icon={<Library />} title="Public sources" level={<span className="num text-caption text-fg-3">{sources.length}</span>} pulse={pulse}>
      <div className="-mx-2.5 -my-1">
        {sources.map((s) => (
          <SourceRow key={s!.id} s={s!} />
        ))}
      </div>
      <p className="text-caption text-pretty text-fg-3">
        Snapshot {formatDate(IDX.snapshotDate)} · excerpts are short quotations with page anchors; full documents stay with their publishers.
      </p>
    </Section>
  );
}

