"use client";

import clsx from "clsx";
import { Box, Check, ClipboardCheck, FileOutput, Link2, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Match } from "@/lib/domain/types";
import { useReview } from "@/lib/review";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, Tooltip } from "../ui";
import { scrollInspectorTo } from "./SectionNav";

/** The URL "Link" copies: this pair, and its radius when it is not the default 25 mi (Atlas reads ?pair=&r=). */
function pairUrl(m: Match): string {
  const url = new URL(window.location.href);
  url.searchParams.set("pair", m.id);
  const r = m.geoDetail.thresholdMiles;
  if (r !== 25) url.searchParams.set("r", String(r));
  else url.searchParams.delete("r");
  return url.toString();
}

/**
 * Sticky actions: primary "Create review brief", ghost "Link" (exact name → "Copied"; clipboard failure shows the link to
 * select), "3D close-up", and "Label this pair" (reviewer mode on + scroll to the label block).
 */
export function FooterBar({ m, scroller, phone }: { m: Match; scroller: RefObject<HTMLDivElement | null>; phone: boolean }) {
  const set = useAtlas((s) => s.set);
  const openCloseup = useAtlas((s) => s.openCloseup);
  const showNotice = useAtlas((s) => s.showNotice);
  const reviewOn = useReview((s) => s.enabled);
  const [copied, setCopied] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ id: string; url: string } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const isCopied = copied === m.id;
  const showFallback = fallback?.id === m.id;

  useEffect(() => {
    if (showFallback) field.current?.select();
  }, [showFallback]);

  const copyLink = async () => {
    const url = pairUrl(m);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setFallback(null);
      setCopied(m.id);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setFallback({ id: m.id, url });
      showNotice("Couldn't copy — select the link", "clipboard");
    }
  };

  const labelPair = () => {
    if (!useReview.getState().enabled) useReview.getState().toggle();
    // the label block mounts on the next render; then bring it under the section nav
    let tries = 0;
    const go = () => {
      const el = scroller.current?.querySelector<HTMLElement>("[data-review-panel]");
      if (el && scroller.current) {
        scrollInspectorTo(scroller.current, el, !window.matchMedia("(prefers-reduced-motion: reduce)").matches, 12);
        el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      } else if (tries++ < 10) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
  };

  return (
    <div className="shrink-0 border-t border-divider">
      {showFallback && (
        <div className="flex items-center gap-2 px-(--panel-pad) pt-2.5">
          <input
            ref={field}
            readOnly
            value={fallback.url}
            aria-label="Pair link"
            onFocus={(e) => e.currentTarget.select()}
            className="num h-8 min-w-0 flex-1 rounded-control bg-fill-1 px-3 text-caption text-fg-1 ring-1 ring-edge-strong ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-1/80"
          />
          <IconButton label="Hide link" size="sm" onClick={() => setFallback(null)} tooltip={false}>
            <X size={14} strokeWidth={2} />
          </IconButton>
        </div>
      )}
      {/* a size container: "3D close-up" earns a visible label as the inspector widens (360 md · 384 lg · 418+ xl) */}
      <div className={clsx("@container flex items-center px-(--panel-pad)", phone ? "gap-1 pt-2 pb-[calc(8px+var(--safe-b))]" : "gap-1.5 py-3")}>
        <Button
          variant="primary"
          size={phone ? "xl" : "md"}
          className={phone ? "min-w-0 flex-1 px-4!" : "min-w-0 flex-1 [&>span>svg]:hidden @min-[380px]:[&>span>svg]:block"}
          icon={phone ? undefined : <FileOutput size={14} strokeWidth={1.75} />}
          onClick={() => set({ briefOpen: true })}
        >
          Create review brief
        </Button>
        <Button
          variant="ghost"
          size={phone ? "xl" : "md"}
          className={phone ? "px-3.5!" : "px-3!"}
          onClick={copyLink}
          aria-live="polite"
          icon={isCopied ? <Check size={14} strokeWidth={2} className="text-ok" /> : <Link2 size={14} strokeWidth={1.75} />}
        >
          {isCopied ? "Copied" : "Link"}
        </Button>
        {phone ? (
          <IconButton label="3D close-up" tooltip="3D close-up · presentation only, symbolic structures" size="xl" onClick={openCloseup}>
            <Box size={16} strokeWidth={1.75} />
          </IconButton>
        ) : (
          // labelled, so it never reads as a second mystery icon beside "Label this pair": "3D" from 340px, in full from 420px
          <Tooltip content="3D close-up · presentation only, symbolic structures">
            <Button variant="ghost" size="md" aria-label="3D close-up" icon={<Box size={16} strokeWidth={1.75} />} onClick={openCloseup} className="gap-1.5! px-2! @min-[340px]:px-2.5!">
              <span className="hidden @min-[340px]:inline">
                3D<span className="hidden @min-[420px]:inline"> close-up</span>
              </span>
            </Button>
          </Tooltip>
        )}
        <IconButton label="Label this pair" tooltip={reviewOn ? "Label this pair" : "Label this pair (turns reviewer mode on)"} size={phone ? "xl" : "md"} onClick={labelPair}>
          <ClipboardCheck size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
