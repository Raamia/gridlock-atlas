"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Download, Printer, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useDialogFocus } from "@/lib/focus";
import { buildBrief, briefToMarkdown } from "@/lib/brief";
import { displayTitle } from "@/lib/describe";
import { useSelectedPair } from "@/lib/hooks";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, MatchBadges, StatusChip } from "./ui";

const DEMO_COMPANION = { companion: () => document.querySelector<HTMLElement>('[aria-label="Guided demo"]') };

export function BriefModal() {
  const open = useAtlas((s) => s.briefOpen);
  const demo = useAtlas((s) => s.demoStep !== null);
  const set = useAtlas((s) => s.set);
  const pair = useSelectedPair();
  const brief = useMemo(() => (pair ? buildBrief(pair.match) : null), [pair]);
  const md = useMemo(() => (brief ? briefToMarkdown(brief) : ""), [brief]);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // during the guided demo its card rides above the backdrop: Tab reaches its Previous / Finish, and Space on Next stays there
  useDialogFocus(panel, open && !!pair, demo ? DEMO_COMPANION : undefined);

  const copy = async () => {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gridlock-brief-${pair?.match.id ?? "pair"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AnimatePresence>
      {open && pair && brief && (
        <motion.div
          className={clsx(
            "fixed inset-0 z-50 flex items-center justify-center bg-bg-0/70 p-3 backdrop-blur-sm sm:p-6 print:static print:block print:bg-white print:p-0",
            // during the guided demo its card sits bottom-left above this backdrop: center the brief beside it
            // (below lg the card spans the bottom instead; globals.css reserves its height via data-demo)
            demo && "lg:pl-[480px]",
          )}
          data-demo={demo || undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && set({ briefOpen: false })}
          role="dialog"
          aria-modal="true"
          aria-label="Review brief"
        >
          <motion.div
            ref={panel}
            initial={{ y: 16, scale: 0.985, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-full w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-line-2 bg-bg-1 shadow-[0_40px_120px_-20px_rgba(0,0,0,.8)] print:block print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none"
          >
            <div className="no-print relative flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 pr-14">
              <div className="hidden sm:block">
                <div className="eyebrow">Cited review brief</div>
                <div className="text-[12px] text-text-2">Built from snapshot fields only · every fact carries a numbered source · excerpts re-found verbatim, awaiting human check</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <Button variant="outline" size="sm" onClick={copy}>
                  {copied ? <Check size={13} className="text-known" /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download size={13} /> .md
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer size={13} /> Print / PDF
                </Button>
                <IconButton label="Close brief" onClick={() => set({ briefOpen: false })} className="absolute right-3 top-3">
                  <X size={15} />
                </IconButton>
              </div>
            </div>

            <article className="scroll-thin overflow-y-auto px-5 py-6 sm:px-9 sm:py-8 print:overflow-visible print:px-0 print:text-black">
              <div className="flex items-center gap-2">
                <MatchBadges m={pair.match} />
                <StatusChip status={pair.match.reviewStatus} />
              </div>
              <h2 className="mt-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-0 print:text-black">
                {displayTitle(pair.a)} <span className="text-text-3">×</span> {displayTitle(pair.b)}
              </h2>
              <dl className="mt-6 space-y-4">
                {brief.rows.slice(1).map((r) => (
                  <div key={r.label} className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                    <dt className="eyebrow pt-0.5">{r.label}</dt>
                    <dd className="whitespace-pre-line text-[13.5px] leading-[1.6] text-text-1 print:text-black">{r.text}</dd>
                  </div>
                ))}
                {brief.unresolved.length > 0 && (
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                    <dt className="eyebrow pt-0.5 text-conflict">Unresolved</dt>
                    <dd>
                      <ul className="space-y-1.5">
                        {brief.unresolved.map((u) => (
                          <li key={u} className="relative pl-3.5 text-[13.5px] leading-[1.55] text-text-1 print:text-black">
                            <span className="absolute left-0 top-[9px] h-1 w-1 rounded-full bg-conflict" />
                            {u}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                  <dt className="eyebrow pt-1 text-text-1">Review question</dt>
                  <dd className="rounded-xl bg-bg-2 p-4 text-[15.5px] font-medium leading-[1.5] text-text-0 ring-1 ring-line-2 print:bg-transparent print:text-black print:ring-black/20">{brief.question}</dd>
                </div>
              </dl>

              <div className="mt-7 border-t border-line pt-5">
                <div className="eyebrow mb-3">Sources</div>
                <ol className="space-y-2.5">
                  {brief.citations.map((c) => (
                    <li key={c.n} className="grid grid-cols-[22px_1fr] gap-1 text-[12px] leading-snug print:break-inside-avoid">
                      <span className="num text-text-3">{c.n}.</span>
                      <span className="text-text-2 print:text-black">
                        <span className="text-text-1">{c.publisher}</span>, <em>{c.title}</em>
                        {c.anchor && `, ${c.anchor}`} — <span className="italic text-text-1">“{c.excerpt}”</span>{" "}
                        <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-a hover:underline">
                          {c.url.replace(/^https?:\/\//, "").slice(0, 80)}
                          {c.url.length > 88 ? "…" : ""}
                        </a>{" "}
                        <span className="text-[10.5px] text-text-3">({c.provenance})</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="mt-6 text-[11px] leading-snug text-text-3">{brief.footer}</p>
            </article>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
