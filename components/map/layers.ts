import type mapboxgl from "mapbox-gl";
import type { ExpressionSpecification, FilterSpecification } from "mapbox-gl";
import { C, roleColor } from "./palette";

/**
 * map-core's gl-* layers (SPEC §5.8), re-added on every style.load. map-3d owns everything gl3d-*.
 *
 * Encodings (the honesty contract, gaps.md §3 F):
 *  - dots = utilities only (A/B/other hue); filled = named facility / mapped place, hollow = locality (with its
 *    uncertainty halo) or a context terminal ("named, but not where the work is"); county-only places have no point.
 *  - routes: solid = official GIS, dashed = digitized from an official map (schematic).
 *  - flagged pairs: amber link center to center (not a route): solid = place confirmed, dashed at 50% = possible.
 *  - the selected pair: amber connector + a ring of the review radius around A's center (Sperry's rule), centers.
 */

export const SOURCES = [
  "gl-stateline",
  "gl-halos",
  "gl-routes",
  "gl-ring",
  "gl-ring-label",
  "gl-overlaps",
  "gl-overlap-dots",
  "gl-site-legs",
  "gl-connector",
  "gl-points",
  "gl-centers",
] as const;
export type SourceId = (typeof SOURCES)[number];

/** Layers MapStage queries for hover / click / tap. */
export const PAIR_HIT_LAYERS = ["gl-overlap-dots", "gl-overlaps-hit"];
export const PROJECT_HIT_LAYERS = ["gl-points", "gl-routes", "gl-halos-fill"];

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** Values MapStage animates (reveal draw-in, unflagged dimming, the selected connector's draw-on). */
export interface Animated {
  /** Opacity of projects that are in no flagged pair (1 before a run, ~.35 after). */
  unflagged: number;
  /** Flagged links drawn so far, in engine order (Infinity = all). */
  revealK: number;
  /** Opacity multiplier of links ranked after the first 12 during the reveal. */
  restFade: number;
  /** 2D flagged links visible (flat mode, or 3D without map-3d's raised arcs). */
  arcs2D: boolean;
  /** map-3d draws the raised arcs: the selected connector stays on the ground as a faint shadow. */
  raised: boolean;
  /** Connector draw-on progress 0 → 1. */
  trim: number;
}

export const FIRST_WAVE = 12;

const zoomed = (z5: number, z10: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 5, z5, 10, z10];

/** Opacity for a project-bound feature: dimmed "other" (another pair is in view), unflagged after a run, else full. */
function projectOpacity(full: number, other: number, unflagged: number): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "role"], "other"],
    ["case", ["==", ["get", "hot"], true], full, other],
    ["==", ["get", "flagged"], false],
    full * unflagged,
    full,
  ];
}

/**
 * Project dots: a dimmed dot (another pair in view, or unflagged after a run) keeps only a hairline ring in its utility
 * colour over an almost clear fill, so under the 3D pitch it reads as a quiet outline, never a dark pothole.
 */
function dotFill(unflagged: number): ExpressionSpecification {
  return ["case", ["==", ["get", "role"], "other"], ["case", ["==", ["get", "hot"], true], 1, 0.1], ["==", ["get", "flagged"], false], unflagged * unflagged, 1];
}
function dotRing(unflagged: number): ExpressionSpecification {
  return ["case", ["==", ["get", "role"], "other"], ["case", ["==", ["get", "hot"], true], 1, 0.5], ["==", ["get", "flagged"], false], 0.3 + 0.7 * unflagged, 1];
}

/** The pair's place names (gl-point-labels): its two projects' places and a hovered project's, minus the shared site. */
export const POINT_LABEL_FILTER: FilterSpecification = ["all", ["match", ["get", "role"], ["a", "b", "hover"], true, false], ["!=", ["get", "onSite"], true]];

const hollow: ExpressionSpecification = ["any", ["==", ["get", "context"], true], ["==", ["get", "precision"], "locality"]];
const inPair: ExpressionSpecification = ["match", ["get", "role"], ["a", "b"], true, false];

