"use client";

import clsx from "clsx";
import { Calculator, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { IDX } from "@/lib/data";
import type { ImpactAssumption, Match } from "@/lib/domain/types";
import { computeImpact, formatUsd, impactDefaults } from "@/lib/impact";
import { evidenceHref, pageLabel } from "@/lib/selectors";

function Cite({ a }: { a?: ImpactAssumption }) {
  if (!a) return <span className="text-[10px] text-text-3">no sourced default</span>;
  const e = IDX.evidence(a.evidenceIds[0]);
  const src = e ? IDX.source(e.sourceId) : undefined;
  const href = e ? evidenceHref(e, src) : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={e ? `“${e.exactExcerpt}” — ${src?.publisher}${pageLabel(e) ? `, ${pageLabel(e)}` : ""}${a.note ? `\n\n${a.note}` : ""}` : undefined}
      className="inline-flex max-w-full items-center gap-1 truncate text-[10px] text-text-3 hover:text-a"
    >
      <span className="truncate">{src?.publisher ?? "source"}</span>
      <ExternalLink size={9} className="shrink-0" />
    </a>
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
  const staging = m.time !== "no-match";
  const maxMiles = Math.max(5, Math.ceil(Math.max(d.lengthA ?? 0, d.lengthB ?? 0, m.geoDetail.center?.miles ?? 0, 10)));
  const mobil = d.mobilization;

  return (
    <div className="space-y-3">
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

      {mobil && staging && (
        <div className="rounded-lg bg-bg-2/60 p-3 text-[11.5px] leading-snug text-text-1 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-text-0">Staging both jobs together</span>
            {/* without a shared corridor the saving is conditional on co-located work no source shows */}
            <span className={clsx("num text-[13px]", miles > 0 ? "text-text-0" : "text-text-3")}>
              {miles > 0 ? "≈" : "up to ≈"}
              {formatUsd(mobil.typical * (d.avoidedMobilizations?.typical ?? 1))}
            </span>
          </div>
          <p className="mt-1 text-text-2">
            If both jobs were actually staged together — which no source here establishes — one crew mobilization could be avoided, priced at MISO&apos;s {d.mobilClass}{" "}
            kV-class unit cost{d.mobilClass !== d.voltageClass ? ", the highest class it publishes" : ""}
            {mobil.unit.match(/(\d{4}) \$/) ? ` (${mobil.unit.match(/(\d{4}) \$/)![1]} dollars, before overhead and contingency)` : ""}.
            {d.avoidedMobilizations &&
              " A joint proposed order filed in a South Carolina PSC docket (summarizing utility testimony) states that building two lines that share the same structures at the same time avoids mobilizing crews twice; no source shows these two projects share structures or work sites."}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <Cite a={mobil} />
            {d.avoidedMobilizations && <Cite a={d.avoidedMobilizations} />}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-text-3">
        <Calculator size={11} className="mt-0.5 shrink-0" />
        Illustrative scenario: acres = miles × 5,280 × width ÷ 43,560; value = acres × $/acre × share. Defaults are cited public numbers where one exists (links above); anything
        unsourced is marked, and every input is editable. This is not a measured or promised saving — most listed projects are rebuilds on existing right-of-way, and cost guides
        from other regions are only indicative.
      </p>
    </div>
  );
}
