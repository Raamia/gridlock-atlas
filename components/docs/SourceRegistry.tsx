"use client";

/**
 * Source registry: every public document the snapshot cites, grouped by who published it. Test contract: dialog
 * "Source registry"; "sha256" (lowercase) and "located verbatim"; placeholder "Filter sources"; "No sources match";
 * the ONLY http(s) anchors in this dialog are the source rows (each row is one <a href>).
 */

import { ArrowUpRight, Globe, Landmark, Library, Network, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SNAPSHOT } from "@/lib/data";
import type { SourceDocument } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { Button, EmptyState, Input, Stat } from "../ui";
import { DocSheet, type TocItem } from "./DocSheet";

type GroupId = "utility" | "regulator" | "rto" | "public";

const GROUPS: { id: GroupId; label: string; toc: string; lede: string }[] = [
  { id: "utility", label: "Utilities", toc: "Utilities", lede: "Plans, project pages and filings published by the utilities themselves." },
  { id: "regulator", label: "State regulators", toc: "State regulators", lede: "Commission dockets, orders and the utility filings made to them." },
  { id: "rto", label: "Regional transmission organizations", toc: "Regional planning", lede: "Regional planning processes: MISO, SPP, SERTP and SCRTP." },
  { id: "public", label: "Federal and other public agencies", toc: "Federal & other", lede: "Federal rules, reliability standards and public statistics." },
];

/** The snapshot files FERC, DOE, NERC, USDA and a state environmental agency as "regulator"; they are not state regulators. */
const NOT_STATE_REGULATOR = /Department of Energy|Federal Energy Regulatory|North American Electric Reliability|\bNERC\b|\bUSDA\b|Environmental Protection/i;

function groupOf(s: SourceDocument): GroupId {
  if (s.sourceType === "regulator") return NOT_STATE_REGULATOR.test(s.publisher) ? "public" : "regulator";
  if (s.sourceType === "rto") return "rto";
  if (s.sourceType === "utility") return "utility";
  return "public";
}

const ICON: Record<GroupId, typeof Globe> = { utility: Globe, regulator: Landmark, rto: Network, public: Library };

