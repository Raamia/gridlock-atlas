"use client";

import mapboxgl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import { usePreviewPair, useReducedMotion, useSelectedPair } from "@/lib/hooks";
import {
  anchorOf,
  boundsOf,
  centerFeatures,
  connectorFeature,
  overlapFeatures,
  haloFeatures,
  pointFeatures,
  projectCoords,
  projectCounties,
  routeFeatures,
  sharedSite,
  type RoleContext,
} from "@/lib/mapdata";
import { ownerNames } from "@/lib/selectors";
import { useAtlas, type Basemap } from "@/lib/store";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const COLORS = {
  a: "#2fd6f2",
  b: "#a78bfa",
  u1: "#56c7de",
  u2: "#9d8cf0",
  hover: "#eef3fc",
  all: "#8fa2c7",
  other: "#5d6a87",
  amber: "#fbbf24",
};

const roleColor: mapboxgl.ExpressionSpecification = [
  "match",
  ["get", "role"],
  "a",
  COLORS.a,
  "b",
  COLORS.b,
  "u1",
  COLORS.u1,
  "u2",
  COLORS.u2,
  "hover",
  COLORS.hover,
  "other",
  COLORS.other,
  COLORS.all,
];

const roleOpacity = (base: number, dim: number): mapboxgl.ExpressionSpecification => ["match", ["get", "role"], "other", dim, base];

/* ---------------------------------- styles ---------------------------------- */

function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    name: "GridLock offline",
    sources: {
      "ctx-states": { type: "geojson", data: "/geo/states.json" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#060d1c" } },
      { id: "ctx-states-fill", type: "fill", source: "ctx-states", paint: { "fill-emissive-strength": 1, "fill-color": "#0b1528", "fill-opacity": 1 } },
      { id: "ctx-states-line", type: "line", source: "ctx-states", paint: { "line-emissive-strength": 1, "line-color": "#2a3a5c", "line-width": 1.1 } },
    ],
  };
}

function styleFor(basemap: Basemap): string | StyleSpecification {
  if (basemap === "offline" || !TOKEN) return offlineStyle();
  return basemap === "satellite" ? "mapbox://styles/mapbox/standard-satellite" : "mapbox://styles/mapbox/standard";
}

function isStandard(basemap: Basemap) {
  return basemap !== "offline" && !!TOKEN;
}

/* ---------------------------------- layers ---------------------------------- */

