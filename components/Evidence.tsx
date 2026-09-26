"use client";

import clsx from "clsx";
import { BadgeCheck, ExternalLink, FileText, Globe, Landmark, Network, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { IDX } from "@/lib/data";
import type { Evidence, SourceDocument } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { useReview } from "@/lib/review";
import { evidenceHref, pageLabel } from "@/lib/selectors";
import { provenanceSummary } from "./inspector/facts";
import { Tooltip } from "./ui";

/**
 * Evidence primitives (SPEC §5.3): a quote is body text with a 2px rule in the owning utility's colour, a source caption
 * (publisher link + mono page) and a provenance icon. Provenance is said once per section (EvidenceList's caption line);
 * each excerpt carries it as an icon + tooltip. Reviewer mode adds "Mark checked" / "✓ checked" on every excerpt.
 */

export type EvidenceTone = "a" | "b" | "amber" | "neutral" | "known" | "conflict";

const TONE: Record<EvidenceTone, string> = {
  a: "var(--util-a)",
  b: "var(--util-b)",
  // an excerpt about both projects (a shared site, a relation): neutral, amber stays for the map's overlap marks
  amber: "var(--fg-4)",
  neutral: "var(--fg-4)",
  known: "var(--ok)",
  conflict: "var(--warn)",
};

export function EvidenceCard({ e, tone = "neutral", compact }: { e: Evidence; tone?: EvidenceTone; compact?: boolean }) {
  const src = IDX.source(e.sourceId);
  const href = evidenceHref(e, src);
  const anchor = pageLabel(e);
  // an HTML section anchor that only repeats the title is not shown (or read out) twice
  const showAnchor = anchor && !(!e.page && src?.title.toLowerCase().includes(anchor.toLowerCase())) ? anchor : undefined;
  return (
    <figure className="relative min-w-0 pl-3.5" data-evidence-id={e.id}>
      <span aria-hidden className="absolute top-0.5 bottom-0.5 left-0 w-0.5 rounded-full" style={{ background: TONE[tone] }} />
      <blockquote className={clsx("text-pretty text-fg-2", compact ? "text-ui" : "text-body")}>
        <span aria-hidden className="text-fg-4">“</span>
        {e.exactExcerpt}
        <span aria-hidden className="text-fg-4">”</span>
      </blockquote>
      <figcaption className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption text-fg-3">
        <SourceIcon type={src?.sourceType} />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={src?.title}
            aria-label={`Open source: ${src?.title ?? e.sourceId}${showAnchor ? `, ${showAnchor}` : ""}`}
            className="group/src inline-flex min-w-0 items-center gap-1 rounded-chip transition-colors duration-150 hover:text-fg-1"
          >
            <span className="min-w-0 truncate">{src?.publisher ?? e.sourceId}</span>
            {showAnchor && <span className="num shrink-0 text-fg-2 group-hover/src:text-fg-1">· {showAnchor}</span>}
            <ExternalLink aria-hidden size={11} strokeWidth={1.75} className="shrink-0 opacity-60 group-hover/src:opacity-100" />
          </a>
        ) : (
          <span className="min-w-0 truncate">
            {src?.publisher ?? e.sourceId}
            {showAnchor && <span className="num text-fg-2"> · {showAnchor}</span>}
          </span>
        )}
        <ProvenanceIcon e={e} />
        <span className="ml-auto shrink-0">
          <CheckToggle id={e.id} />
        </span>
      </figcaption>
    </figure>
  );
}

/** Reviewer mode: mark one excerpt as human-checked in this browser. */
export function CheckToggle({ id }: { id: string }) {
  const enabled = useReview((s) => s.enabled);
  const checked = useReview((s) => !!s.checked[id]);
  const toggle = useReview((s) => s.toggleCheck);
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={checked}
      className={clsx(
        "inline-flex h-6 items-center rounded-full px-2 text-caption font-medium whitespace-nowrap ring-1 ring-inset transition-colors duration-150",
        checked ? "bg-ok/10 text-ok ring-ok/35 hover:bg-ok/15" : "bg-fill-1 text-fg-2 ring-edge hover:bg-fill-2 hover:text-fg-1",
      )}
    >
      {checked ? "✓ checked" : "Mark checked"}
    </button>
  );
}

