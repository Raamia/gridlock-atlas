import { describe, expect, it } from "vitest";
import { cameraPadding, computeLayout, DOCK, getLayout, INSPECTOR, layoutCssVars, MIN_FOCAL_H, MIN_FOCAL_W, RAIL, tierOf, type LayoutOptions } from "@/lib/layout";
import { useAtlas } from "@/lib/store";

const base: LayoutOptions = { inspectorOpen: false, railOpen: false, demoOn: false, timelineCollapsed: false, isPhone: false, pairSelected: false };
const pair: LayoutOptions = { ...base, inspectorOpen: true, pairSelected: true };
/** Demo step 3 (index 2): the pair is open and the dock is forced collapsed. */
const demoPair: LayoutOptions = { ...pair, demoOn: true, demoStep: 2 };

describe("computeLayout tiers", () => {
  it("picks tiers at the breakpoints", () => {
    expect(tierOf(1920)).toBe("xl");
    expect(tierOf(1280)).toBe("xl");
    expect(tierOf(1279)).toBe("lg");
    expect(tierOf(1024)).toBe("lg");
    expect(tierOf(1023)).toBe("md");
    expect(tierOf(768)).toBe("md");
    expect(tierOf(767)).toBe("phone");
    expect(tierOf(1440, true)).toBe("phone");
    expect(computeLayout(1536, 960, base).gutter).toBe(20);
    expect(computeLayout(1535, 960, base).gutter).toBe(16);
  });

  it("1440×900: rail and overview dock, then inspector + pair dock, then demo", () => {
    const pre = computeLayout(1440, 900, base);
    expect(pre).toMatchObject({ tier: "xl", railMode: "panel", railDocked: true, gutter: 16, panelTop: 76, railW: 360, inspectorW: 418, dockH: 96 });
    expect(pre.focal).toEqual({ l: 388, t: 76, r: 16, b: 124 });
    expect([pre.focalW, pre.focalH]).toEqual([1036, 700]);
    expect(pre.keyCollapsed).toBe(false);
    expect(pre.demoCardW).toBe(520);

    const sel = computeLayout(1440, 900, pair);
    expect(sel.dockH).toBe(196);
    expect(sel.focal).toEqual({ l: 388, t: 76, r: 446, b: 224 });
    expect([sel.focalW, sel.focalH]).toEqual([606, 600]);
    expect(sel.keyCollapsed).toBe(true);

    const demo = computeLayout(1440, 900, demoPair);
    expect(demo).toMatchObject({ dockH: 44, dockCollapsed: true, dockForced: true, keyCollapsed: true });
    expect(demo.focal.b).toBe(72);
    expect(demo.focalH).toBe(752);
    // steps 1 and 4 keep the dock open
    expect(computeLayout(1440, 900, { ...demoPair, demoStep: 3 }).dockH).toBe(196);
    expect(computeLayout(1440, 900, { ...base, demoOn: true, demoStep: 0 }).dockH).toBe(96);
  });

  it("1280×800: minimum panel widths; the demo card shrinks to the focal hole", () => {
    const pre = computeLayout(1280, 800, base);
    expect(pre).toMatchObject({ tier: "xl", railW: 336, inspectorW: 384, dockH: 96 });
    expect(pre.focal).toEqual({ l: 364, t: 76, r: 16, b: 124 });
    expect(pre.focalW).toBe(900);
    expect(pre.keyCollapsed).toBe(false);

    const sel = computeLayout(1280, 800, pair);
    expect(sel.focal).toEqual({ l: 364, t: 76, r: 412, b: 224 });
    expect([sel.focalW, sel.focalH]).toEqual([504, 500]);
    expect(sel.demoCardW).toBe(480);

    const demo = computeLayout(1280, 800, demoPair);
    expect(demo.focalH).toBe(652);
    expect(demo.demoCardW).toBe(480);
  });

  it("1024×768: the rail docks until the inspector opens, then becomes the pill", () => {
    const pre = computeLayout(1024, 768, { ...base, timelineCollapsed: true });
    expect(pre).toMatchObject({ tier: "lg", railMode: "panel", railDocked: true, pillVisible: false, railW: 336, inspectorW: 384, dockH: 44 });
    expect(pre.focal).toEqual({ l: 364, t: 76, r: 16, b: 72 });
    expect(pre.focalW).toBe(644);

    const sel = computeLayout(1024, 768, { ...pair, timelineCollapsed: true });
    expect(sel).toMatchObject({ railMode: "pill", railDocked: false, pillVisible: true, dockH: 44, panelTop: 76 });
    // the focal top clears the 36px pill + 8 (so the key chip and demo card sit below it, and camera padding knows)
    expect(sel.focal).toEqual({ l: 16, t: 120, r: 412, b: 72 });
    expect(sel.focalW).toBe(596);
    expect(sel.demoCardW).toBe(520);
    // the pill's overlay floats over the map: the focal hole does not move
    expect(computeLayout(1024, 768, { ...pair, timelineCollapsed: true, railOpen: true }).focal).toEqual(sel.focal);
    // expanded by the user, the pair dock fits (focal height stays ≥ 300)
    expect(computeLayout(1024, 768, pair)).toMatchObject({ dockH: 196, dockForced: false });

    const demo = computeLayout(1024, 768, demoPair);
    expect(demo).toMatchObject({ dockH: 44, keyCollapsed: true });
  });

  it("xl under the 3D close-up: the rail folds to its pill, so the diorama gets the rail's width", () => {
    const cu = computeLayout(1440, 900, { ...pair, closeupOpen: true });
    expect(cu).toMatchObject({ tier: "xl", railMode: "pill", railDocked: false, pillVisible: true });
    expect(cu.focal).toEqual({ l: 16, t: 120, r: 446, b: 224 });
    // without an open inspector the rail stays docked, and closing the close-up docks it again
    expect(computeLayout(1440, 900, { ...base, closeupOpen: true }).railDocked).toBe(true);
    expect(computeLayout(1440, 900, pair).railDocked).toBe(true);
  });

  it("768–1023 behaves like lg: docked rail before a pair (hero + Compare visible), pill with it; 360 inspector, dock summary only", () => {
    const pre = computeLayout(800, 1100, base);
    expect(pre).toMatchObject({ tier: "md", railMode: "panel", railDocked: true, pillVisible: false, railW: 336, dockH: 44, dockForced: true });
    expect(pre.focal).toEqual({ l: 364, t: 76, r: 16, b: 72 });
    expect(pre.focalW).toBe(420);

    const md = computeLayout(900, 700, pair);
    expect(md).toMatchObject({ tier: "md", railMode: "pill", railDocked: false, pillVisible: true, inspectorW: 360, dockH: 44, dockForced: true });
    expect(md.focal).toEqual({ l: 16, t: 120, r: 388, b: 72 });
    // never the legacy drawer
    for (const o of [base, pair, demoPair]) expect(computeLayout(800, 1100, o).railMode).not.toBe("drawer");
  });

  it("phone safe areas: a notch moves the panels down, the home indicator lifts the focal bottom", () => {
    const notch = { ...base, isPhone: true, safeTop: 47, safeBottom: 34 };
    const pre = computeLayout(390, 844, notch);
    expect(pre).toMatchObject({ panelTop: 103, sheetH: 166 });
    expect(pre.focal).toEqual({ l: 12, t: 103, r: 12, b: 174 });
    expect(layoutCssVars(pre)).toMatchObject({ "--panel-top": "103px", "--focal-t": "103px", "--sheet-h": "166px", "--focal-b": "174px" });
    // the inspector sheet's 64dvh already contains the inset
    expect(computeLayout(390, 844, { ...notch, inspectorOpen: true, pairSelected: true }).sheetH).toBe(540);
    // the full snap stops under the header (it would otherwise climb over a notched phone's header row)
    expect(computeLayout(390, 844, { ...notch, sheetSnap: "full" }).sheetH).toBe(741);
    // a short top inset never pulls the header above the 12px gutter
    expect(computeLayout(390, 844, { ...notch, safeTop: 4 }).panelTop).toBe(68);
  });

  it("375×812 phone: sheets, no dock", () => {
    const pre = computeLayout(375, 812, { ...base, isPhone: true });
    expect(pre).toMatchObject({ tier: "phone", railMode: "sheet", gutter: 12, panelTop: 68, dockH: 0, sheetH: 132, keyCollapsed: true, demoCardW: 351 });
    expect(pre.focal).toEqual({ l: 12, t: 68, r: 12, b: 140 });
    expect(pre.focalH).toBe(604);
    expect(computeLayout(375, 812, { ...base, isPhone: true, sheetSnap: "half" }).sheetH).toBe(422);
    expect(computeLayout(375, 812, { ...base, isPhone: true, sheetSnap: "full" }).sheetH).toBe(715);

    const sel = computeLayout(375, 812, { ...pair, isPhone: true });
    expect(sel.sheetH).toBe(520);
    expect(sel.focal).toEqual({ l: 12, t: 68, r: 12, b: 528 });
    expect(sel.focalH).toBe(216);
    expect(computeLayout(375, 812, { ...demoPair, isPhone: true }).focal).toEqual(sel.focal);
  });

  it("collapses the dock when the focal hole would be shorter than 300px", () => {
    const short = computeLayout(1440, 560, pair);
    expect(short).toMatchObject({ dockForced: true, dockH: 44 });
  });

  it("hidden UI grows the focal hole to the gutters", () => {
    const h = computeLayout(1440, 900, { ...pair, uiHidden: true });
    expect(h.focal).toEqual({ l: 16, t: 76, r: 16, b: 16 });
    expect(h.dockH).toBe(0);
  });

  it("keeps the focal hole non-negative and inside the viewport at every size", () => {
    for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1280, 720], [1024, 768], [800, 600], [375, 812], [375, 667], [320, 568]])
      for (const o of [base, pair, demoPair, { ...pair, timelineCollapsed: true }]) {
        const l = computeLayout(w, h, { ...o, isPhone: w < 768 });
        expect(l.focalW).toBeGreaterThanOrEqual(0);
        expect(l.focalH).toBeGreaterThanOrEqual(0);
        expect(l.focal.l + l.focalW + l.focal.r).toBe(w);
      }
  });

  it("applies dragged sizes on xl, clamped so the map keeps a usable focal hole", () => {
    const l = computeLayout(1440, 900, { ...pair, railWidth: 480, inspectorWidth: 520, dockHeight: 320 });
    expect(l).toMatchObject({ resizable: true, railW: 480, inspectorW: 520, dockH: 320, dockCollapsed: false });
    expect(l.focal).toEqual({ l: 508, t: 76, r: 548, b: 348 });
    expect(l.focalW).toBeGreaterThanOrEqual(MIN_FOCAL_W);
    // each width stops at its drag limit (rail 540, inspector 620) and at its minimum
    const wide = computeLayout(2560, 1440, { ...pair, railWidth: 9999, inspectorWidth: 9999 });
    expect(wide).toMatchObject({ railW: RAIL.userMax, inspectorW: INSPECTOR.userMax });
    expect(computeLayout(1440, 900, { ...pair, railWidth: 100, inspectorWidth: 100 })).toMatchObject({ railW: RAIL.min, inspectorW: INSPECTOR.min });
  });

  it("dragged widths yield until the focal hole is MIN_FOCAL_W wide (the rail first), never below their minimums", () => {
    const both = computeLayout(1280, 800, { ...pair, railWidth: 540, inspectorWidth: 620 });
    expect(both).toMatchObject({ railW: 336, inspectorW: 528, focalW: MIN_FOCAL_W });
    // the handles' range is what the clamps allow right now
    expect(both).toMatchObject({ railMaxW: 336, inspectorMaxW: 528 });
    // rail alone (inspector closed): it may take everything but the 360px hole, up to its own limit
    const rail = computeLayout(1280, 800, { ...base, railWidth: 540 });
    expect(rail).toMatchObject({ railW: 540, focalW: 1280 - 16 - 540 - 12 - 16 });
    expect(rail.focalW).toBeGreaterThanOrEqual(MIN_FOCAL_W);
    // a wide rail makes room for the inspector when a pair opens (the inspector keeps its automatic width)
    const opened = computeLayout(1280, 800, { ...pair, railWidth: 540 });
    expect(opened).toMatchObject({ inspectorW: 384, railW: 480, focalW: MIN_FOCAL_W });
    // lg: the dragged inspector width applies; the pill's overlay rail shrinks back beside it
    const lg = computeLayout(1024, 768, { ...pair, inspectorWidth: 620, railWidth: 540 });
    expect(lg).toMatchObject({ tier: "lg", railMode: "pill", inspectorW: 620, railW: 336, focalW: MIN_FOCAL_W });
  });

  it("a dragged dock serves both faces and gives way before the map drops under MIN_FOCAL_H", () => {
    // too tall: stops where the focal hole is exactly 300px tall
    const tall = computeLayout(1440, 900, { ...pair, dockHeight: 900 });
    expect(tall).toMatchObject({ dockH: 496, dockMaxH: 496, dockCollapsed: false });
    expect(tall.focalH).toBe(MIN_FOCAL_H);
    // too short: the pair face floors at DOCK.min; the 96px overview strip never drags below its default
    expect(computeLayout(1440, 900, { ...pair, dockHeight: 50 })).toMatchObject({ dockH: DOCK.min, dockMinH: DOCK.min });
    expect(computeLayout(1440, 900, { ...base, dockHeight: 50 })).toMatchObject({ dockH: DOCK.overview, dockMinH: DOCK.overview });
    expect(computeLayout(1440, 900, { ...base, dockHeight: 150 }).dockH).toBe(150);
    // a short window: the dragged pair dock shrinks to keep 300px of map instead of collapsing (the default 196 would)
    expect(computeLayout(1440, 560, pair)).toMatchObject({ dockForced: true, dockH: DOCK.collapsed });
    const short = computeLayout(1440, 560, { ...pair, dockHeight: 300 });
    expect(short).toMatchObject({ dockH: 156, dockForced: false });
    expect(short.focalH).toBe(MIN_FOCAL_H);
    // …until even DOCK.min would cost the map its 300px: then it collapses as before
    expect(computeLayout(1440, 520, { ...pair, dockHeight: 300 })).toMatchObject({ dockForced: true, dockH: DOCK.collapsed });
    // collapsed by the user or the demo: the dragged height waits
    expect(computeLayout(1440, 900, { ...pair, dockHeight: 320, timelineCollapsed: true }).dockH).toBe(DOCK.collapsed);
    expect(computeLayout(1440, 900, { ...demoPair, dockHeight: 320 }).dockH).toBe(DOCK.collapsed);
  });

  it("md and phones ignore dragged sizes", () => {
    const drag = { railWidth: 500, inspectorWidth: 600, dockHeight: 300 };
    expect(computeLayout(900, 1100, { ...base, ...drag })).toMatchObject({ tier: "md", resizable: false, railW: RAIL.min, dockH: DOCK.collapsed });
    expect(computeLayout(900, 700, { ...pair, ...drag })).toMatchObject({ inspectorW: INSPECTOR.md });
    expect(computeLayout(375, 812, { ...pair, ...drag, isPhone: true })).toMatchObject({ tier: "phone", resizable: false, railW: 375, inspectorW: 375, dockH: 0 });
    // garbage from storage is ignored
    expect(computeLayout(1440, 900, { ...pair, railWidth: Number.NaN, inspectorWidth: -40, dockHeight: 0 })).toMatchObject({ railW: 360, inspectorW: 418, dockH: DOCK.pair });
  });

  it("writes px custom properties", () => {
    const vars = layoutCssVars(computeLayout(1440, 900, pair));
    expect(vars).toMatchObject({ "--rail-w": "360px", "--inspector-w": "418px", "--dock-h": "196px", "--focal-l": "388px", "--focal-r": "446px", "--focal-b": "224px", "--panel-top": "76px", "--gutter": "16px" });
  });
});

