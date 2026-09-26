"use client";

import clsx from "clsx";
import { BadgeCheck, ExternalLink, FileText, Globe, Landmark, Network, ShieldQuestion } from "lucide-react";
import { IDX } from "@/lib/data";
import type { Evidence, SourceDocument } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { useReview } from "@/lib/review";
import { evidenceHref, pageLabel } from "@/lib/selectors";

export type EvidenceTone = "a" | "b" | "amber" | "neutral" | "known" | "conflict";

const TONE: Record<EvidenceTone, string> = {
  a: "var(--a)",
  b: "var(--b)",
  amber: "var(--amber)",
  neutral: "var(--line-3)",
  known: "var(--known)",
  conflict: "var(--conflict)",
};

export function EvidenceCard({ e, tone = "neutral", compact }: { e: Evidence; tone?: EvidenceTone; compact?: boolean }) {
  const src = IDX.source(e.sourceId);
  const href = evidenceHref(e, src);
  const anchor = pageLabel(e);
  return (
    <figure className="relative overflow-hidden rounded-lg bg-bg-2/80 ring-1 ring-line" style={{ boxShadow: `inset 2px 0 0 ${TONE[tone]}` }}>
      <figcaption className="flex items-center gap-1.5 px-3 pt-2.5">
        <SourceIcon type={src?.sourceType} />
        <span className="mono truncate text-[10px] uppercase tracking-[0.06em] text-text-2">
          {src?.publisher ?? e.sourceId}
          {anchor && <span className="text-text-1"> · {anchor}</span>}
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1 text-[10.5px] text-text-2 hover:bg-bg-3 hover:text-a"
            aria-label={`Open source: ${src?.title ?? e.sourceId}${anchor ? `, ${anchor}` : ""}`}
          >
            Open <ExternalLink size={10} />
          </a>
        )}
      </figcaption>
      <blockquote className={clsx("px-3 pb-2 pt-1.5 font-sans italic leading-[1.5] text-text-0", compact ? "text-[12.5px]" : "text-[13.5px]")}>
        <span className="text-text-3">“</span>
        {e.exactExcerpt}
        <span className="text-text-3">”</span>
      </blockquote>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1.5 text-[10.5px] text-text-3">
        <span className="truncate" title={e.supports}>
          Supports: <span className="text-text-2">{e.supports}</span>
        </span>
        <ProvenanceTag e={e} />
        <CheckToggle id={e.id} />
      </div>
    </figure>
  );
}

function CheckToggle({ id }: { id: string }) {
  const enabled = useReview((s) => s.enabled);
  const checked = useReview((s) => !!s.checked[id]);
  const toggle = useReview((s) => s.toggleCheck);
  if (!enabled) return null;
  return (
    <button
      onClick={() => toggle(id)}
      aria-pressed={checked}
      className={clsx("rounded px-1.5 py-0.5 ring-1", checked ? "bg-known/15 text-known ring-known/40" : "text-text-2 ring-line hover:text-text-0")}
    >
      {checked ? "✓ checked" : "Mark checked"}
    </button>
  );
}

export function ProvenanceTag({ e }: { e: Evidence }) {
  const mine = useReview((s) => !!s.checked[e.id]);
  const method = e.extractionMethod === "gemini" ? "Gemini extraction" : e.extractionMethod === "manual" ? "Manual entry" : "Agent-assisted";
  return (
    <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap">
      {e.verifiedInSource ? (
        <span className="inline-flex items-center gap-1 text-known" title="Excerpt located verbatim in the cached source text">
          <BadgeCheck size={11} /> verbatim
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-conflict" title="Excerpt could not be located automatically">
          <ShieldQuestion size={11} /> unlocated
        </span>
      )}
      <span className="text-text-3">· {method}</span>
      <span className={e.reviewedByHuman || mine ? "text-known" : "text-text-3"}>· {e.reviewedByHuman ? "human-checked" : mine ? "checked by you" : "awaiting human check"}</span>
    </span>
  );
}

export function SourceIcon({ type }: { type?: SourceDocument["sourceType"] }) {
  const Icon = type === "regulator" ? Landmark : type === "rto" ? Network : type === "utility" ? Globe : FileText;
  return <Icon size={11} className="shrink-0 text-text-3" aria-hidden />;
}

export function SourceRow({ s, count }: { s: SourceDocument; count?: number }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-3"
    >
      <span className="mt-0.5">
        <SourceIcon type={s.sourceType} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-text-0 group-hover:text-a">{s.title}</span>
        <span className="block truncate text-[11px] text-text-2">
          {s.publisher}
          {s.publishedAt && ` · ${formatDate(s.publishedAt)}`}
        </span>
        <span className="mono mt-0.5 block text-[10px] text-text-3">
          {s.mimeType === "application/pdf" ? `PDF${s.pageCount ? ` · ${s.pageCount} pp` : ""}` : "HTML"} · retrieved {formatDate(s.retrievedAt)} · sha256 {s.sha256.slice(0, 10)}…
          {count !== undefined && ` · ${count} excerpt${count === 1 ? "" : "s"}`}
        </span>
      </span>
      <ExternalLink size={12} className="mt-0.5 shrink-0 text-text-3 group-hover:text-a" />
    </a>
  );
}