/** Per-excerpt provenance as an icon; the words are in the tooltip (the section says them once). */
function ProvenanceIcon({ e }: { e: Evidence }) {
  const mine = useReview((s) => !!s.checked[e.id]);
  const method = e.extractionMethod === "model" ? "Model extraction" : e.extractionMethod === "manual" ? "Manual entry" : "Agent-assisted";
  const review = e.reviewedByHuman ? "human-checked" : mine ? "checked by you" : "awaiting human check";
  const located = e.verifiedInSource ? "Excerpt located verbatim in the cached source text" : "Excerpt could not be located automatically";
  const label = `${located} · ${method} · ${review}`;
  const Icon = e.verifiedInSource ? BadgeCheck : ShieldQuestion;
  return (
    <Tooltip
      content={
        <span className="block">
          {label}
          {e.supports && <span className="mt-1 block text-fg-3">Supports: {e.supports}</span>}
        </span>
      }
    >
      <span tabIndex={0} role="img" aria-label={label} className="inline-grid shrink-0 place-items-center rounded-full">
        <Icon aria-hidden size={12} strokeWidth={1.75} className={clsx(e.verifiedInSource ? (e.reviewedByHuman || mine ? "text-ok" : "text-fg-3") : "text-warn")} />
      </span>
    </Tooltip>
  );
}

/** The provenance of a group of excerpts, said once: "located verbatim by script · awaiting human check". */
export function ProvenanceLine({ list, className }: { list: Evidence[]; className?: string }) {
  const mine = useReview((s) => s.checked);
  const text = provenanceSummary(list, mine);
  if (!text) return null;
  const allLocated = list.every((e) => e.verifiedInSource);
  return (
    <p className={clsx("flex items-start gap-1.5 text-caption text-fg-3", className)}>
      {allLocated ? <BadgeCheck aria-hidden size={12} strokeWidth={1.75} className="mt-[3px] shrink-0" /> : <ShieldQuestion aria-hidden size={12} strokeWidth={1.75} className="mt-[3px] shrink-0 text-warn" />}
      <span>
        {list.length === 1 ? "Excerpt" : `${list.length} excerpts`} {text}
      </span>
    </p>
  );
}

/**
 * Excerpts behind one claim: the first `limit` shown, the rest one click away, and the provenance line once.
 * `toneOf` picks each quote's rule colour (the owning utility), unless `tone` fixes it.
 */
export function EvidenceList({
  ids,
  tone,
  toneOf,
  limit = 2,
  compact,
  empty = "No excerpt attached.",
}: {
  ids: string[];
  tone?: EvidenceTone;
  toneOf?: (e: Evidence) => EvidenceTone;
  limit?: number;
  compact?: boolean;
  empty?: string;
}) {
  const [all, setAll] = useState(false);
  const list = IDX.evidenceList([...new Set(ids)]);
  if (!list.length) return <p className="text-caption text-fg-3">{empty}</p>;
  const shown = all ? list : list.slice(0, limit);
  const more = list.length - limit;
  return (
    <div className="space-y-3">
      {shown.map((e) => (
        <EvidenceCard key={e.id} e={e} tone={tone ?? toneOf?.(e) ?? "neutral"} compact={compact} />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <ProvenanceLine list={list} />
        {more > 0 && (
          <button
            type="button"
            onClick={() => setAll((x) => !x)}
            aria-expanded={all}
            className="-mx-1 rounded-chip px-1 text-caption font-medium text-fg-2 transition-colors hover:text-fg-1"
          >
            {all ? "Show fewer" : `Show ${more} more excerpt${more > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}

export function SourceIcon({ type, size = 12 }: { type?: SourceDocument["sourceType"]; size?: number }) {
  const Icon = type === "regulator" ? Landmark : type === "rto" ? Network : type === "utility" ? Globe : FileText;
  return <Icon size={size} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-hidden />;
}

/** One public source as a single link (Source registry + the inspector's "Public sources"): title, publisher · date, mono meta. */
export function SourceRow({ s, count }: { s: SourceDocument; count?: number }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 rounded-control px-2.5 py-2 transition-colors duration-150 hover:bg-fill-2"
    >
      <span className="mt-[3px]">
        <SourceIcon type={s.sourceType} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-fg-1">{s.title}</span>
        <span className="mt-0.5 block truncate text-caption text-fg-2">
          {s.publisher}
          {s.publishedAt && ` · ${formatDate(s.publishedAt)}`}
        </span>
        <span className="num mt-0.5 block truncate text-[11px] text-fg-3">
          {s.mimeType === "application/pdf" ? `PDF${s.pageCount ? ` · ${s.pageCount} pp` : ""}` : "HTML"} · retrieved {formatDate(s.retrievedAt)} · sha256 {s.sha256.slice(0, 6)}…
          {count !== undefined && ` · ${count} excerpt${count === 1 ? "" : "s"}`}
        </span>
      </span>
      <ExternalLink aria-hidden size={12} strokeWidth={1.75} className="mt-[3px] shrink-0 text-fg-3 transition-colors group-hover:text-fg-1" />
    </a>
  );
}