function addDataLayers(map: mapboxgl.Map, basemap: Basemap) {
  const slot = isStandard(basemap) ? { slot: "top" as const } : {};
  const empty = { type: "FeatureCollection" as const, features: [] };

  if (!map.getSource("ctx-counties")) map.addSource("ctx-counties", { type: "geojson", data: "/geo/counties.json" });
  for (const id of ["gl-halos", "gl-routes", "gl-points", "gl-connector", "gl-overlaps", "gl-overlap-dots", "gl-centers"]) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
  }

  // county context: faint everywhere offline; highlighted for the counties the visible projects name
  map.addLayer({
    id: "ctx-counties-line",
    type: "line",
    source: "ctx-counties",
    paint: { "line-emissive-strength": 1, "line-color": "#8aa0ce", "line-opacity": basemap === "offline" ? 0.13 : 0.0, "line-width": 0.6 },
    ...slot,
  });
  map.addLayer({
    id: "ctx-counties-hl-fill",
    type: "fill",
    source: "ctx-counties",
    filter: ["==", ["get", "fips"], "__none__"],
    paint: { "fill-emissive-strength": 1, "fill-color": "#8aa0ce", "fill-opacity": 0.05 },
    ...slot,
  });
  map.addLayer({
    id: "ctx-counties-hl-line",
    type: "line",
    source: "ctx-counties",
    filter: ["==", ["get", "fips"], "__none__"],
    paint: { "line-emissive-strength": 1, "line-color": "#8aa0ce", "line-opacity": 0.4, "line-width": 1, "line-dasharray": [2, 2] },
    ...slot,
  });

  map.addLayer({
    id: "gl-halos-fill",
    type: "fill",
    source: "gl-halos",
    paint: { "fill-emissive-strength": 1, "fill-color": roleColor, "fill-opacity": roleOpacity(0.1, 0.03) },
    ...slot,
  });
  map.addLayer({
    id: "gl-halos-line",
    type: "line",
    source: "gl-halos",
    paint: { "line-emissive-strength": 1, "line-color": roleColor, "line-opacity": roleOpacity(0.55, 0.15), "line-width": 1, "line-dasharray": [1.5, 1.5] },
    ...slot,
  });

  map.addLayer({
    id: "gl-routes-glow",
    type: "line",
    source: "gl-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-emissive-strength": 1, "line-color": roleColor, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 6, 10, 14], "line-blur": 8, "line-opacity": roleOpacity(0.35, 0.05) },
    ...slot,
  });
  map.addLayer({
    id: "gl-routes",
    type: "line",
    source: "gl-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-emissive-strength": 1,
      "line-color": roleColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 3.5],
      "line-opacity": roleOpacity(0.95, 0.3),
      "line-dasharray": ["case", ["==", ["get", "precision"], "official-map-digitized"], ["literal", [2.2, 1.6]], ["literal", [1, 0]]],
    },
    ...slot,
  });

  // every flagged pair: amber link between project centers (drawn under the project geometry)
  map.addLayer({
    id: "gl-overlaps-glow",
    type: "line",
    source: "gl-overlaps",
    layout: { "line-cap": "round" },
    paint: { "line-emissive-strength": 1,
      "line-color": COLORS.amber,
      "line-width": ["interpolate", ["linear"], ["get", "priority"], 20, 4, 100, 12],
      "line-blur": 6,
      "line-opacity": ["case", ["get", "selected"], 0.5, ["get", "dim"], 0, 0.22],
    },
    ...slot,
  });
  map.addLayer({
    id: "gl-overlaps",
    type: "line",
    source: "gl-overlaps",
    layout: { "line-cap": "round" },
    paint: { "line-emissive-strength": 1,
      "line-color": COLORS.amber,
      "line-width": ["interpolate", ["linear"], ["get", "priority"], 20, 1.2, 100, 2.6],
      "line-opacity": ["case", ["get", "selected"], 0, ["get", "dim"], 0.05, 0.75],
      "line-dasharray": [1, 1.6],
    },
    ...slot,
  });

  map.addLayer({
    id: "gl-connector",
    type: "line",
    source: "gl-connector",
    paint: { "line-emissive-strength": 1, "line-color": COLORS.amber, "line-width": 1.6, "line-dasharray": [0.5, 2], "line-opacity": 0.9 },
    layout: { "line-cap": "round" },
    ...slot,
  });

  map.addLayer({
    id: "gl-points-halo",
    type: "circle",
    source: "gl-points",
    paint: { "circle-emissive-strength": 1,
      "circle-radius": ["match", ["get", "precision"], "named-facility", 9, 6],
      "circle-color": roleColor,
      "circle-opacity": roleOpacity(0.18, 0.04),
      "circle-blur": 0.4,
    },
    ...slot,
  });
  map.addLayer({
    id: "gl-points",
    type: "circle",
    source: "gl-points",
    paint: { "circle-emissive-strength": 1,
      "circle-radius": ["match", ["get", "precision"], "named-facility", 4.5, 3.5],
      "circle-color": ["match", ["get", "precision"], "named-facility", roleColor, "rgba(12,21,40,0.9)"],
      "circle-stroke-color": ["match", ["get", "precision"], "named-facility", "rgba(4,9,20,0.9)", roleColor],
      "circle-stroke-width": ["match", ["get", "precision"], "named-facility", 1.2, 1.8],
      "circle-opacity": roleOpacity(1, 0.35),
      "circle-stroke-opacity": roleOpacity(1, 0.35),
    },
    ...slot,
  });

  map.addLayer({
    id: "gl-overlap-dots",
    type: "circle",
    source: "gl-overlap-dots",
    paint: { "circle-emissive-strength": 1,
      "circle-radius": ["interpolate", ["linear"], ["get", "priority"], 20, 3.5, 100, 7],
      "circle-color": COLORS.amber,
      "circle-opacity": ["case", ["get", "selected"], 0, ["get", "dim"], 0.12, 0.95],
      "circle-stroke-color": "rgba(4,9,20,0.9)",
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": ["case", ["get", "selected"], 0, ["get", "dim"], 0.1, 1],
    },
    ...slot,
  });

  map.addLayer({
    id: "gl-centers",
    type: "circle",
    source: "gl-centers",
    paint: { "circle-emissive-strength": 1,
      "circle-radius": 5,
      "circle-color": "rgba(4,9,20,0.6)",
      "circle-stroke-color": ["match", ["get", "role"], "a", COLORS.a, COLORS.b],
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "map",
    },
    ...slot,
  });

  if (isStandard(basemap)) {
    map.addLayer({
      id: "gl-point-labels",
      type: "symbol",
      source: "gl-points",
      filter: ["match", ["get", "role"], ["a", "b", "hover"], true, false],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
        "text-max-width": 10,
      },
      paint: { "text-emissive-strength": 1, "text-color": "#c1cbe0", "text-halo-color": "#040914", "text-halo-width": 1.4 },
      ...slot,
    });
  }
}

