"use client";

import clsx from "clsx";
import { BookOpenText, ClipboardCheck, Database, PlayCircle, RotateCcw } from "lucide-react";
import { SNAPSHOT } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { useReview } from "@/lib/review";
import { useAtlas } from "@/lib/store";
import { Button, IconButton } from "./ui";

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#0c1528" stroke="rgba(138,160,206,0.28)" />
      <path d="M8 3.5v17M16 3.5v17" stroke="rgba(138,160,206,0.22)" strokeWidth="1" />
      <path d="M3.5 8h17M3.5 16h17" stroke="rgba(138,160,206,0.22)" strokeWidth="1" />
      <path d="M4 17.5 C 8 16, 11 13, 16 8" stroke="#2fd6f2" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M5 6.5 C 9 9, 12 12, 19.5 15" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="11.4" cy="11.1" r="2.4" fill="#fbbf24" />
      <circle cx="11.4" cy="11.1" r="4.2" fill="none" stroke="#fbbf24" strokeOpacity="0.35" />
    </svg>
  );
}

export function TopBar() {
  const set = useAtlas((s) => s.set);
  const region = useAtlas((s) => s.region);
  const resetView = useAtlas((s) => s.resetView);
  const demoStep = useAtlas((s) => s.demoStep);
  const utilities = new Set(SNAPSHOT.projects.flatMap((p) => p.owners.map((o) => o.utilityId)));
  const SHORT: Record<string, string> = { southeast: "SC–GA", "upper-midwest": "Midwest", "southern-plains": "Plains" };
  const regions = [...SNAPSHOT.regions.map((r) => ({ id: r.id, label: r.label, short: SHORT[r.id] ?? r.label })), { id: "all", label: "All", short: "All" }];

  return (
    <header className="relative z-30 flex h-14 min-w-0 items-center gap-2 overflow-hidden border-b border-line bg-bg-1/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <LogoMark />
        <div className="leading-none">
          <div className="text-[14px] font-semibold tracking-[-0.015em] text-text-0">
            GridLock <span className="font-serif text-[16px] font-normal italic tracking-normal text-text-1 max-sm:hidden">Atlas</span>
          </div>
        </div>
      </div>

      <div className="mx-2 hidden h-5 w-px bg-line-2 lg:block" />
      <div className="hidden items-center gap-2 whitespace-nowrap lg:flex">
        <span className="hidden h-6 items-center gap-1.5 rounded-full border border-line-2 px-2.5 text-[11px] text-text-1 min-[1400px]:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-known shadow-[0_0_8px_var(--known)]" />
          Public planning data
        </span>
        <span className="mono text-[11px] text-text-2">
          Snapshot <span className="text-text-1">{formatDate(SNAPSHOT.snapshotDate)}</span>
        </span>
      </div>

      <nav aria-label="Region" className="mx-auto hidden items-center gap-0.5 rounded-[10px] border border-line bg-bg-0/60 p-0.5 md:flex">
        {regions.map((r) => (
          <button
            key={r.id}
            onClick={() => set({ region: r.id, cameraNonce: useAtlas.getState().cameraNonce + 1, selectedMatchId: null, inspectorOpen: false })}
            aria-pressed={region === r.id}
            className={clsx(
              "h-7 whitespace-nowrap rounded-[8px] px-3 text-[12px] transition-colors",
              region === r.id ? "bg-bg-3 text-text-0 ring-1 ring-line-2" : "text-text-2 hover:text-text-1",
            )}
            title={r.label}
          >
            <span className="min-[1400px]:hidden">{r.short}</span>
            <span className="hidden min-[1400px]:inline">{r.label}</span>
          </button>
        ))}
      </nav>

      <select
        aria-label="Region"
        value={region}
        onChange={(e) => set({ region: e.target.value, cameraNonce: useAtlas.getState().cameraNonce + 1, selectedMatchId: null, inspectorOpen: false })}
        title={regions.find((r) => r.id === region)?.label}
        className="ml-auto h-8 min-w-0 max-w-[40vw] rounded-lg border border-line-2 bg-bg-2 px-2 text-[12px] text-text-1 outline-none md:hidden"
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.short}
          </option>
        ))}
      </select>
      {/* phones: the region select gives up width first, so the demo button always stays on screen */}
      <div className="flex shrink-0 items-center gap-1 md:ml-0">
        <Button variant="ghost" size="sm" onClick={() => set({ sourcesOpen: true })} title="Source registry" aria-label={`Source registry: ${SNAPSHOT.sources.length} sources, ${utilities.size} utilities`}>
          <Database size={13} />
          <span className="num max-sm:hidden">{SNAPSHOT.sources.length}</span>
          <span className="hidden xl:inline">sources</span>
          <span className="hidden text-text-3 xl:inline">·</span>
          <span className="num hidden xl:inline">{utilities.size}</span>
          <span className="hidden xl:inline">utilities</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => set({ methodOpen: true })} className="max-sm:hidden">
          <BookOpenText size={13} />
          Method
        </Button>
        <IconButton label="Method & audit" onClick={() => set({ methodOpen: true })} className="sm:hidden">
          <BookOpenText size={14} />
        </IconButton>
        <ReviewToggle />
        <IconButton label="Reset view" onClick={resetView} className="max-sm:hidden">
          <RotateCcw size={14} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-line-2 max-sm:hidden" />
        <Button
          variant={demoStep === null ? "outline" : "subtle"}
          size="sm"
          onClick={() => set(demoStep === null ? { demoStep: 0 } : { demoStep: null, briefOpen: false, highlightConflict: false, focusConflict: null })}
          aria-label={demoStep === null ? "Start guided demo" : "Exit guided demo"}
        >
          <PlayCircle size={13} />
          <span className="hidden sm:inline">{demoStep === null ? "Guided demo" : "Exit demo"}</span>
        </Button>
      </div>
    </header>
  );
}

function ReviewToggle() {
  const enabled = useReview((s) => s.enabled);
  const toggle = useReview((s) => s.toggle);
  return (
    <IconButton label={enabled ? "Reviewer mode on" : "Reviewer mode"} onClick={toggle} aria-pressed={enabled} className={enabled ? "bg-a/15 text-a hover:text-a" : ""}>
      <ClipboardCheck size={14} />
    </IconButton>
  );
}
