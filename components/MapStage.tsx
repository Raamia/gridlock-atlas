"use client";

import mapboxgl, { type GeoJSONSource, type LngLatBoundsLike } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { useReducedMotion } from "@/lib/hooks";
import { bearingDeg, destination, install3D, lineChord, modelsLoading, pause3D, sceneStructurePoints, update3D, type Map3DInput } from "@/lib/map3d";
import {
  anchorOf,
  boundsOf,
  centerFeatures,
  connectorFeature,
  haloFeatures,
  overlapFeatures,
  pointFeatures,
  projectCenter,
  projectCoords,
  projectCounties,
  ringFeature,
  routeFeatures,
  sharedBorder,
  borderLabel,
  sharedSite,
  siteLegFeatures,
  type RoleContext,
} from "@/lib/mapdata";
import { queueRank, rankLabel, regionMatches } from "@/lib/rank";
import { ownerNames } from "@/lib/selectors";
import { useAtlas, type Basemap } from "@/lib/store";
import { CameraDirector, DEMO_CARD, type CameraIntent } from "./map/camera";
import {
  caveatCallout,
  distanceLabel,
  layoutCallouts,
  projectLabel,
  rankChip,
  ringCallout,
  siteDot,
  siteMarker,
  type Callout,
  type Dot,
} from "./map/callouts";
import { pairCardHtml, projectCardHtml, projectTapCard } from "./map/cards";
import { canDrift, startDrift } from "./map/drift";
import { addDataLayers, applyAnimated, FIRST_WAVE, hasLayer, PAIR_HIT_LAYERS, PROJECT_HIT_LAYERS, visibility, type Animated } from "./map/layers";
import { applyTerrain, configureStandard, isBasemapFailure, isStandard, styleFor, TOKEN } from "./map/style";

/* ------------------------------------------------ helpers ------------------------------------------------ */

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: "FeatureCollection", features: [] };

/** Guarded: a source can be missing mid style-swap, and a removed map (dev remount) throws on any style access. */
function setData(map: mapboxgl.Map, id: string, data: FC) {
  try {
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  } catch {
    /* presentation-only */
  }
}

/** Set while the 3D close-up covers the map: running tweens land on their end state instead of drawing frames. */
const paused = { current: false };

/** requestAnimationFrame tween; returns a cancel function. */
function tween(duration: number, frame: (t: number) => void, done?: () => void): () => void {
  let raf = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = paused.current ? 1 : Math.min(1, (now - start) / duration);
    frame(t);
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The SC–GA border from the bundled Census states (fetched once, shared by every style). */
let stateLine: Promise<FC> | null = null;
function savannahLine(): Promise<FC> {
  stateLine ??= fetch("/geo/states.json")
    .then((r) => r.json())
    .then((states) => {
      const f = sharedBorder(states, "SC", "GA");
      return f ? ({ type: "FeatureCollection", features: [f, borderLabel(f)] } as FC) : EMPTY;
    })
    .catch(() => EMPTY);
  return stateLine;
}

const isTouchEvent = (oe: Event | undefined) =>
  !!(oe as (MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }) | undefined)?.sourceCapabilities?.firesTouchEvents ||
  (typeof window !== "undefined" && !!window.matchMedia?.("(hover: none)").matches);

/** The pair's utility hues for HTML callouts (mirrors the tokens; map paint uses the same values). */
const UTIL_VAR = { a: "var(--util-a)", b: "var(--util-b)" } as const;
const MI_M = 1609.344;

/** The selected pair's 3D structures as callout obstacles (yards ≈24×18 px, towers ≈12×16 px, standing on their point). */
function structureDots(map: mapboxgl.Map): Dot[] {
  return sceneStructurePoints(map).map((s) => (s.kind === "yard" ? { at: s.at, weight: 2, w: 26, h: 18, rise: true } : { at: s.at, weight: 1, w: 12, h: 16, rise: true }));
}

/* ------------------------------------------------ component ------------------------------------------------ */

