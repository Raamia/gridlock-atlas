"use client";

import { useAtlas } from "@/lib/store";

/**
 * 3D pair close-up (SPEC §7). Mounted by Atlas via next/dynamic (ssr: false) while `closeupOpen && selectedMatchId`.
 *
 * FOUNDATION STUB: a placeholder overlay with the final contract (default export, "Back to map" closes it). The closeup
 * owner replaces it.
 */
export default function PairCloseup() {
  const set = useAtlas((s) => s.set);
  return (
    <div
      className="fixed inset-0 z-[5]"
      style={{ background: "radial-gradient(ellipse at 50% 45%, var(--bg-2), var(--bg-0) 72%)" }}
      data-closeup
    >
      <div
        className="absolute flex flex-col items-center gap-3 text-center"
        style={{ left: "var(--focal-l, 0px)", right: "var(--focal-r, 0px)", top: "calc(var(--focal-t, 76px) + 24px)" }}
      >
        <p className="text-[14px] text-text-1">3D close-up — coming</p>
        <button
          type="button"
          onClick={() => set({ closeupOpen: false })}
          className="rounded-full border border-line-2 bg-bg-2 px-4 py-2 text-[14px] font-medium text-text-0 hover:bg-bg-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-0"
        >
          Back to map
        </button>
      </div>
    </div>
  );
}
