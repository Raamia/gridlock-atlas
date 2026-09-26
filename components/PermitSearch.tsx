"use client";

import clsx from "clsx";
import { Radar, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { looksLikeUtility, SAVED, type LiveCheck, type PermitSearch as SearchResult } from "@/lib/permits";
import { useAtlas } from "@/lib/store";
import { IconButton, Spinner } from "./ui";

/** Facility names behind the top Savannah River leads: one tap searches both state portals. */
const SUGGESTIONS = ["Goshen", "McIntosh", "Rice Hope", "Okatie", "Sherwood", "Riverport"];

async function post<T>(body: object): Promise<T> {
  const res = await fetch("/api/permits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

/**
 * Header search for state land-disturbance filings (Georgia EPD GEOS, SC DES coastal boundaries), live.
 * Wide screens: an inline search pill; narrower ones: a search icon that opens the same panel with its own field.
 */
export function PermitSearch({ compact }: { compact: boolean }) {
  const openMethod = useAtlas((s) => s.openMethod);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"search" | "new" | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [fresh, setFresh] = useState<LiveCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const run = async (text: string) => {
    const t = text.trim();
    if (t.length < 2) return;
    setQ(t);
    setOpen(true);
    setBusy("search");
    setError(null);
    setFresh(null);
    try {
      setResult(await post<SearchResult>({ q: t }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "the permit portals did not answer");
    } finally {
      setBusy(null);
    }
  };
  const checkNew = async () => {
    setBusy("new");
    setError(null);
    setResult(null);
    try {
      setFresh(await post<LiveCheck>({}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "the permit portals did not answer");
    } finally {
      setBusy(null);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void run(q);
    if (e.key === "Escape" && open) {
      e.stopPropagation(); // close this panel only, not the drawer or inspector behind it
      setOpen(false);
    }
  };

  const field = (autoFocus: boolean) => (
    <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full px-2.5 text-fg-3 focus-within:text-fg-1">
      <Search size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <input
        ref={input}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setOpen(true)}
        maxLength={60}
        placeholder="Search state permits…"
        aria-label="Search state permit filings (Georgia EPD and SC DES)"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg-1 outline-none placeholder:text-fg-3"
      />
      {busy === "search" && <Spinner size={12} label="Searching" />}
      {q && !busy && (
        <button type="button" aria-label="Clear" onClick={() => (setQ(""), setResult(null), input.current?.focus())} className="text-fg-3 hover:text-fg-1">
          <X size={12} />
        </button>
      )}
    </label>
  );

  return (
    <div ref={root} role="search" className="relative">
      {compact ? (
        <IconButton label="Search state permits" tooltipSide="bottom" variant="chrome" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Search size={16} strokeWidth={1.75} />
        </IconButton>
      ) : (
        <div className="chrome flex w-[230px] items-center rounded-full">{field(false)}</div>
      )}

      {open && (
        <div
          className="glass glass-solid absolute right-0 top-[calc(100%+8px)] z-(--z-popover) flex max-h-[min(70vh,560px)] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-line text-[12px] text-fg-2"
          aria-label="State permit filings"
        >
          {compact && <div className="border-b border-line p-1.5">{field(true)}</div>}
          <div className="border-b border-line px-3 py-2">
            <div className="eyebrow">State permit filings · live</div>
            <p className="mt-1 text-[11.5px] leading-snug text-fg-3">
              Georgia EPD (statewide) and SC DES land-disturbance boundaries near the Savannah River. A filing dates permitted land clearing, not a crew schedule.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-live="polite">
            {!result && !fresh && !busy && !error && (
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void run(s)} className="rounded-full bg-bg-3 px-2.5 py-1 text-[11.5px] text-fg-1 ring-1 ring-line hover:ring-line-2">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {busy && (
              <p className="flex items-center gap-2 py-2 text-fg-3">
                <Spinner size={12} /> {busy === "search" ? `Searching both portals for “${q}”…` : "Checking both portals for new filings…"}
              </p>
            )}
            {error && !busy && <p className="py-1 text-danger">Search failed: {error}</p>}

            {result && !busy && (
              <div className="space-y-3">
                <Group title="Georgia EPD" count={result.georgia.length} empty={`No Georgia filing named “${result.query}”.`}>
                  {result.georgia.map((f) => (
                    <Row key={f.submissionId} date={f.submitted} name={f.facility} meta={`${f.appType || "filing"} · #${f.submissionId}`} />
                  ))}
                </Group>
                <Group title="SC DES (Savannah River area)" count={result.southCarolina.length} empty={`No South Carolina boundary named “${result.query}”.`}>
                  {result.southCarolina.map((b) => (
                    <Row key={b.objectId} date={b.boundaryFiled} name={b.project} meta={`${b.acres} acres`} />
                  ))}
                </Group>
                <p className="text-[11px] text-fg-3">Dimmed rows do not look like power work by name. Newest first; at most 40 per state.</p>
              </div>
            )}

            {fresh && !busy && (
              <div className="space-y-1.5">
                <p className="text-fg-1">
                  {fresh.georgia.newFilings.length + fresh.southCarolina.newBoundaries.length === 0
                    ? `No new power-related filings since ${formatDate(fresh.since)}.`
                    : `New power-related filings since ${formatDate(fresh.since)}:`}
                </p>
                {fresh.georgia.newFilings.map((f) => (
                  <Row key={f.submissionId} date={f.submitted} name={f.facility} meta={`GA · ${f.county ?? ""} · #${f.submissionId}`} />
                ))}
                {fresh.southCarolina.newBoundaries.map((b) => (
                  <Row key={b.objectId} date={b.boundaryFiled} name={b.project} meta={`SC · ${b.acres} acres`} />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <button type="button" onClick={() => void checkNew()} disabled={!!busy} className="flex items-center gap-1.5 text-[11.5px] text-fg-1 hover:underline disabled:opacity-50">
              <Radar size={13} aria-hidden /> Anything new since {formatDate(SAVED.retrievedAt.slice(0, 10))}?
            </button>
            <button
              type="button"
              onClick={() => (setOpen(false), openMethod())}
              className="text-[11.5px] text-fg-3 underline-offset-2 hover:text-fg-1 hover:underline"
            >
              Findings per lead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-fg-3">
        {title} <span className="num">{count}</span>
      </h3>
      {count === 0 ? <p className="text-fg-3">{empty}</p> : <ul className="space-y-0.5">{children}</ul>}
    </section>
  );
}

function Row({ date, name, meta }: { date: string | null; name: string; meta: string }) {
  const power = looksLikeUtility(name);
  return (
    <li className={clsx("grid grid-cols-[74px_1fr] gap-2 rounded-md px-1 py-0.5", power ? "text-fg-1" : "text-fg-3")}>
      <span className="num text-[11px] text-fg-3">{date ?? "—"}</span>
      <span className="min-w-0">
        <span className={clsx(power && "font-medium")}>{name}</span> <span className="text-[10.5px] text-fg-3">{meta}</span>
      </span>
    </li>
  );
}
