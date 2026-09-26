"use client";

import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { ImpactAssumption, Match } from "@/lib/domain/types";
import { type ChannelBasis, type ImpactChannel, computeImpact, formatUsd, formatUsdRange, impactChannels, impactDefaults, impactPortfolio, workKind } from "@/lib/impact";
import { evidenceHref, pageLabel } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { Disclosure, Tooltip } from "./ui";

/**
 * "Rough impact estimate" (sponsor bonus, SPEC §5.3): one compact row per channel — label, "up to ≈ $X", a basis tag
 * (stated / conditional / context, with its definition) and the dollar year. How each row is estimated (note, formula,
 * citations) and the right-of-way calculator sit one disclosure away. Rows are never added together: there is no total.
 */

const BASIS: Record<ChannelBasis, string> = {
  stated: "A cited source states the sharing; the dollar comparison rests on our stated assumption.",
  conditional: "An upper bound: only if something no source here shows actually happens.",
  context: "Scale for a planner, not a saving.",
};

function BasisTag({ basis, text }: { basis: ChannelBasis; text?: string }) {
  return (
    <Tooltip content={BASIS[basis]}>
      <span
        tabIndex={0}
        className={clsx(
          "num inline-flex h-5 shrink-0 cursor-help items-center rounded-chip px-1.5 text-[11px] font-medium",
          basis === "stated" ? "bg-fill-3 text-fg-1" : "bg-fill-2 text-fg-2",
        )}
      >
        {text ?? basis}
      </span>
    </Tooltip>
  );
}

