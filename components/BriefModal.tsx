"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Download, Printer, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useDialogFocus } from "@/lib/focus";
import { buildBrief, briefToMarkdown } from "@/lib/brief";
import { displayTitle } from "@/lib/describe";
import { useSelectedPair } from "@/lib/hooks";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, MatchBadges, StatusChip } from "./ui";

export function BriefModal() {
  const open = useAtlas((s) => s.briefOpen);
  const set = useAtlas((s) => s.set);
  const pair = useSelectedPair();
  const brief = useMemo(() => (pair ? buildBrief(pair.match) : null), [pair]);
  const md = useMemo(() => (brief ? briefToMarkdown(brief) : ""), [brief]);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, open && !!pair);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/70 p-6 backdrop-blur-sm print:static print:bg-white print:p-0"
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
            className="flex max-h-full w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-line-2 bg-bg-1 shadow-[0_40px_120px_-20px_rgba(0,0,0,.8)] print:max-h-none print:border-0 print:shadow-none"
          >
            <div className="no-print flex items-center gap-2 border-b border-line px-5 py-3">
              <div>
                <div className="eyebrow">Cited review brief</div>
                <div className="text-[12px] text-text-2">Built from snapshot fields only · every fact carries a numbered source · excerpts re-found verbatim, awaiting human check</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
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
                <IconButton label="Close brief" onClick={() => set({ briefOpen: false })}>
                  <X size={15} />
                </IconButton>
              </div>
            </div>

            <article className="scroll-thin overflow-y-auto px-9 py-8 print:overflow-visible print:px-0 print:text-black">
              <div className="flex items-center gap-2">
                <MatchBadges m={pair.match} />
                <StatusChip status={pair.match.reviewStatus} />
              </div>
              <h2 className="mt-3 font-serif text-[30px] leading-[1.08] tracking-[-0.01em] text-text-0 print:text-black">
                {displayTitle(pair.a)} <span className="text-text-3">×</span> {displayTitle(pair.b)}
              </h2>
              <dl className="mt-6 space-y-4">
                {brief.rows.slice(1).map((r) => (
                  <div key={r.label} className="grid grid-cols-[140px_1fr] gap-4">
                    <dt className="eyebrow pt-0.5">{r.label}</dt>
                    <dd className="whitespace-pre-line text-[13.5px] leading-[1.6] text-text-1 print:text-black">{r.text}</dd>
                  </div>
                ))}
                {brief.unresolved.length > 0 && (
                  <div className="grid grid-cols-[140px_1fr] gap-4">
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
                <div className="grid grid-cols-[140px_1fr] gap-4">
                  <dt className="eyebrow pt-1 text-amber">Review question</dt>
                  <dd className="rounded-xl bg-amber/8 p-4 font-serif text-[18px] leading-[1.4] text-text-0 ring-1 ring-amber/25 print:text-black">{brief.question}</dd>
                </div>
              </dl>

              <div className="mt-7 border-t border-line pt-5">
                <div className="eyebrow mb-3">Sources</div>
                <ol className="space-y-2.5">
                  {brief.citations.map((c) => (
                    <li key={c.n} className="grid grid-cols-[22px_1fr] gap-1 text-[12px] leading-snug">
                      <span className="num text-text-3">{c.n}.</span>
                      <span className="text-text-2 print:text-black">
                        <span className="text-text-1">{c.publisher}</span>, <em>{c.title}</em>
                        {c.anchor && `, ${c.anchor}`} — <span className="font-serif text-[13px] text-text-1">“{c.excerpt}”</span>{" "}
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
