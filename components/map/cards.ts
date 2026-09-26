import { IDX } from "@/lib/data";
import type { Match, Project } from "@/lib/domain/types";
import { geoShort, inServicePhrase } from "@/lib/describe";
import { displayTitle, formatMilesNear } from "@/lib/format";
import { ownerNames } from "@/lib/selectors";
import { escapeHtml } from "./callouts";

/** Map hover card (desktop) and tap card (touch): a solid popover, same type scale as the panels. */

export function precisionText(p: string) {
  return (
    (
      {
        "official-gis": "official GIS",
        "official-map-digitized": "schematic · not survey accurate",
        "named-facility": "named facility",
        locality: "approximate locality",
        county: "county-level",
      } as Record<string, string>
    )[p] ?? p
  );
}

const CARD = "popover rounded-card px-3 py-2.5 text-left";

function ownerLine(p: Project, color: string) {
  return `<div class="flex min-w-0 items-baseline gap-2">
    <span aria-hidden class="inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full" style="background:${color}"></span>
    <span class="min-w-0">
      <span class="mr-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-3">${escapeHtml(ownerNames(p, IDX, true))}</span>
      <span class="text-[13px] font-medium leading-[1.35] text-fg-1">${escapeHtml(displayTitle(p))}</span>
    </span>
  </div>`;
}

/** Place fact for a flagged pair: the facility for pairs flagged through one (never a bare "105 mi apart"), else the distance. */
export function pairPlaceText(m: Match): string {
  const c = m.geoDetail.center;
  const thr = m.geoDetail.thresholdMiles;
  const byFacility = m.geoDetail.method === "shared-site" || m.geoDetail.method === "shared-endpoint";
  if (byFacility) return `${geoShort(m).title}${c && c.miles > thr ? ` · beyond ${thr} mi center to center` : ""}`;
  return c ? `${formatMilesNear(c.miles, thr)} apart · center to center` : geoShort(m).text;
}

export function pairCardHtml(m: Match, rank: string | null) {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  return `<div class="${CARD} w-[272px]">
    <div class="eyebrow mb-2 flex items-center gap-1.5"><span>Flagged pair</span>${rank ? `<span class="text-overlap">#${escapeHtml(rank)}</span>` : ""}</div>
    <div class="space-y-1">${ownerLine(a, "var(--util-a)")}${ownerLine(b, "var(--util-b)")}</div>
    <div class="mt-2 border-t border-divider pt-2 font-mono text-[11px] leading-[1.45] text-fg-2">
      <div>${escapeHtml(pairPlaceText(m))}</div>
      ${m.timeDetail.inService ? `<div>${escapeHtml(inServicePhrase(m))}</div>` : ""}
    </div>
    <div class="mt-1.5 text-[11px] text-fg-3">Click to inspect</div>
  </div>`;
}

export function projectCardHtml(p: Project, placeLabel: string, precision: string) {
  return `<div class="${CARD} w-max max-w-[272px]">
    <div class="text-[13px] font-medium leading-[1.35] text-fg-1">${escapeHtml(displayTitle(p))}</div>
    <div class="mt-0.5 text-[12px] leading-[1.4] text-fg-2">${escapeHtml(ownerNames(p, IDX))}</div>
    <div class="mt-1.5 font-mono text-[11px] leading-[1.4] text-fg-3">${escapeHtml(placeLabel)}${precision ? ` · ${escapeHtml(precisionText(precision))}` : ""}</div>
  </div>`;
}

/** The tap card on touch screens, with "Show its N pairs" after a run (focuses the list on this project). */
export function projectTapCard(p: Project, placeLabel: string, precision: string, pairs: number, onShowPairs: () => void): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = projectCardHtml(p, placeLabel, precision);
  if (pairs > 0) {
    const card = el.firstElementChild as HTMLElement;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "mt-2 inline-flex h-11 w-full items-center justify-center rounded-full bg-fill-2 px-4 text-[13px] font-medium text-fg-1 ring-1 ring-edge ring-inset active:bg-fill-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-1";
    btn.textContent = `Show its ${pairs} pair${pairs === 1 ? "" : "s"}`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onShowPairs();
    });
    card.appendChild(btn);
  }
  return el;
}