export function SourceRegistry() {
  const open = useAtlas((s) => s.sourcesOpen);
  const set = useAtlas((s) => s.set);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of Object.values(SNAPSHOT.evidence)) m.set(e.sourceId, (m.get(e.sourceId) ?? 0) + 1);
    return m;
  }, []);
  const cited = useMemo(() => SNAPSHOT.sources.filter((s) => counts.get(s.id)), [counts]);
  const total = Object.keys(SNAPSHOT.evidence).length;
  const verified = useMemo(() => Object.values(SNAPSHOT.evidence).filter((e) => e.verifiedInSource).length, []);
  const pct = total ? Math.round((verified / total) * 100) : 0;
  const utilities = SNAPSHOT.utilities?.length ?? 0;

  const needle = q.trim().toLowerCase();
  const filtered = needle ? cited.filter((s) => `${s.title} ${s.publisher} ${s.url}`.toLowerCase().includes(needle)) : cited;
  const groups = GROUPS.map((g) => ({ ...g, list: filtered.filter((s) => groupOf(s) === g.id) })).filter((g) => g.list.length);
  const toc: TocItem[] = groups.map((g) => ({ id: `group-${g.id}`, label: g.toc, meta: g.list.length }));

  // a fresh filter every time it opens
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setQ("");
  }
  // on a desktop the filter takes focus (after the dialog's own first-focus pass); on touch it would pop the keyboard
  useEffect(() => {
    if (!open || !window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => input.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <DocSheet
      open={open}
      onClose={() => set({ sourcesOpen: false })}
      eyebrow="Provenance"
      title="Source registry"
      meta={
        <>
          <span className="num">{SNAPSHOT.sources.length}</span> public documents · <span className="num">{utilities}</span> utilities · frozen {formatDate(SNAPSHOT.snapshotDate)}
        </>
      }
      toc={toc}
      tocLabel="Source groups"
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat size="lg" labelBelow value={cited.length} label="cited public documents" />
        <Stat size="lg" labelBelow value={total.toLocaleString("en-US")} label="short excerpts" />
        <Stat
          size="lg"
          labelBelow
          tone={pct === 100 ? "ok" : "default"}
          value={
            <>
              {pct}
              <span className="text-heading text-fg-3">%</span>
            </>
          }
          label="located verbatim"
        />
      </div>
      <p className="mt-4 max-w-[68ch] text-body text-pretty text-fg-2">
        Every source was fetched, hashed (SHA-256) and cached on {formatDate(SNAPSHOT.snapshotDate)}. The app reads this frozen snapshot, so it works when publisher sites or APIs are
        down. Only short excerpts with page anchors are stored.
      </p>

      {/* the filter sticks to the top of the reading column */}
      <div data-doc-sticky className="sticky top-0 z-10 -mx-1 mt-5 bg-surface-solid px-1 pt-1 pb-3">
        <div className="flex items-center gap-3">
          <Input
            ref={input}
            icon={<Search />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter sources"
            aria-label="Filter sources"
            autoComplete="off"
            spellCheck={false}
            wrapperClassName="flex-1"
            className="h-9"
          />
          <span className="num shrink-0 text-caption text-fg-3" aria-live="polite">
            {needle ? `${filtered.length} of ${cited.length}` : `${cited.length} sources`}
          </span>
        </div>
      </div>

      {groups.map((g) => {
        const Icon = ICON[g.id];
        return (
          <section key={g.id} data-doc-section={`group-${g.id}`} aria-labelledby={`src-${g.id}`} className="mt-6 first-of-type:mt-3">
            <header className="flex items-baseline gap-2 border-b border-divider pb-2.5">
              <Icon aria-hidden size={14} strokeWidth={1.75} className="translate-y-0.5 self-start text-fg-3" />
              <h3 id={`src-${g.id}`} className="text-heading font-semibold text-fg-1">
                {g.label}
              </h3>
              <span className="num text-caption text-fg-3">{g.list.length}</span>
              <span className="ml-auto hidden text-caption text-fg-3 md:inline">{g.lede}</span>
            </header>
            <ul className="mt-1">
              {g.list.map((s) => (
                <li key={s.id} className="border-b border-divider last:border-b-0">
                  <SourceLink s={s} count={counts.get(s.id)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {filtered.length === 0 && (
        <EmptyState
          icon={<Search />}
          title={`No sources match “${q.trim()}”`}
          action={
            <Button variant="secondary" size="sm" onClick={() => setQ("")}>
              Clear filter
            </Button>
          }
        >
          The filter looks at titles, publishers and web addresses.
        </EmptyState>
      )}
    </DocSheet>
  );
}

/** One registry row: the whole row is the link to the public document. */
function SourceLink({ s, count }: { s: SourceDocument; count?: number }) {
  const pdf = s.mimeType === "application/pdf";
  const host = (() => {
    try {
      return new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noreferrer"
      className="group -mx-3 my-px flex items-start gap-3 rounded-control px-3 py-3 transition-colors duration-150 hover:bg-fill-2"
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ui font-medium text-fg-1">{s.title}</span>
        <span className="mt-0.5 block truncate text-caption text-fg-2">
          {s.publisher}
          {s.publishedAt && ` · ${formatDate(s.publishedAt)}`}
        </span>
        <span className="num mt-1 block text-[11px] leading-[1.45] text-fg-3">
          {pdf ? `PDF${s.pageCount ? ` · ${s.pageCount} pp` : ""}` : "HTML"} · retrieved {formatDate(s.retrievedAt)} · sha256 {s.sha256.slice(0, 10)}…
          {count !== undefined && ` · ${count} excerpt${count === 1 ? "" : "s"}`}
          {host && <span className="hidden sm:inline"> · {host}</span>}
        </span>
      </span>
      <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-3 transition-colors group-hover:text-fg-1" />
    </a>
  );
}