function applyTerrain(map: mapboxgl.Map, mode: "3d" | "flat", basemap: Basemap) {
  // a style swap may still be loading; "style.load" re-applies terrain once it is ready
  if (!map.isStyleLoaded()) return;
  if (!isStandard(basemap)) {
    map.setTerrain(null);
    return;
  }
  if (!map.getSource("mapbox-dem")) {
    map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
  }
  map.setTerrain(mode === "3d" ? { source: "mapbox-dem", exaggeration: 1.8 } : null);
}

function configureStandard(map: mapboxgl.Map, basemap: Basemap) {
  if (!isStandard(basemap)) return;
  const set = (k: string, v: unknown) => {
    try {
      map.setConfigProperty("basemap", k, v);
    } catch {
      /* property not supported by this style version */
    }
  };
  set("lightPreset", "night");
  set("showPointOfInterestLabels", false);
  set("showTransitLabels", false);
  set("show3dObjects", false);
  set("showPedestrianRoads", false);
  set("showLandmarkIcons", false);
  if (basemap === "night") {
    set("theme", "default");
    set("showRoadLabels", false);
    set("roadsBrightness", 0.55);
    set("colorPlaceLabels", "#9aa8c6");
  }
  map.setFog({
    color: "rgb(8, 15, 31)",
    "high-color": "rgb(14, 24, 48)",
    "horizon-blend": 0.08,
    "space-color": "rgb(4, 9, 20)",
    "star-intensity": 0.25,
  });
}

/* --------------------------------- component --------------------------------- */