export default function MapStage() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const director = useRef<CameraDirector | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const chips = useRef<{ marker: mapboxgl.Marker; at: [number, number]; el: HTMLElement }[]>([]);
  const callouts = useRef<{ items: Callout[]; dots: Dot[] }>({
    items: [],
    dots: [],
  });
  const popup = useRef<mapboxgl.Popup | null>(null);
  const anim = useRef<Animated>({
    unflagged: 1,
    revealK: Infinity,
    restFade: 1,
    arcs2D: true,
    raised: false,
    trim: 1,
  });
  const revealing = useRef(false);
  /** What map-3d draws in the current mode (so the flat equivalents stay hidden instead of doubling up). */
  const covers = useRef<Covers>({ arcs: false, ring: false });
  const [styleReady, setStyleReady] = useState(0);
  const relayoutRef = useRef<(ev?: { type: string }) => void>(() => {});
  const [mapReady, setMapReady] = useState(false);
  const reduced = useReducedMotion();

  const basemap = useAtlas((s) => s.basemap);
  const mapMode = useAtlas((s) => s.mapMode);
  const region = useAtlas((s) => s.region);
  const run = useAtlas((s) => s.run);
  const running = useAtlas((s) => s.running);
  const tab = useAtlas((s) => s.tab);
  const selectedMatchId = useAtlas((s) => s.selectedMatchId);
  const hoveredMatchId = useAtlas((s) => s.hoveredMatchId);
  const hoveredProjectId = useAtlas((s) => s.hoveredProjectId);
  const focus = useAtlas((s) => s.focus);
  const cameraNonce = useAtlas((s) => s.cameraNonce);
  const revealNonce = useAtlas((s) => s.revealNonce);
  const demoOn = useAtlas((s) => s.demoStep !== null);
  const closeupOpen = useAtlas((s) => s.closeupOpen);
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);

  const selected: Match | null = useMemo(() => run?.matches.find((m) => m.id === selectedMatchId) ?? null, [run, selectedMatchId]);
  const hovered: Match | null = useMemo(() => (hoveredMatchId ? (run?.matches.find((m) => m.id === hoveredMatchId) ?? null) : null), [run, hoveredMatchId]);
  /** What the connector / centers show: the selected pair, else the hovered row's pair. */
  const preview = selected ?? hovered;

  const regionRun = useMemo(() => (run ? regionMatches(run, region) : []), [run, region]);

  const visibleProjectIds = useMemo(() => {
    const ids = new Set<string>();
    const excluded = new Set(run?.excludedProjects.map((x) => x.projectId) ?? []);
    for (const p of SNAPSHOT.projects) {
      if (region !== "all" && p.region !== region) continue;
      if (excluded.has(p.id)) continue;
      ids.add(p.id);
    }
    for (const m of [selected, hovered]) {
      if (!m) continue;
      ids.add(m.projectAId);
      ids.add(m.projectBId);
    }
    return ids;
  }, [region, run, selected, hovered]);

  // after a run, projects in no flagged pair dim; with a focus, everything outside the focus does
  const flaggedProjectIds = useMemo(() => {
    if (!run) return null;
    const pairs = focus ? regionRun.filter((m) => focus.pairIds.includes(m.id)) : regionRun;
    return new Set(pairs.flatMap((m) => [m.projectAId, m.projectBId]));
  }, [run, regionRun, focus]);

  /* ---------------------------------------------- init ---------------------------------------------- */
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const set = useAtlas.getState().set;
    mapboxgl.accessToken = TOKEN;
    const startOffline = typeof navigator !== "undefined" && !navigator.onLine;
    // no token: say so on the switcher (Offline pressed) instead of showing Night over the bundled style
    if (!TOKEN && useAtlas.getState().basemap !== "offline") set({ basemap: "offline", basemapFailed: false });
    if (startOffline) set({ basemap: "offline", basemapFailed: true });
    const initialBasemap: Basemap = useAtlas.getState().basemap;
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
      antialias: true,
      attributionControl: false,
      // logo bottom-left, attribution (i) bottom-right: the map-controls column sits just above the (i)
      logoPosition: "bottom-left",
      maxPitch: 70,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;
    const cam = new CameraDirector(map);
    director.current = cam;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: mapboxgl.Map }).__map = map;
    const ro = new ResizeObserver(() => {
      map.resize();
      cam.scheduleSync(120);
    });
    ro.observe(el.current);

    map.on("style.load", () => {
      const bm = useAtlas.getState().basemap;
      configureStandard(map, bm);
      addDataLayers(map, isStandard(bm));
      try {
        install3D(map, { standard: isStandard(bm) });
      } catch {
        /* the 3D scene is presentation-only */
      }
      applyAnimated(map, anim.current);
      // enabling terrain during the first style load can stall the first frame on some GPUs; wait for idle
      map.once("idle", () => {
        try {
          applyTerrain(map, useAtlas.getState().mapMode, useAtlas.getState().basemap);
        } catch {
          /* presentation-only */
        }
      });
      setStyleReady((n) => n + 1);
      // the camera only needs the transform: ready at the first style, never waiting on "load" (which a slow model or
      // tile can hold back indefinitely)
      setMapReady(true);
    });

    map.once("load", () => setMapReady(true));
    // only a basemap that cannot load (401/403, network failure on a Mapbox request) drops to Offline (SPEC §5.8)
    map.on("error", (e) => {
      if (useAtlas.getState().basemap === "offline") return;
      if (isBasemapFailure(e as { error?: unknown; sourceId?: string })) set({ basemap: "offline", basemapFailed: true });
    });

    /* hover / click / tap */
    const layersOf = (ids: string[]) => ids.filter((l) => map.getLayer(l));
    const showCard = (content: string | HTMLElement, at: mapboxgl.LngLat, touch = false) => {
      if (!popup.current)
        popup.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          maxWidth: "none",
          className: "gl-card",
        });
      if (typeof content === "string") popup.current.setHTML(content);
      else popup.current.setDOMContent(content);
      popup.current.setLngLat(at).addTo(map);
      popup.current.getElement()?.classList.toggle("gl-card-touch", touch);
    };
    const closeCard = () => popup.current?.remove();
    const pairAt = (point: mapboxgl.Point) => {
      const f = map.queryRenderedFeatures(
        [
          [point.x - 4, point.y - 4],
          [point.x + 4, point.y + 4],
        ],
        { layers: layersOf(PAIR_HIT_LAYERS) },
      )[0];
      return (f?.properties?.id as string | undefined) ?? null;
    };
    const projectAt = (point: mapboxgl.Point, r: number) =>
      map
        .queryRenderedFeatures(
          [
            [point.x - r, point.y - r],
            [point.x + r, point.y + r],
          ],
          { layers: layersOf(PROJECT_HIT_LAYERS) },
        )
        .find((x) => x.properties?.projectId);

    map.on("click", (ev) => {
      const st = useAtlas.getState();
      const touch = isTouchEvent(ev.originalEvent);
      const f = projectAt(ev.point, touch ? 10 : 4);
      // a dot wins over a link under it (links meet at dots)
      if (!f) {
        const id = pairAt(ev.point);
        if (id) {
          // a tap also fires an emulated mousemove that opened the hover card; it would ride along with the camera
          closeCard();
          st.select(id);
          return;
        }
      }
      const pid = f?.properties?.projectId as string | undefined;
      const p = pid ? IDX.project(pid) : undefined;
      if (!f || !p) {
        if (touch) closeCard();
        return;
      }
      const pairs = st.run ? st.run.matches.filter((m) => m.projectAId === p.id || m.projectBId === p.id).length : 0;
      if (touch) {
        const label = (f.properties?.label as string | undefined) ?? p.shortTitle;
        const precision = (f.properties?.precision as string | undefined) ?? "";
        showCard(
          projectTapCard(p, label, precision, pairs, () => {
            closeCard();
            useAtlas.getState().focusProject(p.id);
          }),
          ev.lngLat,
          true,
        );
        return;
      }
      // desktop: a dot click focuses the list on that project's pairs (and flies to it)
      if (pairs > 0) {
        closeCard();
        st.focusProject(p.id);
      }
    });

    // hover state the map set itself (so leaving the canvas clears only what the map started)
    let mapHoverPair = false;
    map.on("mousemove", (ev) => {
      if (isTouchEvent(ev.originalEvent)) return;
      const st = useAtlas.getState();
      const f = projectAt(ev.point, 4);
      const pairId = f ? null : pairAt(ev.point);
      if (pairId) {
        map.getCanvas().style.cursor = "pointer";
        if (st.hoveredProjectId) st.set({ hoveredProjectId: null });
        if (st.hoveredMatchId !== pairId) st.set({ hoveredMatchId: pairId });
        mapHoverPair = true;
        const m = st.run?.matches.find((x) => x.id === pairId);
        if (m) {
          const rank = st.run ? queueRank(st.run, st.region).get(m.id) : undefined;
          showCard(pairCardHtml(m, rank ? rankLabel(rank) : null), ev.lngLat);
        }
        return;
      }
      if (mapHoverPair) {
        mapHoverPair = false;
        if (st.hoveredMatchId) st.set({ hoveredMatchId: null });
      }
      const pid = f?.properties?.projectId as string | undefined;
      const p = pid ? IDX.project(pid) : undefined;
      map.getCanvas().style.cursor = p ? "pointer" : "";
      if (!p || !f) {
        closeCard();
        if (st.hoveredProjectId) st.set({ hoveredProjectId: null });
        return;
      }
      if (st.hoveredProjectId !== p.id && !st.selectedMatchId) st.set({ hoveredProjectId: p.id });
      showCard(
        projectCardHtml(p, (f.properties?.label as string | undefined) ?? p.shortTitle, (f.properties?.precision as string | undefined) ?? ""),
        ev.lngLat,
      );
    });
    map.on("mouseout", (ev) => {
      // a tap's emulated mouse events leave the canvas for the card itself: keep the card (its button is next)
      const to = (ev.originalEvent as MouseEvent | undefined)?.relatedTarget as Node | null | undefined;
      if (isTouchEvent(ev.originalEvent) || (to && popup.current?.getElement()?.contains(to))) return;
      closeCard();
      const st = useAtlas.getState();
      if (st.hoveredProjectId) st.set({ hoveredProjectId: null });
      if (mapHoverPair && st.hoveredMatchId) st.set({ hoveredMatchId: null });
      mapHoverPair = false;
      map.getCanvas().style.cursor = "";
    });

    const relayout = (ev?: { type: string }) => {
      if (useAtlas.getState().closeupOpen) return;
      const items = callouts.current.items;
      if (items.length) layoutCallouts(map, items, [...callouts.current.dots, ...structureDots(map)], ev?.type === "move");
      if (ev?.type !== "move") spreadChips(map, chips.current);
    };
    relayoutRef.current = relayout;
    map.on("move", relayout);
    map.on("moveend", relayout);
    map.on("resize", relayout);
    // place names are placed asynchronously; settle the callouts once the map is idle
    map.on("idle", relayout);
    void document.fonts?.ready.then(() => relayout());

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      director.current = null;
    };
  }, []);

  useEffect(() => {
    if (director.current) director.current.reduced = reduced;
  }, [reduced, mapReady]);

  /* ---------------------------------------------- basemap ---------------------------------------------- */
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
    // mapbox-gl 3.31 throws "Could not load models" when a style is swapped while its model loads are in flight: let
    // them settle first (they are small local files; at most ~2.5 s), then swap. A newer choice cancels this one.
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const swap = () => {
      if (mapRef.current !== map) return;
      if (modelsLoading(map) && performance.now() - started < 2500) {
        timer = setTimeout(swap, 80);
        return;
      }
      // diff:false forces a full reload so "style.load" fires and our layers are re-added
      map.setStyle(styleFor(basemap), { diff: false } as Parameters<typeof map.setStyle>[1]);
    };
    swap();
    return () => clearTimeout(timer);
  }, [basemap]);

  /* ---------------------------------------------- 3D / Flat ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    try {
      applyTerrain(map, mapMode, useAtlas.getState().basemap);
    } catch {
      /* terrain is presentation-only; never let it break the map */
    }
  }, [mapMode, styleReady]);

  const lastMode = useRef(mapMode);
  useEffect(() => {
    if (lastMode.current === mapMode) return;
    lastMode.current = mapMode;
    if (mapReady) director.current?.modeChanged();
  }, [mapMode, mapReady]);

  /* ---------------------------------------------- data ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const ctx: RoleContext = {
      pair: selected ? { a: selected.projectAId, b: selected.projectBId } : null,
      hoveredProjectId: selected ? null : hoveredProjectId,
      visibleProjectIds,
      flaggedProjectIds,
      hotProjectIds: hovered && hovered.id !== selected?.id ? new Set([hovered.projectAId, hovered.projectBId]) : null,
    };
    setData(map, "gl-routes", routeFeatures(ctx));
    setData(map, "gl-halos", haloFeatures(ctx));
    // the shared-site callout names the meeting point, so the map's own place names there are not repeated under it
    const site = sharedSite(selected);
    const points = pointFeatures(ctx);
    if (site)
      for (const f of points.features) {
        const [lon, lat] = f.geometry.coordinates;
        if (Math.hypot((lon - site.lon) * Math.cos((lat * Math.PI) / 180), lat - site.lat) * 69 < 0.6) f.properties.onSite = true;
      }
    setData(map, "gl-points", points);
    setData(map, "gl-connector", connectorFeature(preview));
    setData(map, "gl-centers", centerFeatures(preview));
    setData(map, "gl-site-legs", siteLegFeatures(selected));

    // Sperry's rule: the review radius around A's center (selected pair), or around a focused project's center
    const thr = useAtlas.getState().thresholdMiles;
    let ring: FC = EMPTY;
    let ringLabel: FC = EMPTY;
    if (selected) {
      // its label is an HTML callout (placed outside the ring, clear of the pair's callouts and every panel)
      ring = ringFeature(selected, selected.geoDetail.thresholdMiles);
    } else if (focus?.kind === "project" && run) {
      const c = projectCenter(focus.id, run.matches);
      if (c) {
        const around = {
          projectAId: focus.id,
          geoDetail: { center: { a: c, b: c, miles: 0 } },
        } as unknown as Match;
        ring = ringFeature(around, thr);
        const p = IDX.project(focus.id);
        const top: [number, number] = [c[0], c[1] + thr / 69.05];
        ringLabel = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                label: `${thr} mi from ${p?.shortTitle ?? "this project"}`,
              },
              geometry: { type: "Point", coordinates: top },
            },
          ],
        };
      }
    }
    setData(map, "gl-ring", ring);
    setData(map, "gl-ring-label", ringLabel);

    const ranks = run ? queueRank(run, region) : null;
    const ov = overlapFeatures(
      regionRun.filter((m) => visibleProjectIds.has(m.projectAId) && visibleProjectIds.has(m.projectBId)),
      { selectedId: selected?.id ?? null, hoverId: hovered?.id ?? null, ranks, focusIds: focus ? new Set(focus.pairIds) : null },
    );
    setData(map, "gl-overlaps", ov.lines as FC);
    setData(map, "gl-overlap-dots", ov.dots as FC);

    const counties = projectCounties({
      ...ctx,
      visibleProjectIds: selected ? new Set([selected.projectAId, selected.projectBId]) : new Set(),
    });
    const names = counties.map((c) => `${c.name}|${c.state}`);
    const filter: mapboxgl.FilterSpecification = names.length
      ? ["in", ["concat", ["get", "name"], "|", ["get", "state"]], ["literal", names]]
      : ["==", ["get", "fips"], "__none__"];
    for (const id of ["ctx-counties-hl-fill", "ctx-counties-hl-line"]) if (hasLayer(map, id)) map.setFilter(id, filter);

    // the Savannah River is the SC–GA state line: a quiet landmark in the region overview
    const showLine = region === "southeast" && !selected && !focus;
    if (!showLine) setData(map, "gl-stateline", EMPTY);
    else
      void savannahLine().then((fc) => {
        const st = useAtlas.getState();
        if (mapRef.current === map && hasLayer(map, "gl-stateline") && st.region === "southeast" && !st.selectedMatchId && !st.focus)
          setData(map, "gl-stateline", fc);
      });
  }, [styleReady, selected, hovered, preview, hoveredProjectId, visibleProjectIds, flaggedProjectIds, regionRun, run, region, focus]);

  /* ---------------------------------------------- 3D scene (lib/map3d.ts owns every gl3d-* layer) ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const focusProjectIds =
      focus && run ? [...new Set(run.matches.filter((m) => focus.pairIds.includes(m.id)).flatMap((m) => [m.projectAId, m.projectBId]))] : null;
    const input: Map3DInput = {
      run,
      region,
      selectedMatchId,
      hoveredMatchId,
      focusProjectIds,
      mapMode,
      basemap,
      reducedMotion: reduced,
      revealNonce,
      running,
    };
    try {
      update3D(map, input);
    } catch {
      /* presentation-only */
    }
    // in 3D, map-3d draws the raised links and the review ring: the flat versions step aside (no
    // doubles); in Flat map (gl3d-* hidden) or without map-3d they are the map's own
    covers.current = map3dCovers(map, mapMode);
    anim.current = {
      ...anim.current,
      arcs2D: !covers.current.arcs,
      raised: covers.current.arcs,
    };
    applyAnimated(map, anim.current);
    for (const id of ["gl-ring-fill", "gl-ring-glow", "gl-ring", "gl-ring-label"]) visibility(map, id, !covers.current.ring);
  }, [styleReady, run, region, selectedMatchId, hoveredMatchId, focus, mapMode, basemap, reduced, revealNonce, running]);

  /* ---------------------------------------------- reveal choreography (2D) ---------------------------------------------- */
  const lastReveal = useRef(revealNonce);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const fresh = revealNonce !== lastReveal.current;
    lastReveal.current = revealNonce;
    const final = () => {
      revealing.current = false;
      anim.current = {
        ...anim.current,
        revealK: Infinity,
        restFade: 1,
        unflagged: run ? 0.35 : 1,
      };
      applyAnimated(map, anim.current);
      setChipsShown(chips.current, true);
    };
    const st = useAtlas.getState();
    if (!fresh || !run || st.selectedMatchId || reduced || st.closeupOpen) return final();
    // arcs 1–12 draw in 60 ms apart, then the rest fade in; unflagged dots dim; rank chips land last (≤ 1.2 s)
    revealing.current = true;
    setChipsShown(chips.current, false);
    anim.current = { ...anim.current, revealK: 0, restFade: 0, unflagged: 1 };
    applyAnimated(map, anim.current);
    let stepK = -1;
    const cancel = tween(
      1150,
      (t) => {
        const ms = t * 1150;
        const k = Math.min(FIRST_WAVE, Math.floor(ms / 60));
        const rest = ms < FIRST_WAVE * 60 ? 0 : easeOut(Math.min(1, (ms - FIRST_WAVE * 60) / 380));
        const u = 1 - 0.65 * easeOut(Math.min(1, Math.max(0, (ms - 150) / 700)));
        const allIn = rest > 0;
        if (k === stepK && !allIn && Math.abs(anim.current.unflagged - u) < 0.02) return;
        stepK = k;
        anim.current = {
          ...anim.current,
          revealK: allIn ? Infinity : k,
          restFade: rest,
          unflagged: u,
        };
        applyAnimated(map, anim.current);
        if (ms > 880) setChipsShown(chips.current, true);
      },
      final,
    );
    return () => {
      cancel();
      if (revealing.current) final();
    };
    // the selection / close-up are read at bump time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce, styleReady, run]);

  /* the selected link draws on from A's center (600 ms) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!selectedMatchId || reduced) {
      anim.current = { ...anim.current, trim: 1 };
      applyAnimated(map, anim.current);
      return;
    }
    anim.current = { ...anim.current, trim: 0 };
    applyAnimated(map, anim.current);
    // start once the camera is under way, so the link grows in view
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = tween(
        600,
        (t) => {
          anim.current = { ...anim.current, trim: easeOut(t) };
          applyAnimated(map, anim.current);
        },
        () => {
          anim.current = { ...anim.current, trim: 1 };
          applyAnimated(map, anim.current);
        },
      );
    }, 450);
    return () => {
      clearTimeout(timer);
      cancel();
      anim.current = { ...anim.current, trim: 1 };
      applyAnimated(map, anim.current);
    };
  }, [selectedMatchId, styleReady, reduced]);

  /* ---------------------------------------------- callouts: the selected pair ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    callouts.current = { items: [], dots: [] };
    const m = selected;
    if (!map || !styleReady || !m) return;
    const items: Callout[] = [];
    const dots: Dot[] = [];
    const add = (root: HTMLElement, at: [number, number], rank: number, spots: Callout["spots"], optional = false) => {
      root.style.zIndex = String(rank);
      markers.current.push(new mapboxgl.Marker({ element: root, anchor: "center" }).setLngLat(at).addTo(map));
      items.push({
        box: root.querySelector<HTMLElement>("[data-callout]")!,
        at,
        spots,
        optional,
      });
    };
    const c = m.geoDetail.center;
    const thr = m.geoDetail.thresholdMiles;
    const site = sharedSite(m);
    if (site) {
      // phones: the same claim on one line, so the site callout fits the strip of map above the inspector sheet
      const compact = window.innerWidth < 768;
      const caption = site.stated
        ? compact
          ? "Shared site · stated"
          : "Shared site stated in source"
        : site.implied
          ? compact
            ? "Shared site · implied"
            : "Shared site implied by sources"
          : "Both projects end here";
      // first choice: the side facing away from the pair, where the project labels are not
      const left = !!c && site.lon < (c.a[0] + c.b[0]) / 2;
      // the dot sits below the project labels (2): a label that has to touch the site hides the dot, never its own text
      const dot = siteDot();
      dot.style.zIndex = "1";
      markers.current.push(new mapboxgl.Marker({ element: dot, anchor: "center" }).setLngLat([site.lon, site.lat]).addTo(map));
      add(siteMarker(site.label, caption), [site.lon, site.lat], 3, (w, h) => {
        const [r, l] = [16, -16 - w];
        const spots = [
          { x: r, y: -12 - h },
          { x: l, y: -12 - h },
          { x: -w / 2, y: -22 - h },
          { x: r, y: 12 },
          { x: l, y: 12 },
          { x: -w / 2, y: 22 },
        ];
        // last resort: fully above or below the dot, slid toward it (the dot is ±9px)
        const tight = [
          { x: -12, y: 12 },
          { x: 12 - w, y: 12 },
          { x: -12, y: -12 - h },
          { x: 12 - w, y: -12 - h },
        ];
        return left ? [spots[1], spots[0], spots[2], spots[4], spots[3], spots[5], tight[1], tight[0], tight[3], tight[2]] : [...spots, ...tight];
      });
      // the shared-site dot is the pair's one amber landmark: covering it is all but ruled out
      dots.push({ at: [site.lon, site.lat], weight: 20, site: true });
    }
    const aAbove = !c || c.a[1] >= c.b[1];
    for (const [id, role] of [
      [m.projectAId, "a"],
      [m.projectBId, "b"],
    ] as const) {
      // label each project at its center point (the sponsor's distance anchor): the northern one above
      const p = IDX.project(id);
      const at = c ? (role === "a" ? c.a : c.b) : anchorOf(p);
      if (!at) continue;
      if (c) dots.push({ at, weight: 1 });
      const above = role === "a" ? aAbove : !aAbove;
      add(projectLabel(p.shortTitle, ownerNames(p, IDX, true), role), at, 2, (w, h) => {
        const up = [
          { x: -w / 2, y: -14 - h },
          { x: -16, y: -14 - h },
          { x: 16 - w, y: -14 - h },
        ];
        const down = up.map((s) => ({ x: s.x, y: 14 }));
        const side = [
          { x: 16, y: -h / 2 },
          { x: -16 - w, y: -h / 2 },
        ];
        return above ? [...up, ...side, ...down] : [...down, ...side, ...up];
      });
    }
    const conn = connectorFeature(m).features[0];
    if (conn) {
      const [[x1, y1], [x2, y2]] = conn.geometry.coordinates as [number, number][];
      const along = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      // beyond the radius (flagged through a shared facility): say why, never a bare "37 mi apart"
      const text = conn.properties.beyond ? `Beyond ${thr} mi · shared site` : conn.properties.label;
      // slides along the connector (then flips above it) to stay clear of the site and the project labels
      add(
        distanceLabel(text, conn.properties.beyond),
        along(0.5),
        1,
        (w, h) => {
          const p0 = map.project(along(0.5));
          const spots = [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((t) => {
            const p = map.project(along(t));
            const [x, y] = [p.x - p0.x - w / 2, p.y - p0.y];
            return [
              { x, y: y + 8 },
              { x, y: y - 8 - h },
            ];
          });
          // beyond the radius: also where the link leaves the review ring (the point the chip is about)
          if (conn.properties.beyond && c) {
            const q = map.project(destination(c.a, thr * MI_M, bearingDeg(c.a, c.b)));
            const [x, y] = [q.x - p0.x, q.y - p0.y];
            spots.push({ x: x + 10, y: y - h / 2 }, { x: x - 10 - w, y: y - h / 2 }, { x: x - w / 2, y: y - 10 - h }, { x: x - w / 2, y: y + 10 });
          }
          return spots;
        },
        true,
      );
    }
    // Sperry's rule: "25 mi from {A}" just outside the ring, where it is clear — near B first (B sits inside it)
    if (c) {
      const rM = thr * MI_M;
      const toB = bearingDeg(c.a, c.b);
      const pref = c.miles <= thr ? toB : toB + (site && bearingDeg(c.a, [site.lon, site.lat]) - toB > 0 ? -40 : 40);
      const bearings = [0, 12, -12, 24, -24, 36, -36, 50, -50, 65, -65, 80, -80, 100, -100, 125, -125, 150, -150, 180].map((d) => pref + d);
      const at = destination(c.a, rM, pref);
      add(
        ringCallout(`${thr} mi from ${IDX.project(m.projectAId).shortTitle}`),
        at,
        1,
        (w, h) => {
          const p0 = map.project(at);
          const out: { x: number; y: number }[] = [];
          for (const b of bearings) {
            const q = map.project(destination(c.a, rM, b));
            // the ring's outward normal on screen (its tangent turned away from A's center): the box sits just past it
            const t0 = map.project(destination(c.a, rM, b - 1));
            const t1 = map.project(destination(c.a, rM, b + 1));
            const ctr = map.project(c.a);
            let [nx, ny] = [t1.y - t0.y, -(t1.x - t0.x)];
            const len = Math.hypot(nx, ny) || 1;
            [nx, ny] = [nx / len, ny / len];
            if (nx * (q.x - ctr.x) + ny * (q.y - ctr.y) < 0) [nx, ny] = [-nx, -ny];
            const reach = 7 + (w / 2) * Math.abs(nx) + (h / 2) * Math.abs(ny);
            out.push({ x: q.x + nx * reach - w / 2 - p0.x, y: q.y + ny * reach - h / 2 - p0.y });
          }
          return out;
        },
        true,
      );
      items[items.length - 1].noSlide = true;
    }
    // 3D: a line without a published route is a ghosted chord terminal to terminal, and says so — on the chord, away
    // from its middle (the project's own center and callout). Phones leave the caveat to the inspector ("Where they
    // meet"): their strip of map is for the pair's own callouts
    if (mapMode === "3d" && window.innerWidth >= 768)
      for (const [id, role] of [
        [m.projectAId, "a"],
        [m.projectBId, "b"],
      ] as const) {
        const chord = lineChord(IDX.project(id));
        if (!chord) continue;
        const [[x1, y1], [x2, y2]] = chord;
        const along = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        add(
          caveatCallout(UTIL_VAR[role]),
          along(0.82),
          1,
          (w, h) => {
            const p0 = map.project(along(0.82));
            return [0.82, 0.18, 0.7, 0.3, 0.9, 0.1].flatMap((t) => {
              const p = map.project(along(t));
              const [x, y] = [p.x - p0.x, p.y - p0.y];
              return [
                { x: x + 10, y: y - h / 2 },
                { x: x - 10 - w, y: y - h / 2 },
                { x: x - w / 2, y: y + 10 },
                { x: x - w / 2, y: y - 10 - h },
              ];
            });
          },
          true,
        );
      }
    callouts.current = { items, dots };
    layoutCallouts(map, items, [...dots, ...structureDots(map)]);
  }, [styleReady, selected, mapMode]);

  /* ---------------------------------------------- rank chips 01–03 (post-run overview) ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    chips.current.forEach((c) => c.marker.remove());
    chips.current = [];
    if (!map || !styleReady || !run || selectedMatchId) return;
    const status = tab === "conflicts" ? "needs-review" : tab;
    const ranks = queueRank(run, region);
    const top = regionRun
      .filter((m) => m.reviewStatus === status && m.geoDetail.center && (!focus || focus.pairIds.includes(m.id)))
      .sort((x, y) => (ranks.get(x.id) ?? 0) - (ranks.get(y.id) ?? 0))
      .slice(0, 3);
    for (const m of top) {
      const c = m.geoDetail.center!;
      const at: [number, number] = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2];
      const rank = ranks.get(m.id) ?? 0;
      const a = IDX.project(m.projectAId);
      const b = IDX.project(m.projectBId);
      const { root, chip } = rankChip(rankLabel(rank), `#${rankLabel(rank)} ${a.shortTitle} × ${b.shortTitle}`, () => useAtlas.getState().select(m.id));
      chip.style.opacity = revealing.current ? "0" : "1";
      // a chip names its pair: hovering it lights that pair's arc (and its list row)
      chip.addEventListener("mouseenter", () => useAtlas.getState().set({ hoveredMatchId: m.id }));
      chip.addEventListener("mouseleave", () => {
        if (useAtlas.getState().hoveredMatchId === m.id) useAtlas.getState().set({ hoveredMatchId: null });
      });
      const marker = new mapboxgl.Marker({
        element: root,
        anchor: "bottom",
        offset: [0, -6],
      })
        .setLngLat(at)
        .addTo(map);
      chips.current.push({ marker, at, el: chip });
    }
    spreadChips(map, chips.current);
    const placed = chips.current;
    return () => {
      // a removed chip never leaves its pair lit
      if (placed.length && placed.some((c) => c.el.matches(":hover"))) useAtlas.getState().set({ hoveredMatchId: null });
    };
  }, [styleReady, run, region, regionRun, tab, selectedMatchId, focus]);

  /* ---------------------------------------------- camera ---------------------------------------------- */
  const cameraRegion = useRef(region);
  const firstCamera = useRef(true);
  useEffect(() => {
    const cam = director.current;
    if (!cam || !mapReady) return;
    const st = useAtlas.getState();
    const crossRegion = cameraRegion.current !== st.region;
    cameraRegion.current = st.region;
    const intent: CameraIntent = st.selectedMatchId ? { kind: "pair", matchId: st.selectedMatchId, crossRegion } : { kind: "overview" };
    cam.move(intent, {
      animate: !firstCamera.current,
      ...(crossRegion && !st.selectedMatchId ? { duration: 2000 } : {}),
    });
    firstCamera.current = false;
  }, [cameraNonce, mapReady]);

  // an explicit Compare eases to the region's flagged pairs (never when a pair is selected)
  const lastCameraReveal = useRef(revealNonce);
  useEffect(() => {
    const cam = director.current;
    if (!cam || !mapReady) return;
    if (lastCameraReveal.current === revealNonce) return;
    lastCameraReveal.current = revealNonce;
    const st = useAtlas.getState();
    if (st.selectedMatchId || !st.run) return;
    cam.move({ kind: "reveal" });
  }, [revealNonce, mapReady]);

  // anything that changes the focal hole re-frames once the map is still (never mid-flight)
  useEffect(() => {
    const cam = director.current;
    if (!cam || !mapReady) return;
    const unsub = useAtlas.subscribe((s, prev) => {
      if (
        s.inspectorOpen !== prev.inspectorOpen ||
        s.demoStep !== prev.demoStep ||
        s.briefOpen !== prev.briefOpen ||
        s.timelineCollapsed !== prev.timelineCollapsed ||
        (s.selectedMatchId === null) !== (prev.selectedMatchId === null) ||
        s.railOpen !== prev.railOpen ||
        s.sheetSnap !== prev.sheetSnap ||
        s.uiHidden !== prev.uiHidden
      )
        cam.scheduleSync();
    });
    // the guided-demo card can change height between steps (phones), and it mounts after its step starts
    let card: HTMLElement | null = null;
    const ro = new ResizeObserver(() => cam.scheduleSync(80));
    const watchCard = () => {
      const next = document.querySelector<HTMLElement>(DEMO_CARD);
      if (next === card) return;
      if (card) ro.unobserve(card);
      card = next;
      if (card) ro.observe(card);
      cam.scheduleSync(80);
    };
    const mo = new MutationObserver(watchCard);
    mo.observe(document.body, { childList: true, subtree: true });
    watchCard();
    return () => {
      unsub();
      ro.disconnect();
      mo.disconnect();
    };
  }, [mapReady]);

  /* ---------------------------------------------- 3D close-up covers the map ---------------------------------------------- */
  // SPEC §6.5: while the close-up is open the map canvas is hidden (visibility on the wrapper below), map-3d's loop and
  // the tweens here stop, and the shared-site beacon's CSS pulse pauses; everything resumes when it closes
  useEffect(() => {
    const map = mapRef.current;
    paused.current = closeupOpen;
    if (!map || !mapReady) return;
    try {
      pause3D(map, closeupOpen);
    } catch {
      /* presentation-only */
    }
    el.current?.querySelectorAll<HTMLElement>(".site-pulse").forEach((p) => (p.style.animationPlayState = closeupOpen ? "paused" : ""));
    if (closeupOpen) return;
    // back on the map: repaint once and settle the labels (the layout skipped work while hidden)
    try {
      map.resize();
      map.triggerRepaint();
    } catch {
      /* a removed map */
    }
    relayoutRef.current();
  }, [closeupOpen, mapReady]);

  /* ---------------------------------------------- a project title clicked in the inspector ---------------------------------------------- */
  useEffect(() => {
    if (!mapReady) return;
    const onFly = (e: Event) => {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!id || !IDX.project(id)) return;
      const st = useAtlas.getState();
      // the close-up covers the map: back to it first, then fly
      if (st.closeupOpen) st.set({ closeupOpen: false });
      director.current?.move({ kind: "project", projectId: id });
    };
    window.addEventListener("atlas:fly-to-project", onFly);
    return () => window.removeEventListener("atlas:fly-to-project", onFly);
  }, [mapReady]);

  /* ---------------------------------------------- idle drift (desktop, pre-run) ---------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !canDrift()) return;
    const startRegion = useAtlas.getState().region;
    const keepGoing = () => {
      const st = useAtlas.getState();
      return (
        !st.run &&
        !st.running &&
        st.demoStep === null &&
        !st.selectedMatchId &&
        st.mapMode === "3d" &&
        st.region === startRegion &&
        !st.closeupOpen &&
        !st.focus
      );
    };
    let stop = () => {};
    const timer = setTimeout(() => {
      if (keepGoing()) stop = startDrift(map, keepGoing);
    }, 2500);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [mapReady]);

  // the guided demo owns ← / → while it runs; Mapbox's keyboard pan would also shift the framed pair on every step
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (demoOn) map.keyboard.disable();
    else map.keyboard.enable();
  }, [demoOn, mapReady]);

  // mapbox-gl.css is unlayered and sets .mapboxgl-map{position:relative}, so size the map through a wrapper.
  // While the 3D close-up covers the stage, the map is hidden (its canvas stops compositing; SPEC §6.5).
  return (
    <div className="group/map absolute inset-0" data-inspector={inspectorOpen && !!selected} style={closeupOpen ? { visibility: "hidden" } : undefined}>
      <div ref={el} style={{ width: "100%", height: "100%" }} aria-label="Map of public construction plans" role="region" />
      {/* keyboard focus on the map: an inset ring around the part of the map no panel covers */}
      <div
        aria-hidden
        className="pointer-events-none absolute hidden rounded-panel shadow-[inset_0_0_0_2px_var(--fg-1)] group-has-[.mapboxgl-canvas:focus-visible]/map:block"
        style={{
          left: "var(--focal-l)",
          top: "var(--focal-t)",
          right: "var(--focal-r)",
          bottom: "var(--focal-b)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------ small map helpers ------------------------------------------------ */

/** arcs / ring: map-3d's raised links and review ring (the rank chips and the pair's labels are always map-core's HTML). */
type Covers = { arcs: boolean; ring: boolean };

/** Which flat elements map-3d replaces right now: only in 3D, and only once its layers exist in the current style. */
function map3dCovers(map: mapboxgl.Map, mode: "3d" | "flat"): Covers {
  if (mode !== "3d") return { arcs: false, ring: false };
  // what map-3d actually draws right now: read (never touch) its sources
  const features = (id: string): GeoJSON.Feature[] => {
    try {
      const src = map.getSource(id) as (GeoJSONSource & { serialize?: () => { data?: unknown } }) | undefined;
      return (src?.serialize?.().data as FC | undefined)?.features ?? [];
    } catch {
      return [];
    }
  };
  // its ring is the selected pair's; a project focus keeps the flat ring when map-3d draws none
  const ring = hasLayer(map, "gl3d-ring") && features("gl3d-src-ring-line").length > 0;
  return { arcs: hasLayer(map, "gl3d-arcs"), ring };
}

function setChipsShown(list: { el: HTMLElement }[], shown: boolean) {
  for (const c of list) c.el.style.opacity = shown ? "1" : "0";
}

const CHIP_W = 34;
const CHIP_H = 24;
const CHIP_GAP = 4;

/**
 * Rank chips whose links meet (the top pairs often share a hub) would stack into one blur ("0103"): chips closer than a
 * chip's width form a group and sit side by side in rank order ("01 02 03"), centred on the group; a group that would
 * still touch an earlier one steps up a row.
 */
function spreadChips(map: mapboxgl.Map, list: { marker: mapboxgl.Marker; at: [number, number] }[]) {
  if (!list.length) return;
  const pts = list.map((c) => map.project(c.at));
  // groups: transitive closeness (in rank order)
  const group = list.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
  for (let i = 0; i < list.length; i++)
    for (let j = 0; j < i; j++)
      if (Math.abs(pts[i].x - pts[j].x) < CHIP_W + CHIP_GAP + 8 && Math.abs(pts[i].y - pts[j].y) < CHIP_H + 8) group[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const placed: { x: number; y: number }[] = [];
  const clash = (x: number, y: number) => placed.some((q) => Math.abs(q.x - x) < CHIP_W + CHIP_GAP && Math.abs(q.y - y) < CHIP_H + 2);
  for (const members of groups.values()) {
    const cx = members.reduce((sum, i) => sum + pts[i].x, 0) / members.length;
    const cy = Math.min(...members.map((i) => pts[i].y));
    const n = members.length;
    let dy = -6;
    const xs = members.map((_, k) => cx + (k - (n - 1) / 2) * (CHIP_W + CHIP_GAP));
    while (xs.some((x) => clash(x, cy + dy)) && dy > -6 - 4 * (CHIP_H + 4)) dy -= CHIP_H + 4;
    members.forEach((i, k) => {
      list[i].marker.setOffset([Math.round(xs[k] - pts[i].x), Math.round(cy + dy - pts[i].y)]);
      placed.push({ x: xs[k], y: cy + dy });
    });
  }
}