describe("cameraPadding", () => {
  it("pads the focal hole plus breathing room (top clears the key chip)", () => {
    expect(cameraPadding(computeLayout(1440, 900, pair))).toEqual({ top: 120, right: 470, bottom: 248, left: 412 });
    expect(cameraPadding(computeLayout(1440, 900, base))).toEqual({ top: 120, right: 40, bottom: 148, left: 412 });
  });

  it("clears a guided-demo card at the top, or pinned at the bottom", () => {
    const l = computeLayout(1440, 900, demoPair);
    expect(cameraPadding(l, { top: 76, bottom: 276, left: 500, right: 1020 }).top).toBe(292);
    expect(cameraPadding(l, { top: 600, bottom: 884, left: 16, right: 416 }).bottom).toBe(316);
  });

  it("always leaves a frame for fitBounds (phone with inspector sheet and demo card)", () => {
    const l = computeLayout(375, 812, { ...demoPair, isPhone: true });
    const p = cameraPadding(l, { top: 68, bottom: 268, left: 12, right: 363 });
    expect(p.top + p.bottom).toBeLessThanOrEqual(812 - 80);
    expect(p.left + p.right).toBeLessThanOrEqual(375 - 80);
    expect(p.top).toBeGreaterThan(200);
  });
});

describe("getLayout", () => {
  it("reads the store at call time (outside React; 1440×900 without a window)", () => {
    const initial = useAtlas.getState();
    expect(getLayout()).toEqual(computeLayout(1440, 900, base));
    useAtlas.setState({ selectedMatchId: "desc-6888__gpc-20065", inspectorOpen: true, demoStep: 2 });
    expect(getLayout()).toEqual(computeLayout(1440, 900, demoPair));
    useAtlas.setState(initial, true);
  });

  it("includes the dragged sizes, so camera padding follows a resized panel", () => {
    const initial = useAtlas.getState();
    useAtlas.setState({ selectedMatchId: "desc-6888__gpc-20065", inspectorOpen: true, railWidth: 480, inspectorWidth: 520, dockHeight: 320 });
    const l = getLayout();
    expect(l).toMatchObject({ railW: 480, inspectorW: 520, dockH: 320 });
    expect(cameraPadding(l)).toEqual({ top: 120, right: 572, bottom: 372, left: 532 });
    useAtlas.setState(initial, true);
  });
});