export function addDataLayers(map: mapboxgl.Map, standard: boolean) {
  const top = standard ? { slot: "top" as const } : {};
  const middle = standard ? { slot: "middle" as const } : {};

  if (!map.getSource("ctx-counties"))
    map.addSource("ctx-counties", {
      type: "geojson",
      data: "/geo/counties.json",
    });
  for (const id of SOURCES) {
    if (map.getSource(id)) continue;
    map.addSource(id, {
      type: "geojson",
      data: EMPTY,
      ...(id === "gl-connector" || id === "gl-site-legs" ? { lineMetrics: true } : {}),
    });
  }

  /* ground context */
  map.addLayer({
    id: "ctx-counties-line",
    type: "line",
    source: "ctx-counties",
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.fg3,
      // offline: the bundled county net is the only geography at pair zoom, so it firms up as the map zooms in
      "line-opacity": standard ? 0 : ["interpolate", ["linear"], ["zoom"], 5, 0.08, 8, 0.22, 10, 0.32],
      "line-width": standard ? 0.5 : ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 0.9],
    },
    ...middle,
  });
  map.addLayer({
    id: "ctx-counties-hl-fill",
    type: "fill",
    source: "ctx-counties",
    filter: ["==", ["get", "fips"], "__none__"],
    paint: {
      "fill-emissive-strength": 1,
      "fill-color": C.fg2,
      "fill-opacity": 0.035,
    },
    ...middle,
  });
  map.addLayer({
    id: "ctx-counties-hl-line",
    type: "line",
    source: "ctx-counties",
    filter: ["==", ["get", "fips"], "__none__"],
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.fg3,
      "line-opacity": 0.32,
      "line-width": 0.8,
      "line-dasharray": [2, 2],
    },
    ...middle,
  });

  map.addLayer({
    id: "gl-stateline",
    type: "line",
    source: "gl-stateline",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.fg3,
      "line-opacity": 0.55,
      "line-width": zoomed(1, 1.6),
      "line-dasharray": [2, 2.5],
    },
    ...middle,
  });

  map.addLayer({
    id: "gl-halos-fill",
    type: "fill",
    source: "gl-halos",
    paint: {
      "fill-emissive-strength": 1,
      "fill-color": roleColor,
      "fill-opacity": projectOpacity(0.08, 0.02, 1),
    },
    ...middle,
  });
  map.addLayer({
    id: "gl-halos-line",
    type: "line",
    source: "gl-halos",
    paint: {
      "line-emissive-strength": 1,
      "line-color": roleColor,
      "line-opacity": projectOpacity(0.5, 0.1, 1),
      "line-width": 0.9,
      "line-dasharray": [1.5, 1.5],
    },
    ...middle,
  });

  /* Sperry's rule around A's center */
  map.addLayer({
    id: "gl-ring-fill",
    type: "fill",
    source: "gl-ring",
    paint: {
      "fill-emissive-strength": 1,
      "fill-color": C.overlap,
      "fill-opacity": 0.05,
    },
    ...middle,
  });
  map.addLayer({
    id: "gl-ring-glow",
    type: "line",
    source: "gl-ring",
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.overlap,
      "line-opacity": 0.14,
      "line-width": zoomed(6, 14),
      "line-blur": zoomed(5, 12),
    },
    ...middle,
  });
  map.addLayer({
    id: "gl-ring",
    type: "line",
    source: "gl-ring",
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.overlap,
      "line-opacity": 0.55,
      "line-width": 1.25,
    },
    ...middle,
  });

  /* routes: solid = official GIS, dashed = digitized schematic; a dark casing instead of a glow */
  map.addLayer({
    id: "gl-routes-casing",
    type: "line",
    source: "gl-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.canvas,
      "line-width": zoomed(3.5, 6),
      "line-opacity": projectOpacity(0.55, 0.2, 1),
    },
    ...top,
  });
  map.addLayer({
    id: "gl-routes",
    type: "line",
    source: "gl-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": roleColor,
      "line-width": zoomed(1.5, 3),
      "line-opacity": projectOpacity(0.95, 0.28, 1),
      "line-dasharray": ["case", ["==", ["get", "precision"], "official-map-digitized"], ["literal", [2.2, 1.6]], ["literal", [1, 0]]],
    },
    ...top,
  });

  /* every flagged pair: amber link between centers (2D; map-3d raises them in 3D) */
  map.addLayer({
    id: "gl-overlaps",
    type: "line",
    source: "gl-overlaps",
    layout: { "line-cap": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.overlap,
      // the region's first wave at full weight; the rest a faint hairline (a hub with 60 links is not a tangle)
      "line-width": ["case", ["get", "hover"], 2.75, ["get", "top"], 1.5, 1],
      "line-opacity": 0.9,
      "line-dasharray": ["case", ["==", ["get", "geo"], "confirmed"], ["literal", [1, 0]], ["literal", [2, 2]]],
    },
    ...top,
  });
  // generous invisible hit area for hover / click / tap on the thin links
  map.addLayer({
    id: "gl-overlaps-hit",
    type: "line",
    source: "gl-overlaps",
    filter: ["!", ["get", "selected"]],
    paint: { "line-color": C.overlap, "line-width": 14, "line-opacity": 0 },
    ...top,
  });

  /* shared-site pairs: each center to the site (the stated or implied facility is the place evidence) */
  map.addLayer({
    id: "gl-site-legs",
    type: "line",
    source: "gl-site-legs",
    layout: { "line-cap": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.overlap,
      "line-width": zoomed(2, 2.75),
      "line-opacity": 0.9,
    },
    ...top,
  });

  /* the selected pair's center-to-center measurement ("not a route") */
  map.addLayer({
    id: "gl-connector",
    type: "line",
    source: "gl-connector",
    layout: { "line-cap": "round" },
    paint: {
      "line-emissive-strength": 1,
      "line-color": C.overlap,
      "line-width": ["case", ["get", "beyond"], 1.5, 2.75],
      "line-opacity": ["case", ["get", "beyond"], 0.5, ["==", ["get", "geo"], "confirmed"], 1, 0.6],
      "line-dasharray": ["case", ["all", ["==", ["get", "geo"], "confirmed"], ["!", ["get", "beyond"]]], ["literal", [1, 0]], ["literal", [2, 2]]],
    },
    ...top,
  });

  /* project dots: ground dots in both modes (gl-points stays rendered in 3D) */
  map.addLayer({
    id: "gl-points",
    type: "circle",
    source: "gl-points",
    paint: {
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        ["case", inPair, 5.5, ["==", ["get", "context"], true], 2.75, 3.5],
        10,
        ["case", inPair, 9, ["==", ["get", "context"], true], 5, 7],
      ],
      "circle-color": ["case", hollow, C.canvas, roleColor],
      "circle-stroke-color": [
        "case",
        inPair,
        ["case", hollow, roleColor, C.fg1],
        ["==", ["get", "hot"], true],
        C.fg1,
        hollow,
        roleColor,
        ["any", ["==", ["get", "role"], "other"], ["==", ["get", "flagged"], false]],
        roleColor,
        C.canvas,
      ],
      "circle-stroke-width": ["case", inPair, 1.75, ["==", ["get", "hot"], true], 1.5, hollow, 1.5, 1],
      "circle-opacity": dotFill(1),
      "circle-stroke-opacity": dotRing(1),
    },
    ...top,
  });

  // invisible midpoints: an easier target for a flagged pair on touch screens
  map.addLayer({
    id: "gl-overlap-dots",
    type: "circle",
    source: "gl-overlap-dots",
    filter: ["!", ["get", "selected"]],
    paint: {
      "circle-radius": 9,
      "circle-color": C.overlap,
      "circle-opacity": 0,
      "circle-stroke-width": 0,
    },
    ...top,
  });

  /* the pair's two centers (the sponsor's distance anchors) */
  map.addLayer({
    id: "gl-centers",
    type: "circle",
    source: "gl-centers",
    paint: {
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
      // a tinted disc in the utility colour with a bright ring: a center reads as a lit marker, never a dark hole
      "circle-radius": zoomed(5, 7.5),
      "circle-color": ["match", ["get", "role"], "a", C.a, C.b],
      "circle-opacity": 0.28,
      "circle-stroke-color": ["match", ["get", "role"], "a", C.a, C.b],
      "circle-stroke-width": 2,
    },
    ...top,
  });
  map.addLayer({
    id: "gl-centers-core",
    type: "circle",
    source: "gl-centers",
    paint: {
      "circle-emissive-strength": 1,
      "circle-pitch-alignment": "map",
      "circle-radius": zoomed(2, 2.75),
      "circle-color": C.fg1,
    },
    ...top,
  });

  if (standard) {
    // Standard carries glyphs; the offline style has none, so its only text is the HTML callouts
    const font = ["DIN Pro Medium", "Arial Unicode MS Regular"];
    map.addLayer({
      id: "gl-stateline-label",
      type: "symbol",
      source: "gl-stateline",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["upcase", ["get", "label"]],
        "text-font": font,
        "text-size": 11,
        "text-letter-spacing": 0.12,
        "text-rotate": ["get", "rotate"],
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "map",
        "text-offset": [0, -1],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-emissive-strength": 1,
        "text-color": C.fg3,
        "text-halo-color": C.canvas,
        "text-halo-width": 1.4,
        "text-opacity": 0.85,
      },
      ...top,
    });
    map.addLayer({
      id: "gl-ring-label",
      type: "symbol",
      source: "gl-ring-label",
      layout: {
        "text-field": ["get", "label"],
        "text-font": font,
        "text-size": 11,
        "text-letter-spacing": 0.02,
        "text-anchor": "bottom",
        "text-offset": [0, -0.5],
        "text-max-width": 14,
        "text-optional": true,
      },
      paint: {
        "text-emissive-strength": 1,
        "text-color": C.overlap,
        "text-halo-color": C.canvas,
        "text-halo-width": 1.4,
        "text-opacity": 0.9,
      },
      ...top,
    });
    map.addLayer({
      id: "gl-point-labels",
      type: "symbol",
      source: "gl-points",
      filter: POINT_LABEL_FILTER,
      layout: {
        "text-field": ["get", "label"],
        "text-font": font,
        "text-size": 11,
        "text-offset": [0, 1.15],
        "text-anchor": "top",
        "text-optional": true,
        "text-max-width": 10,
      },
      paint: {
        "text-emissive-strength": 1,
        "text-color": C.fg2,
        "text-halo-color": C.canvas,
        "text-halo-width": 1.4,
      },
      ...top,
    });
  }
}

