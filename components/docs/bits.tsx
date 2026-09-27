"use client";

/** Reading-sheet typography shared by Method & audit and the Source registry (tokens only; no nested bordered boxes). */

import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { IDX } from "@/lib/data";
import { CONTEXT_SOURCES, type Cite } from "@/lib/sponsor";

type SectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  id: string;
  index: number;
  title: ReactNode;
  /** Mono aside after the title ("live", "npm run eval"). */
  kicker?: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
};

/** A numbered reading section; `data-doc-section` is what DocSheet's contents and scroll-spy read. */
export function DocSection({ id, index, title, kicker, lede, children, className, ...rest }: SectionProps) {
  return (
    <section
      {...rest}
      data-doc-section={id}
      id={`doc-${id}`}
      aria-labelledby={`doc-${id}-title`}
      className={clsx("border-t border-divider pt-8 pb-10 first:border-t-0 first:pt-0", className)}
    >
      <header className="mb-5">
        <span aria-hidden className="num text-caption text-fg-4">
          {String(index).padStart(2, "0")}
        </span>
        <h3 id={`doc-${id}-title`} className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-title font-semibold text-fg-1">
          {title}
          {kicker && <span className="num text-caption font-normal tracking-normal text-fg-3">{kicker}</span>}
        </h3>
        {lede && <p className="mt-2.5 max-w-[68ch] text-body text-pretty text-fg-2">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

/** Subsection heading inside a DocSection. */
export function SubHead({ children, meta, className }: { children: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <h4 className={clsx("mt-8 mb-3 flex items-baseline gap-2 text-heading font-semibold text-fg-1", className)}>
      {children}
      {meta && <span className="num text-caption font-normal text-fg-3">{meta}</span>}
    </h4>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("max-w-[68ch] text-body text-pretty text-fg-2", className)}>{children}</p>;
}

/** A labelled rule list (key column + prose), divided by hairlines. */
export function Rules({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={clsx("divide-y divide-divider", className)}>{children}</dl>;
}

export function Rule({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 py-4 first:pt-1 last:pb-1 sm:grid-cols-[116px_minmax(0,1fr)] sm:gap-5">
      <dt className="eyebrow pt-[5px] leading-[1.3]">{k}</dt>
      <dd className="max-w-[68ch] text-body text-pretty text-fg-2">{children}</dd>
    </div>
  );
}

/** Emphasised figure inside prose. */
export function B({ children }: { children: ReactNode }) {
  return <b className="num font-medium text-fg-1">{children}</b>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="num rounded-chip bg-fill-2 px-1.5 py-px text-caption whitespace-nowrap text-fg-1">{children}</code>;
}

/** Soft well for an audit or summary block (a fill, never a second border). */
export function Well({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-card bg-fill-1 px-4 py-3.5", className)}>{children}</div>;
}

const sourceOf = (id: string) => IDX.source(id) ?? CONTEXT_SOURCES[id];
const shortPublisher = (p: string) => p.replace(/\s*\(.*\)$/, "");

/** A short verbatim excerpt with its publisher, page and a link to the public source (2px rule, no box). */
export function Quote({ c }: { c: Cite }) {
  const src = sourceOf(c.sourceId);
  const href = src && c.page && /\.pdf($|[?#])/i.test(src.url) ? `${src.url}#page=${c.page}` : src?.url;
  return (
    <blockquote className="mt-2.5 border-l-2 border-edge-strong py-0.5 pl-3.5" title={c.supports}>
      <p className="text-ui text-pretty text-fg-1 italic">“{c.excerpt}”</p>
      <footer className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-fg-3">
        <span>
          {src ? shortPublisher(src.publisher) : c.sourceId}
          {c.page ? <span className="num">, p. {c.page}</span> : ""}
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 rounded-chip px-0.5 text-fg-2 underline-offset-2 hover:text-fg-1 hover:underline"
            aria-label={`Open source: ${src!.title}${c.page ? `, p. ${c.page}` : ""}`}
          >
            Open <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden />
          </a>
        )}
      </footer>
    </blockquote>
  );
}

/** Header row of a hairline table (label-style cells). */
export const TH_ROW = "eyebrow grid items-end gap-3 border-b border-divider pb-2 whitespace-nowrap";
/** Body row of a hairline table. */
export const TD_ROW = "grid items-center gap-3 border-b border-divider py-2 text-ui last:border-b-0";