function Cite({ a, id, page }: { a?: ImpactAssumption; id?: string; page?: boolean }) {
  if (!a && !id) return <span className="text-caption text-fg-3">no sourced default</span>;
  const e = IDX.evidence(id ?? a!.evidenceIds[0]);
  const src = e ? IDX.source(e.sourceId) : undefined;
  const href = e ? evidenceHref(e, src) : undefined;
  const text = `${src?.publisher ?? "source"}${(id || page) && e && pageLabel(e) ? `, ${pageLabel(e)}` : ""}`;
  const tip = e ? `“${e.exactExcerpt}” — ${src?.publisher}${pageLabel(e) ? `, ${pageLabel(e)}` : ""}${a?.note ? `\n\n${a.note}` : ""}` : undefined;
  const link = (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full min-w-0 items-center gap-1 text-caption text-fg-3 transition-colors duration-150 hover:text-fg-1"
    >
      <span className="truncate">{text}</span>
      <ExternalLink aria-hidden size={11} strokeWidth={1.75} className="shrink-0" />
    </a>
  );
  return tip ? (
    <Tooltip content={<span className="line-clamp-6 whitespace-pre-line">{tip}</span>} side="top">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** One link per cited excerpt: several table columns (e.g. MISO p. 42) share one quote. */
const uniqueCites = (as: ImpactAssumption[], skip: string[] = []) => as.filter((a, i) => !skip.includes(a.evidenceIds[0]) && as.findIndex((x) => x.evidenceIds[0] === a.evidenceIds[0]) === i);

function channelValue(c: ImpactChannel, coBuilt: boolean): string {
  if (c.key === "outage") return "not priced";
  if (!c.usd) return "";
  if (c.upTo) return `${coBuilt ? "≈" : "up to ≈"} ${formatUsd(c.usd[1])}`;
  return `≈ ${formatUsdRange(c.usd)}`;
}

function ChannelRow({ c, coBuilt }: { c: ImpactChannel; coBuilt: boolean }) {
  const value = channelValue(c, coBuilt);
  return (
    <div className="py-3" data-channel={c.key}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ui font-medium text-pretty text-fg-1">{c.label}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <BasisTag basis={c.basis} />
            {c.dollars && c.usd && <span className="text-caption text-fg-3">{c.dollars}</span>}
          </div>
        </div>
        {value && (
          <span className={clsx("num shrink-0 pt-px text-right text-ui", c.basis === "stated" ? "font-medium text-fg-1" : "text-fg-2")}>
            {value}
            {c.acres && c.key !== "corridor" && <span className="block text-caption text-fg-3">{c.acres[0] === c.acres[1] ? c.acres[0] : `${c.acres[0]}–${c.acres[1]}`} acres</span>}
          </span>
        )}
      </div>
      {c.parts && (
        <ul className="mt-2 space-y-1.5">
          {c.parts.map((p) => (
            <li key={p.projectId} className="text-caption text-pretty text-fg-2">
              {p.text}
              <span className="ml-1.5 inline-flex flex-wrap gap-x-2 align-baseline">
                {p.evidenceIds.slice(0, 1).map((id) => (
                  <Cite key={id} id={id} />
                ))}
                {uniqueCites(p.assumptions, p.evidenceIds).map((a) => (
                  <Cite key={a.key} a={a} page />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Disclosure variant="inline" summary={<span className="text-caption">How this is estimated</span>} className="mt-1.5 [&>div]:grid-cols-[minmax(0,1fr)]" contentClassName="space-y-1.5 pt-1.5">
        <p className="text-caption text-pretty text-fg-2">{c.note}</p>
        {c.key !== "outage" && <p className="num text-[11px] text-fg-3">{c.formula}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {c.evidenceIds.map((id) => (
            <Cite key={id} id={id} />
          ))}
          {uniqueCites(c.assumptions, c.evidenceIds).map((a) => (
            <Cite key={a.key} a={a} page />
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

/** Region-wide upper bound at the current radius: each project counted once, in its highest-ranked pair. */
function Portfolio({ m }: { m: Match }) {
  const run = useAtlas((s) => s.run);
  const region = IDX.project(m.projectAId)?.region;
  const pf = useMemo(() => (run && region ? impactPortfolio(run.matches, region) : null), [run, region]);
  if (!run || !pf?.eligiblePairs) return null;
  const counted = pf.pairs.some((p) => p.id === m.id);
  return (
    <div className="rounded-card bg-fill-1 p-3.5" data-testid="impact-portfolio">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ui font-medium text-fg-1">Region portfolio · upper bound, never summed</p>
          <p className="mt-0.5 text-caption text-fg-3">
            {SNAPSHOT.regions.find((r) => r.id === region)?.label ?? region} · <span className="num">{run.thresholdMiles} mi</span>
          </p>
        </div>
        <BasisTag basis="conditional" text="upper bound" />
      </div>
      <p className="mt-2 text-caption text-pretty text-fg-2">
        {pf.eligiblePairs} needs-review lead{pf.eligiblePairs === 1 ? "" : "s"} whose windows could overlap. Each project is counted once, in its highest-ranked pair; nothing
        is added across rows. Scenario ceilings, not savings.
      </p>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-caption">
        <dt className="text-fg-3">Staging together</dt>
        <dd className="text-fg-2">
          <span className="num text-fg-1">up to ≈ {formatUsd(pf.stagingUsd)}</span> · {pf.pairs.length} disjoint pair{pf.pairs.length === 1 ? "" : "s"} · MISO 2018 $
        </dd>
        <dt className="text-fg-3">New right-of-way</dt>
        <dd className="text-fg-2">
          <span className="num text-fg-1">{pf.corridorAcres < 10 ? pf.corridorAcres.toFixed(1) : Math.round(pf.corridorAcres)}</span> acres shared by default
        </dd>
        <dt className="text-fg-3">Capital in scope</dt>
        <dd className="space-y-0.5 text-fg-2">
          {pf.capital.map((l) => (
            <div key={`${l.owner}|${l.kind}|${l.sourceId ?? ""}`} title={l.sourceId ? IDX.source(l.sourceId)?.title : undefined}>
              {l.kind === "published"
                ? `${l.owner}: ${formatUsdRange(l.usd!, l.atLeast)} published (${l.projects} project${l.projects === 1 ? "" : "s"})`
                : l.kind === "proxy"
                  ? `${l.owner}: ≈ ${formatUsdRange(l.usd!)} proxy for ${l.projects} redacted line${l.projects === 1 ? "" : "s"}, ${l.miles} mi (mixed $/mile benchmarks)`
                  : `${l.owner}: ${l.projects} more with no cost or proxy`}
            </div>
          ))}
        </dd>
      </dl>
      <p className="mt-2.5 text-caption text-fg-3">
        {counted
          ? "This pair's staging ceiling is one of those counted."
          : m.reviewStatus === "needs-review" && m.time !== "no-match"
            ? "This pair's staging is not counted: one of its projects is already counted in a higher-ranked pair."
            : "This pair is outside the portfolio (only needs-review leads whose windows could overlap count)."}
      </p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  a,
  format,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  a?: ImpactAssumption;
  format?: (v: number) => string;
  /** The default comes from project facts rather than an assumption: show this note instead of a citation (null: nothing). */
  note?: string | null;
}) {
  const id = `impact-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const fill = `${Math.round(((value - min) / (max - min || 1)) * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="min-w-0 text-caption text-fg-2">
          {label}
        </label>
        <span className="num shrink-0 text-ui text-fg-1">
          {format ? format(value) : value}
          {unit && <span className="text-fg-3"> {unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range mt-1"
        style={{ "--range-fill": fill } as CSSProperties}
      />
      <div className="flex justify-between gap-2">
        {note === undefined ? <Cite a={a} /> : note ? <span className="text-caption text-pretty text-fg-3">{note}</span> : <span />}
        {a && (a.low !== undefined || a.high !== undefined) && (
          <span className="num shrink-0 text-[11px] text-fg-3">
            source range {(a.low ?? a.typical).toLocaleString("en-US")}–{(a.high ?? a.typical).toLocaleString("en-US")}
          </span>
        )}
      </div>
    </div>
  );
}

export function ImpactEstimate({ m }: { m: Match }) {
  const d = useMemo(() => impactDefaults(m), [m]);
  const [miles, setMiles] = useState(Math.round(d.sharedMiles * 10) / 10);
  const [width, setWidth] = useState(d.rowWidthFt?.typical ?? 100);
  const [value, setValue] = useState(d.landValue?.typical ?? 5000);
  const [easement, setEasement] = useState(d.easement?.typical ?? 1);
  const [valueTouched, setValueTouched] = useState(false);
  const r = computeImpact({ sharedMiles: miles, rowWidthFt: width, landValuePerAcre: value, easementShare: easement }, d);
  const valueSourced = !!d.landValue || valueTouched;
  const classNote = d.widthClass && d.widthClass !== String(d.voltageKv) ? ` · ${d.widthClass} kV class (nearest published)` : "";
  const channels = useMemo(() => impactChannels(m).filter((c) => c.key !== "corridor"), [m]);
  // staging is "≈" rather than "up to" only when the user sets a shared corridor for two line jobs (the cited co-building case)
  const coBuilt = miles > 0 && [m.projectAId, m.projectBId].every((id) => workKind(IDX.project(id)).startsWith("line"));
  const maxMiles = Math.max(5, Math.ceil(Math.max(d.lengthA ?? 0, d.lengthB ?? 0, m.geoDetail.center?.miles ?? 0, 10)));
  const acresText = r.acres < 10 ? r.acres.toFixed(1) : String(Math.round(r.acres));

  return (
    <div>
      {/* one row per channel: each with its own dollar basis and label, never added together */}
      <div className="divide-y divide-divider">
        {channels.map((c) => (
          <ChannelRow key={c.key} c={c} coBuilt={coBuilt} />
        ))}

        <div className="py-3" data-channel="corridor">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-ui font-medium text-fg-1">Shared new right-of-way</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <BasisTag basis="conditional" />
                <span className="text-caption text-fg-3">2026 USDA land value</span>
              </div>
            </div>
            <span className="num shrink-0 pt-px text-right text-ui text-fg-2">
              {r.acres === 0 ? "0 acres" : `${acresText} acres`}
              <span className="block text-caption text-fg-3">
                {r.acres === 0 ? "by default" : valueSourced ? `≈ ${formatUsd(r.landValueUsd)}` : "no sourced land value"}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-caption text-pretty text-fg-3">{d.sharedMilesNote}</p>
          <Disclosure variant="inline" summary={<span className="text-caption">Adjust corridor assumptions</span>} className="mt-1.5 [&>div]:grid-cols-[minmax(0,1fr)]" contentClassName="space-y-3.5 pt-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-control bg-fill-1 px-3 py-2.5">
                <div className="num text-title font-medium text-fg-1">{acresText}</div>
                <div className="mt-1 text-caption text-fg-3">acres of right-of-way not encumbered twice</div>
                {r.acresRange && (
                  <div className="num mt-1 text-[11px] text-fg-3">
                    range {Math.round(r.acresRange[0])}–{Math.round(r.acresRange[1])}
                  </div>
                )}
              </div>
              <div className="rounded-control bg-fill-1 px-3 py-2.5">
                <div className="num text-title font-medium text-fg-1">{valueSourced ? formatUsd(r.landValueUsd) : "—"}</div>
                <div className="mt-1 text-caption text-fg-3">
                  {valueSourced ? (d.landValue ? "right-of-way value at those assumptions" : "right-of-way value at your land value") : `no sourced land value for ${d.state || "this state"} — set one below`}
                </div>
                {valueSourced && d.landValue && r.landValueRange && (
                  <div className="num mt-1 text-[11px] text-fg-3">
                    range {formatUsd(r.landValueRange[0])}–{formatUsd(r.landValueRange[1])}
                  </div>
                )}
              </div>
            </div>
            <Slider label="Shared corridor length" value={miles} min={0} max={maxMiles} step={0.1} unit="mi" onChange={setMiles} format={(v) => v.toFixed(1)} note={null} />
            <Slider label={`Right-of-way width${d.voltageKv ? ` (${d.voltageKv} kV${classNote})` : ""}`} value={width} min={50} max={250} step={5} unit="ft" onChange={setWidth} a={d.rowWidthFt} />
            <Slider
              label={d.landValue ? "Land value" : "Land value (your input)"}
              value={value}
              min={500}
              max={20000}
              step={100}
              unit="$/acre"
              onChange={(v) => {
                setValue(v);
                setValueTouched(true);
              }}
              a={d.landValue}
              format={(v) => v.toLocaleString("en-US")}
            />
            <Slider label="Right-of-way cost as share of land value" value={easement} min={0.1} max={1.2} step={0.05} unit="" onChange={setEasement} a={d.easement} format={(v) => `${Math.round(v * 100)}%`} />
          </Disclosure>
        </div>
      </div>

      <div className="mt-2">
        <Portfolio m={m} />
      </div>

      <p className="mt-3 text-caption text-pretty text-fg-3">
        Illustrative scenario, one row per channel: stated = a source states the sharing (the dollar comparison is our assumption); conditional = an upper bound that needs
        something no source shows; context = scale, not a saving. Rows are never added together: they use different dollar years. Defaults are cited public numbers (links
        above), anything unsourced is marked, and the right-of-way inputs are editable. Cost guides from other regions (MISO) are only indicative.
      </p>
    </div>
  );
}
