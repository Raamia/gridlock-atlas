import { describe, expect, it } from "vitest";
import { cameraPadding, computeLayout, getLayout, layoutCssVars, tierOf, type LayoutOptions } from "@/lib/layout";
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
    expect(pre).toMatchObject({ tier: "xl", railMode: "panel", railDocked: true, gutter: 16, panelTop: 76, railW: 360, inspectorW: 418, dockH: 150 });
    expect(pre.focal).toEqual({ l: 388, t: 76, r: 16, b: 178 });
    expect([pre.focalW, pre.focalH]).toEqual([1036, 646]);
    expect(pre.keyCollapsed).toBe(false);
    expect(pre.demoCardW).toBe(520);

    const sel = computeLayout(1440, 900, pair);
    expect(sel.dockH).toBe(244);
    expect(sel.focal).toEqual({ l: 388, t: 76, r: 446, b: 272 });
    expect([sel.focalW, sel.focalH]).toEqual([606, 552]);
    expect(sel.keyCollapsed).toBe(true);

    const demo = computeLayout(1440, 900, demoPair);
    expect(demo).toMatchObject({ dockH: 44, dockCollapsed: true, dockForced: true, keyCollapsed: true });
    expect(demo.focal.b).toBe(72);
    expect(demo.focalH).toBe(752);
    // steps 1 and 4 keep the dock open
    expect(computeLayout(1440, 900, { ...demoPair, demoStep: 3 }).dockH).toBe(244);
    expect(computeLayout(1440, 900, { ...base, demoOn: true, demoStep: 0 }).dockH).toBe(150);
  });

  it("1280×800: minimum panel widths; the demo card shrinks to the focal hole", () => {
    const pre = computeLayout(1280, 800, base);
    expect(pre).toMatchObject({ tier: "xl", railW: 336, inspectorW: 384, dockH: 150 });
    expect(pre.focal).toEqual({ l: 364, t: 76, r: 16, b: 178 });
    expect(pre.focalW).toBe(900);
    expect(pre.keyCollapsed).toBe(false);

    const sel = computeLayout(1280, 800, pair);
    expect(sel.focal).toEqual({ l: 364, t: 76, r: 412, b: 272 });
    expect([sel.focalW, sel.focalH]).toEqual([504, 452]);
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
    expect(sel).toMatchObject({ railMode: "pill", railDocked: false, pillVisible: true, dockH: 44 });
    expect(sel.focal).toEqual({ l: 16, t: 76, r: 412, b: 72 });
    expect(sel.focalW).toBe(596);
    expect(sel.demoCardW).toBe(520);
    // the pill's overlay floats over the map: the focal hole does not move
    expect(computeLayout(1024, 768, { ...pair, timelineCollapsed: true, railOpen: true }).focal).toEqual(sel.focal);
    // expanded by the user, the pair dock fits (focal height stays ≥ 300)
    expect(computeLayout(1024, 768, pair)).toMatchObject({ dockH: 244, dockForced: false });

    const demo = computeLayout(1024, 768, demoPair);
    expect(demo).toMatchObject({ dockH: 44, keyCollapsed: true });
  });

  it("768–1023: drawer rail, 360 inspector, dock summary only", () => {
    const md = computeLayout(900, 700, pair);
    expect(md).toMatchObject({ tier: "md", railMode: "drawer", pillVisible: true, inspectorW: 360, dockH: 44, dockForced: true });
    expect(md.focal).toEqual({ l: 16, t: 76, r: 388, b: 72 });
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

  it("applies dragged sizes, clamped so the map keeps a usable focal hole", () => {
    const l = computeLayout(1440, 900, { ...pair, railWidth: 480, inspectorWidth: 520, dockHeight: 320 });
    expect(l).toMatchObject({ railW: 480, inspectorW: 520, dockH: 320 });
    expect(l.focalW).toBeGreaterThanOrEqual(360);
    // too wide for both: each panel yields (never below its minimum) until the focal hole is 360px again
    const wide = computeLayout(1280, 800, { ...pair, railWidth: 540, inspectorWidth: 620 });
    expect(wide).toMatchObject({ railW: 336, inspectorW: 528, focalW: 360 });
    // a tall dock stops where the focal hole would drop under 300px
    expect(computeLayout(1440, 900, { ...pair, dockHeight: 900 }).focalH).toBe(300);
    // phones ignore dragged sizes
    expect(computeLayout(375, 812, { ...pair, isPhone: true, railWidth: 500 }).railW).toBe(375);
  });

  it("writes px custom properties", () => {
    const vars = layoutCssVars(computeLayout(1440, 900, pair));
    expect(vars).toMatchObject({ "--rail-w": "360px", "--inspector-w": "418px", "--dock-h": "244px", "--focal-l": "388px", "--focal-r": "446px", "--focal-b": "272px", "--panel-top": "76px", "--gutter": "16px" });
  });
});

describe("cameraPadding", () => {
  it("pads the focal hole plus breathing room (top clears the key chip)", () => {
    expect(cameraPadding(computeLayout(1440, 900, pair))).toEqual({ top: 120, right: 470, bottom: 296, left: 412 });
    expect(cameraPadding(computeLayout(1440, 900, base))).toEqual({ top: 120, right: 40, bottom: 202, left: 412 });
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
});