export default function MapStage() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const popup = useRef<mapboxgl.Popup | null>(null);
  const [styleReady, setStyleReady] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const reduced = useReducedMotion();

  const basemap = useAtlas((s) => s.basemap);
  const mapMode = useAtlas((s) => s.mapMode);
  const region = useAtlas((s) => s.region);
  const hoveredProjectId = useAtlas((s) => s.hoveredProjectId);
  const cameraNonce = useAtlas((s) => s.cameraNonce);
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const run = useAtlas((s) => s.run);
  const set = useAtlas((s) => s.set);
  const preview = usePreviewPair();
  const selected = useSelectedPair();

  const visibleProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of SNAPSHOT.projects) {
      if (region !== "all" && p.region !== region) continue;
      if (run && run.excludedProjects.some((x) => x.projectId === p.id) && preview?.a.id !== p.id && preview?.b.id !== p.id) continue;
      ids.add(p.id);
    }
    if (preview) {
      ids.add(preview.a.id);
      ids.add(preview.b.id);
    }
    return ids;
  }, [region, run, preview]);

  /* init */
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const startOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const initialBasemap: Basemap = startOffline ? "offline" : useAtlas.getState().basemap;
    if (startOffline) set({ basemap: "offline", basemapFailed: true });
    const all = boundsOf(SNAPSHOT.projects.flatMap(projectCoords));
    const map = new mapboxgl.Map({
      container: el.current,
      style: styleFor(initialBasemap),
      bounds: (all as LngLatBoundsLike) ?? [
        [-104, 30],
        [-86, 49],
      ],
      fitBoundsOptions: { padding: 60 },
      pitch: 0,
      // globe + terrain fails to draw on some GPUs; mercator is also the honest reading projection
      projection: "mercator",
      attributionControl: false,
      logoPosition: "bottom-right",
      maxPitch: 70,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: mapboxgl.Map }).__map = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);

    map.on("style.load", () => {
      const bm = useAtlas.getState().basemap;
      configureStandard(map, bm);
      addDataLayers(map, bm);
      // enabling terrain during the first style load can stall the first frame on some GPUs; wait for idle
      map.once("idle", () => {
        try {
          applyTerrain(map, useAtlas.getState().mapMode, useAtlas.getState().basemap);
        } catch {
          /* presentation-only */
        }
      });
      setStyleReady((n) => n + 1);
    });

    map.once("load", () => setMapReady(true));
    map.on("error", (e) => {
      const status = (e.error as { status?: number } | undefined)?.status;
      const msg = String(e.error?.message ?? "");
      const tileOrStyleFailure = status === 401 || status === 403 || /Failed to fetch|NetworkError|style/i.test(msg);
      if (tileOrStyleFailure && useAtlas.getState().basemap !== "offline") {
        set({ basemap: "offline", basemapFailed: true });
      }
    });

    const hoverLayers = ["gl-overlap-dots", "gl-overlaps", "gl-routes", "gl-points", "gl-halos-fill"];
    map.on("click", (ev) => {
      const layers = ["gl-overlap-dots", "gl-overlaps"].filter((l) => map.getLayer(l));
      const f = map.queryRenderedFeatures(ev.point, { layers })[0];
      const id = f?.properties?.id as string | undefined;
      if (id) useAtlas.getState().select(id);
    });
    const onMove = (ev: mapboxgl.MapMouseEvent) => {
      const layers = hoverLayers.filter((l) => map.getLayer(l));
      const all = map.queryRenderedFeatures(ev.point, { layers });
      const ov = all.find((x) => x.layer?.id === "gl-overlap-dots" || x.layer?.id === "gl-overlaps");
      if (ov && ov.properties?.id) {
        map.getCanvas().style.cursor = "pointer";
        const m = useAtlas.getState().run?.matches.find((x) => x.id === ov.properties!.id);
        if (m) {
          const pa = IDX.project(m.projectAId);
          const pb = IDX.project(m.projectBId);
          const c = m.geoDetail.center;
          const html = `<div class="glass rounded-lg px-3 py-2 text-[12px] leading-snug" style="max-width:280px">
            <div class="mono text-[10px] uppercase tracking-[0.08em]" style="color:#fbbf24">Flagged pair · P${m.priority}</div>
            <div class="mt-0.5 font-medium" style="color:#2fd6f2">${escapeHtml(pa.shortTitle)}</div>
            <div class="font-medium" style="color:#a78bfa">${escapeHtml(pb.shortTitle)}</div>
            <div class="mono mt-1 text-[10.5px] text-text-2">${c ? `${c.miles < 10 ? c.miles.toFixed(1) : Math.round(c.miles)} mi apart` : "shared site"}${m.timeDetail.inService ? ` · ${m.timeDetail.inService.gapDays.toLocaleString("en-US")} days between in-service dates` : ""}</div>
            <div class="mt-1 text-[10.5px] text-text-3">Click to inspect</div>
          </div>`;
          if (!popup.current) popup.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: "300px" });
          popup.current.setLngLat(ev.lngLat).setHTML(html).addTo(map);
        }
        return;
      }
      const f = all[0];
      map.getCanvas().style.cursor = f ? "pointer" : "";
      const pid = f?.properties?.projectId as string | undefined;
      if (!pid) {
        popup.current?.remove();
        if (useAtlas.getState().hoveredProjectId) set({ hoveredProjectId: null });
        return;
      }
      const p = IDX.project(pid);
      if (!p) return;
      if (useAtlas.getState().hoveredProjectId !== pid && !useAtlas.getState().selectedMatchId) set({ hoveredProjectId: pid });
      const label = (f.properties?.label as string | undefined) ?? p.shortTitle;
      const precision = (f.properties?.precision as string | undefined) ?? "";
      const html = `<div class="glass rounded-lg px-3 py-2 text-[12px] leading-snug" style="max-width:260px">
        <div class="font-medium text-text-0">${escapeHtml(p.title)}</div>
        <div class="text-text-2">${escapeHtml(ownerNames(p, IDX))}</div>
        <div class="mono mt-1 text-[10.5px] text-text-3">${escapeHtml(label)}${precision ? ` · ${escapeHtml(precisionText(precision))}` : ""}</div>
      </div>`;
      if (!popup.current) popup.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: "280px" });
      popup.current.setLngLat(ev.lngLat).setHTML(html).addTo(map);
    };
    map.on("mousemove", onMove);
    map.on("mouseout", () => popup.current?.remove());

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* basemap switch */
  const lastBasemap = useRef<Basemap | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastBasemap.current === null) {
      lastBasemap.current = basemap;
      return;
    }
    if (lastBasemap.current === basemap) return;
    lastBasemap.current = basemap;
    // diff:false forces a full reload so "style.load" fires and our layers are re-added
    map.setStyle(styleFor(basemap), { diff: false } as Parameters<typeof map.setStyle>[1]);
  }, [basemap]);

  /* terrain / pitch */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    try {
      applyTerrain(map, mapMode, useAtlas.getState().basemap);
    } catch {
      /* terrain is presentation-only; never let it break the map */
    }
    if (mapMode === "flat") map.easeTo({ pitch: 0, bearing: 0, duration: reduced ? 0 : 700 });
    else if (useAtlas.getState().selectedMatchId) map.easeTo({ pitch: 52, bearing: -14, duration: reduced ? 0 : 900 });
  }, [mapMode, styleReady, reduced]);

  /* data */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const ctx: RoleContext = {
      pair: preview ? { a: preview.a.id, b: preview.b.id } : null,
      hoveredProjectId,
      visibleProjectIds,
    };
    (map.getSource("gl-routes") as GeoJSONSource | undefined)?.setData(routeFeatures(ctx));
    (map.getSource("gl-halos") as GeoJSONSource | undefined)?.setData(haloFeatures(ctx));
    (map.getSource("gl-points") as GeoJSONSource | undefined)?.setData(pointFeatures(ctx));
    (map.getSource("gl-connector") as GeoJSONSource | undefined)?.setData(connectorFeature(preview?.match ?? null));
    (map.getSource("gl-centers") as GeoJSONSource | undefined)?.setData(centerFeatures(preview?.match ?? null));
    const visibleMatches = (run?.matches ?? []).filter((m) => visibleProjectIds.has(m.projectAId) && visibleProjectIds.has(m.projectBId));
    const ov = overlapFeatures(visibleMatches, preview?.match.id ?? null);
    const dim = (fc: typeof ov.lines | typeof ov.dots) => ({
      ...fc,
      features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, dim: !!preview && f.properties.id !== preview.match.id } })),
    });
    (map.getSource("gl-overlaps") as GeoJSONSource | undefined)?.setData(dim(ov.lines) as GeoJSON.FeatureCollection);
    (map.getSource("gl-overlap-dots") as GeoJSONSource | undefined)?.setData(dim(ov.dots) as GeoJSON.FeatureCollection);

    const counties = projectCounties({ ...ctx, visibleProjectIds: preview ? new Set([preview.a.id, preview.b.id]) : new Set() });
    const names = counties.map((c) => `${c.name}|${c.state}`);
    const filter: mapboxgl.FilterSpecification = names.length
      ? ["in", ["concat", ["get", "name"], "|", ["get", "state"]], ["literal", names]]
      : ["==", ["get", "fips"], "__none__"];
    if (map.getLayer("ctx-counties-hl-fill")) map.setFilter("ctx-counties-hl-fill", filter);
    if (map.getLayer("ctx-counties-hl-line")) map.setFilter("ctx-counties-hl-line", filter);

    // HTML markers: project labels for the previewed pair + the stated shared site
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    if (preview) {
      const site = sharedSite(preview.match);
      const cMid = preview.match.geoDetail.center ? (preview.match.geoDetail.center.a[0] + preview.match.geoDetail.center.b[0]) / 2 : null;
      if (site)
        markers.current.push(
          new mapboxgl.Marker({
            element: siteMarker(
              site.label,
              site.stated ? "Shared site stated in source" : site.implied ? "Shared site implied by sources" : "Both projects end here",
              // put the caption on the side facing away from the pair, where the project labels are not
              cMid !== null && site.lon < cMid ? "left" : "right",
            ),
            anchor: "center",
          })
            .setLngLat([site.lon, site.lat])
            .addTo(map),
        );
      const c = preview.match.geoDetail.center;
      for (const [p, role] of [
        [preview.a, "a"],
        [preview.b, "b"],
      ] as const) {
        // label each project at its center point (the sponsor's distance anchor): A above, B below
        const at = c ? (role === "a" ? c.a : c.b) : anchorOf(p);
        if (!at) continue;
        const aAbove = !c || c.a[1] >= c.b[1];
        const above = role === "a" ? aAbove : !aAbove;
        markers.current.push(
          new mapboxgl.Marker({ element: projectLabel(p.shortTitle, ownerNames(p, IDX, true), role), anchor: above ? "bottom" : "top", offset: above ? [0, -12] : [0, 12] })
            .setLngLat(at)
            .addTo(map),
        );
      }
      const conn = connectorFeature(preview.match).features[0];
      if (conn) {
        const [[x1, y1], [x2, y2]] = conn.geometry.coordinates as [number, number][];
        // a third of the way from A keeps the label clear of a shared-site marker near the middle
        const t = site ? 0.3 : 0.5;
        markers.current.push(new mapboxgl.Marker({ element: distanceLabel(conn.properties.label) }).setLngLat([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]).addTo(map));
      }
    }
  }, [styleReady, preview, hoveredProjectId, visibleProjectIds, run]);

  /* camera */
  const firstCamera = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = (animate: boolean) => {
      const st = useAtlas.getState();
      const duration = animate && !reduced ? 1600 : 0;
      // padding from the real canvas: desktop leaves room for the inspector column; phones leave room for
      // the bottom sheet. Clamped so fitBounds can always succeed.
      const cw = map.getContainer().clientWidth;
      const ch = map.getContainer().clientHeight;
      const rect = map.getContainer().getBoundingClientRect();
      const mobile = cw < 640;
      const sheetTop = window.innerHeight * 0.46;
      const pad = mobile
        ? { top: 64, left: 24, right: 24, bottom: st.inspectorOpen ? Math.max(24, rect.bottom - sheetTop + 24) : 32 }
        : {
            top: 90,
            left: 70,
            // leave room for the inspector column at whatever width the layout gives it
            right: st.inspectorOpen ? (document.querySelector('[aria-label="Evidence inspector"]')?.getBoundingClientRect().width ?? 408) + 32 : 64,
            bottom: 70,
          };
      const fit = (a: number, b: number, total: number) => {
        const max = Math.max(0, total - 80);
        const k = a + b > max ? max / (a + b) : 1;
        return [Math.floor(a * k), Math.floor(b * k)];
      };
      [pad.left, pad.right] = fit(pad.left, pad.right, cw);
      [pad.top, pad.bottom] = fit(pad.top, pad.bottom, ch);
      const right = pad.right;
      if (selected) {
        const b = boundsOf([...projectCoords(selected.a), ...projectCoords(selected.b)]);
        if (b) {
          const threeD = st.mapMode === "3d";
          map.fitBounds(b as LngLatBoundsLike, {
            padding: pad,
            pitch: threeD ? 52 : 0,
            bearing: threeD ? -14 : 0,
            maxZoom: 10.5,
            duration,
            essential: true,
          });
        }
        return;
      }
      const r = SNAPSHOT.regions.find((x) => x.id === st.region);
      const target = r
        ? ([
            [r.bbox[0], r.bbox[1]],
            [r.bbox[2], r.bbox[3]],
          ] as LngLatBoundsLike)
        : (boundsOf(SNAPSHOT.projects.flatMap(projectCoords)) as LngLatBoundsLike | null);
      if (target) map.fitBounds(target, { padding: { ...pad, right: mobile ? pad.right : Math.min(right, 64) }, pitch: 0, bearing: 0, duration, essential: true });
    };
    // first placement after load is instant; later moves animate
    if (!mapReady) return;
    apply(firstCamera.current ? false : true);
    firstCamera.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraNonce, selected?.match.id, inspectorOpen, mapReady]);

  // mapbox-gl.css is unlayered and sets .mapboxgl-map{position:relative}, so size the map through a wrapper
  return (
    <div className="absolute inset-0">
      <div ref={el} style={{ width: "100%", height: "100%" }} aria-label="Map of public construction plans" role="region" />
    </div>
  );
}

