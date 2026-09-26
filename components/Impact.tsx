"use client";

import clsx from "clsx";
import { Calculator, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { ImpactAssumption, Match } from "@/lib/domain/types";
import { type ChannelBasis, type ImpactChannel, computeImpact, formatUsd, formatUsdRange, impactChannels, impactDefaults, impactPortfolio, workKind } from "@/lib/impact";
import { evidenceHref, pageLabel } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";

function Cite({ a, id, page }: { a?: ImpactAssumption; id?: string; page?: boolean }) {
  if (!a && !id) return <span className="text-[10px] text-text-3">no sourced default</span>;
  const e = IDX.evidence(id ?? a!.evidenceIds[0]);
  const src = e ? IDX.source(e.sourceId) : undefined;
  const href = e ? evidenceHref(e, src) : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={e ? `“${e.exactExcerpt}” — ${src?.publisher}${pageLabel(e) ? `, ${pageLabel(e)}` : ""}${a?.note ? `\n\n${a.note}` : ""}` : undefined}
      className="inline-flex max-w-full items-center gap-1 truncate text-[10px] text-text-3 hover:text-a"
    >
      <span className="truncate">
        {src?.publisher ?? "source"}
        {(id || page) && e && pageLabel(e) ? `, ${pageLabel(e)}` : ""}
      </span>
      <ExternalLink size={9} className="shrink-0" />
    </a>
  );
}

const BASIS: Record<ChannelBasis, string> = {
  stated: "A cited source states the sharing; the dollar comparison rests on our stated assumption.",
  conditional: "An upper bound: only if something no source here shows actually happens.",
  context: "Scale for a planner, not a saving.",
};

