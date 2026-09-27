import type mapboxgl from "mapbox-gl";
import type { StyleSpecification } from "mapbox-gl";
import type { Basemap } from "@/lib/store";

/** Public Mapbox token (inlined at build time). Without one the map runs on the bundled offline style. */
export const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Terrain relief in 3D: modest, so the tilted overview still reads as a map (presentation only). */
export const TERRAIN_EXAGGERATION = 1.35;

/** Standard night look (SPEC §5.8). Kept in one place so the screenshot comparisons change one value. */
export const LOOK = {
  lightPreset: "night" as "night" | "dusk",
  theme: "faded" as "default" | "faded" | "monochrome",
  satellitePreset: "dusk" as "night" | "dusk" | "day",
};

const FOG = {
  range: [1.5, 12] as [number, number],
  color: "rgb(9, 13, 22)",
  "high-color": "rgb(19, 27, 50)",
  "horizon-blend": 0.14,
  "space-color": "rgb(5, 8, 14)",
  "star-intensity": 0.1,
};

/** Bundled fallback: Census states (+ counties added by the data layers), lit so the 3D models stay readable. */
export function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    name: "GridLock offline",
    sources: {
      "ctx-states": { type: "geojson", data: "/geo/states.json" },
    },
    fog: FOG,
    lights: [
      {
        id: "ambient",
        type: "ambient",
        properties: { color: "#aab6cc", intensity: 0.55 },
      },
      {
        id: "key",
        type: "directional",
        properties: {
          color: "#ffffff",
          intensity: 0.6,
          direction: [210, 40],
          "cast-shadows": false,
        },
      },
    ],
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": "#04070c" },
      },
      {
        id: "ctx-states-fill",
        type: "fill",
        source: "ctx-states",
        paint: {
          "fill-emissive-strength": 1,
          "fill-color": "#0a111c",
          "fill-opacity": 1,
        },
      },
      {
        id: "ctx-states-line",
        type: "line",
        source: "ctx-states",
        paint: {
          "line-emissive-strength": 1,
          "line-color": "#2c3d5a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 9, 1.8],
        },
      },
    ],
  } as StyleSpecification;
}

export function isStandard(basemap: Basemap) {
  return basemap !== "offline" && !!TOKEN;
}

export function styleFor(basemap: Basemap): string | StyleSpecification {
  if (!isStandard(basemap)) return offlineStyle();
  return basemap === "satellite" ? "mapbox://styles/mapbox/standard-satellite" : "mapbox://styles/mapbox/standard";
}

/** Mapbox Standard configuration: quiet, dark, only the labels a planner needs (unknown keys are ignored by 3.31). */
export function configureStandard(map: mapboxgl.Map, basemap: Basemap) {
  if (!isStandard(basemap)) return;
  const set = (k: string, v: unknown) => {
    try {
      map.setConfigProperty("basemap", k, v);
    } catch {
      /* property not supported by this style version */
    }
  };
  set("showPointOfInterestLabels", false);
  set("showTransitLabels", false);
  set("show3dObjects", false);
  set("showPedestrianRoads", false);
  set("showLandmarkIcons", false);
  set("showLandmarkIconLabels", false);
  set("showRoadLabels", false);
  set("showAdminBoundaries", true);
  if (basemap === "night") {
    set("lightPreset", LOOK.lightPreset);
    set("theme", LOOK.theme);
    set("colorPlaceLabels", "#838c9d");
    set("colorAdminBoundaries", "#3a4560");
    set("roadsBrightness", 0.35);
  } else {
    set("lightPreset", LOOK.satellitePreset);
    set("colorPlaceLabels", "#dfe3ea");
    set("colorAdminBoundaries", "#8a93a4");
  }
  map.setFog(FOG);
}

/** 3D terrain on Standard basemaps only (the offline style has no DEM); Flat map never tilts or lifts anything. */
export function applyTerrain(map: mapboxgl.Map, mode: "3d" | "flat", basemap: Basemap) {
  // a style swap may still be loading; "style.load" re-applies terrain once it is ready
  if (!map.isStyleLoaded()) return;
  if (!isStandard(basemap)) {
    map.setTerrain(null);
    return;
  }
  if (!map.getSource("mapbox-dem")) {
    map.addSource("mapbox-dem", {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    });
  }
  map.setTerrain(mode === "3d" ? { source: "mapbox-dem", exaggeration: TERRAIN_EXAGGERATION } : null);
}

/** Our own sources and layers: an error on one of them is never a basemap failure. */
const OUR_SOURCE = /^(ctx-|gl-|gl3d-)/;

/**
 * Whether a map "error" event means the basemap itself is unreachable (SPEC §5.8): 401/403, or a network failure on a
 * Mapbox source/URL. Never reacts to style-validation noise ("does not exist", "layer", "model", "glyphs") — map-3d
 * touching a layer mid style-swap must never flip the app to Offline.
 */
export function isBasemapFailure(e: { error?: unknown; sourceId?: string }): boolean {
  const err = (e.error ?? {}) as {
    status?: number;
    message?: string;
    url?: string;
  };
  const msg = String(err.message ?? "");
  if (/does not exist|layer|model|glyph|sprite|image|font/i.test(msg)) return false;
  const sourceId = typeof e.sourceId === "string" ? e.sourceId : undefined;
  if (sourceId && OUR_SOURCE.test(sourceId)) return false;
  const url = String(err.url ?? "");
  if (url && !/mapbox\.(com|cn)|^mapbox:/.test(url)) return false;
  if (err.status === 401 || err.status === 403) return true;
  // no url and no source: the style / tile fetch itself (every remote request on a Standard basemap goes to Mapbox)
  return /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
}