/* ------------------------------ marker elements ------------------------------ */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function precisionText(p: string) {
  return (
    {
      "official-gis": "official GIS",
      "official-map-digitized": "schematic · not survey accurate",
      "named-facility": "named facility",
      locality: "approximate locality",
      county: "county-level",
    } as Record<string, string>
  )[p] ?? p;
}

function siteMarker(label: string, caption: string, side: "left" | "right" = "right") {
  const root = document.createElement("div");
  root.className = "pointer-events-none relative";
  root.innerHTML = `
    <span class="site-pulse absolute left-1/2 top-1/2 block h-10 w-10 rounded-full" style="border:1.5px solid #fbbf24"></span>
    <span class="absolute left-1/2 top-1/2 block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style="background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.25),0 0 18px #fbbf24"></span>
    <div class="absolute bottom-3 ${side === "left" ? "right-4 text-right" : "left-4"} whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium" style="background:rgba(4,9,20,.86);color:#fbbf24;box-shadow:inset 0 0 0 1px rgba(251,191,36,.45)">
      <div class="mono text-[9.5px] uppercase tracking-[0.08em]" style="color:rgba(251,191,36,.8)">${escapeHtml(caption)}</div>
      ${escapeHtml(label)}
    </div>`;
  return root;
}

function projectLabel(title: string, owner: string, role: "a" | "b") {
  const color = role === "a" ? "#2fd6f2" : "#a78bfa";
  const el = document.createElement("div");
  el.className = "pointer-events-none";
  el.innerHTML = `<div class="glass rounded-lg px-2.5 py-1.5" style="box-shadow: inset 3px 0 0 ${color}, 0 10px 30px -10px rgba(0,0,0,.7)">
    <div class="text-[12px] font-semibold leading-tight" style="color:${color}">${escapeHtml(title)}</div>
    <div class="text-[10.5px] leading-tight text-text-2">${escapeHtml(owner)}</div>
  </div>`;
  return el;
}

function distanceLabel(label: string) {
  const el = document.createElement("div");
  el.className = "pointer-events-none";
  el.innerHTML = `<span class="mono rounded px-1.5 py-0.5 text-[10.5px]" style="background:rgba(4,9,20,.85);color:#fbbf24;box-shadow:inset 0 0 0 1px rgba(251,191,36,.4)">${escapeHtml(label)}</span>`;
  return el;
}