function BasisTag({ basis, text }: { basis: ChannelBasis; text?: string }) {
  return (
    <span className="mono inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-bg-3 px-1.5 text-[10px] text-text-2 ring-1 ring-line" title={BASIS[basis]}>
      {text ?? basis}
    </span>
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
  return (
    <div className="rounded-lg bg-bg-2/60 p-3 text-[11.5px] leading-snug text-text-1 ring-1 ring-line" data-channel={c.key}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-text-0">{c.label}</span>
        <span className={clsx("num shrink-0 text-right text-[13px]", c.basis === "stated" ? "text-text-0" : "text-text-2")}>
          {channelValue(c, coBuilt)}
          {c.acres && c.key !== "corridor" && <span className="block text-[10.5px] text-text-3">{c.acres[0] === c.acres[1] ? c.acres[0] : `${c.acres[0]}–${c.acres[1]}`} acres</span>}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <BasisTag basis={c.basis} />
        {c.dollars && c.usd && <span className="text-[10px] text-text-3">{c.dollars}</span>}
      </div>
      {c.parts && (
        <ul className="mt-1.5 space-y-1">
          {c.parts.map((p) => (
            <li key={p.projectId} className="text-text-1">
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
      <p className="mt-1 text-text-2">{c.note}</p>
      {c.key !== "outage" && <p className="mt-1 text-[10.5px] text-text-3">{c.formula}</p>}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {c.evidenceIds.map((id) => (
          <Cite key={id} id={id} />
        ))}
        {uniqueCites(c.assumptions, c.evidenceIds).map((a) => (
          <Cite key={a.key} a={a} page />
        ))}
      </div>
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
    <div className="rounded-lg bg-bg-2/60 p-3 text-[11.5px] leading-snug text-text-1 ring-1 ring-line" data-testid="impact-portfolio">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-text-0">
          Region portfolio · {SNAPSHOT.regions.find((r) => r.id === region)?.label ?? region} · {run.thresholdMiles} mi
        </span>
        <BasisTag basis="conditional" text="upper bound" />
      </div>
      <p className="mt-1 text-text-2">
        {pf.eligiblePairs} needs-review lead{pf.eligiblePairs === 1 ? "" : "s"} whose windows could overlap. Each project is counted once, in its highest-ranked pair; nothing
        is added across rows. Scenario ceilings, not savings.
      </p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-2">Staging together</dt>
        <dd className="num text-text-0">
          up to ≈ {formatUsd(pf.stagingUsd)}
          <span className="text-text-3">
            {" "}
            · {pf.pairs.length} disjoint pair{pf.pairs.length === 1 ? "" : "s"} · MISO 2018 $
          </span>
        </dd>
        <dt className="text-text-2">New right-of-way</dt>
        <dd className="num text-text-0">{pf.corridorAcres < 10 ? pf.corridorAcres.toFixed(1) : Math.round(pf.corridorAcres)} acres shared by default</dd>
        <dt className="text-text-2">Capital in scope</dt>
        <dd className="space-y-0.5 text-text-1">
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
      <p className="mt-1.5 text-[10.5px] text-text-3">
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
  /** The default comes from project facts rather than an assumption; show the note instead of a citation. */
  note?: string;
}) {
  const id = `impact-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11px] text-text-2">
          {label}
        </label>
        <span className="num text-[12px] text-text-0">
          {format ? format(value) : value}
          <span className="text-text-3"> {unit}</span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--text-1)]" />
      <div className="-mt-0.5 flex justify-between gap-2">
        {note ? <span className="text-[10px] leading-snug text-text-3">{note}</span> : <Cite a={a} />}
        {a && (a.low !== undefined || a.high !== undefined) && (
          <span className="num shrink-0 text-[10px] text-text-3">
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
  const r = computeImpact({ sharedMiles: miles, rowWidthFt: width, landValuePerAcre: value, easementShare: easement }, d);
  const [valueTouched, setValueTouched] = useState(false);
  const valueSourced = !!d.landValue || valueTouched;
  const classNote = d.widthClass && d.widthClass !== String(d.voltageKv) ? ` · ${d.widthClass} kV class (nearest published)` : "";
  const channels = useMemo(() => impactChannels(m).filter((c) => c.key !== "corridor"), [m]);
  // staging is "≈" rather than "up to" only when the user sets a shared corridor for two line jobs (the cited co-building case)
  const coBuilt = miles > 0 && [m.projectAId, m.projectBId].every((id) => workKind(IDX.project(id)).startsWith("line"));
  const maxMiles = Math.max(5, Math.ceil(Math.max(d.lengthA ?? 0, d.lengthB ?? 0, m.geoDetail.closest?.miles ?? 0, 10)));

  return (
    <div className="space-y-3">
      {/* one row per channel: each with its own dollar basis and label, never added together */}
      {channels.map((c) => (
        <ChannelRow key={c.key} c={c} coBuilt={coBuilt} />
      ))}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11.5px] font-medium text-text-0">Shared new right-of-way</span>
        <BasisTag basis="conditional" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-bg-2 p-3 ring-1 ring-line">
          <div className="num text-[22px] leading-none text-text-0">{r.acres < 10 ? r.acres.toFixed(1) : Math.round(r.acres)}</div>
          <div className="mt-1 text-[10.5px] leading-tight text-text-2">acres of right-of-way not encumbered twice</div>
          {r.acresRange && (
            <div className="num mt-1 text-[10px] text-text-3">
              range {Math.round(r.acresRange[0])}–{Math.round(r.acresRange[1])}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-bg-2 p-3 ring-1 ring-line">
          <div className="num text-[22px] leading-none text-text-0">{valueSourced ? formatUsd(r.landValueUsd) : "—"}</div>
          <div className="mt-1 text-[10.5px] leading-tight text-text-2">
            {valueSourced ? (d.landValue ? "right-of-way value at those assumptions" : "right-of-way value at your land value") : `no sourced land value for ${d.state || "this state"} — set one below`}
          </div>
          {valueSourced && d.landValue && r.landValueRange && (
            <div className="num mt-1 text-[10px] text-text-3">
              range {formatUsd(r.landValueRange[0])}–{formatUsd(r.landValueRange[1])}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg bg-bg-2/60 p-3 ring-1 ring-line">
        <Slider label="Shared corridor length" value={miles} min={0} max={maxMiles} step={0.1} unit="mi" onChange={setMiles} format={(v) => v.toFixed(1)} note={d.sharedMilesNote} />
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
      </div>

      <Portfolio m={m} />

      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-text-3">
        <Calculator size={11} className="mt-0.5 shrink-0" />
        Illustrative scenario, one row per channel: stated = a source states the sharing (the dollar comparison is our assumption); conditional = an upper bound that needs
        something no source shows; context = scale, not a saving. Rows are never added together: they use different dollar years. Defaults are cited public numbers (links
        above), anything unsourced is marked, and the right-of-way inputs are editable. Cost guides from other regions (MISO) are only indicative.
      </p>
    </div>
  );
}