/** A layer exists in the live style (false mid style-swap, and on a removed map, where getLayer itself throws). */
export function hasLayer(map: mapboxgl.Map, layer: string): boolean {
  try {
    return !!map.getLayer(layer);
  } catch {
    return false;
  }
}

/** Guarded setters: a layer can be missing mid style-swap (and must never raise a style error). */
function paint(map: mapboxgl.Map, layer: string, prop: string, value: unknown) {
  if (!hasLayer(map, layer)) return;
  try {
    map.setPaintProperty(layer, prop as never, value as never);
  } catch {
    /* presentation-only */
  }
}
function filter(map: mapboxgl.Map, layer: string, value: FilterSpecification | null) {
  if (!hasLayer(map, layer)) return;
  try {
    map.setFilter(layer, value);
  } catch {
    /* presentation-only */
  }
}
export function visibility(map: mapboxgl.Map, layer: string, visible: boolean) {
  if (!hasLayer(map, layer)) return;
  const v = visible ? "visible" : "none";
  try {
    if (map.getLayoutProperty(layer, "visibility") !== v) map.setLayoutProperty(layer, "visibility", v);
  } catch {
    /* presentation-only */
  }
}

/** Apply the animated values (cheap: a handful of paint/filter calls, fine per frame for a short tween). */
export function applyAnimated(map: mapboxgl.Map, s: Animated) {
  const u = s.unflagged;
  paint(map, "gl-points", "circle-opacity", dotFill(u));
  paint(map, "gl-points", "circle-stroke-opacity", dotRing(u));
  paint(map, "gl-routes", "line-opacity", projectOpacity(0.95, 0.28, u));
  paint(map, "gl-routes-casing", "line-opacity", projectOpacity(0.55, 0.2, u));
  paint(map, "gl-halos-fill", "fill-opacity", projectOpacity(0.08, 0.02, u));
  paint(map, "gl-halos-line", "line-opacity", projectOpacity(0.5, 0.1, u));

  const k = Number.isFinite(s.revealK) ? s.revealK : 1e9;
  filter(map, "gl-overlaps", ["all", ["<=", ["get", "order"], k], ["!", ["get", "selected"]]]);
  paint(map, "gl-overlaps", "line-opacity", [
    "*",
    ["case", [">", ["get", "order"], FIRST_WAVE], s.restFade, 1],
    ["case", ["get", "hover"], 1, ["get", "top"], 1, 0.3],
    ["case", ["get", "dim"], 0.07, ["get", "hover"], 1, ["==", ["get", "geo"], "confirmed"], 0.9, 0.5],
  ]);
  visibility(map, "gl-overlaps", s.arcs2D);

  // raised arcs (map-3d) carry the selected pair in 3D: the ground connector (kept, with its feature, for the hit
  // tests and Flat map) and the flat site legs step out of sight, so the pair never reads as two links
  paint(map, "gl-connector", "line-opacity", ["*", s.raised ? 0 : 1, ["case", ["get", "beyond"], 0.5, ["==", ["get", "geo"], "confirmed"], 1, 0.6]]);
  // trim [p, 1] hides the part not yet drawn: the link grows from A's center to B's (and each leg toward the site)
  const p = Math.max(0, Math.min(1, s.trim));
  paint(map, "gl-connector", "line-trim-offset", [p, 1]);
  paint(map, "gl-site-legs", "line-trim-offset", [p, 1]);
  paint(map, "gl-site-legs", "line-opacity", s.raised ? 0 : 0.9);
}
