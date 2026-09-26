import type { Map as MapboxMap } from "mapbox-gl";
import type { MatchRun } from "@/lib/domain/types";

/**
 * 3D map scene (SPEC §6). Owner: map-3d, which owns every `gl3d-*` layer and source; map-core (MapStage) calls
 * install3D on every `style.load` and update3D whenever the input changes.
 *
 * FOUNDATION STUB: final signatures, safe no-op bodies. map-3d replaces the bodies (and adds the pure
 * `build3DState(input)`); nothing here may throw into MapStage.
 */

export type Map3DInput = {
  run: MatchRun | null;
  region: string;
  selectedMatchId: string | null;
  hoveredMatchId: string | null;
  focusProjectIds: string[] | null;
  mapMode: "3d" | "flat";
  basemap: "night" | "satellite" | "offline";
  reducedMotion: boolean;
  revealNonce: number;
  running: boolean;
};

export const MAP3D_LAYER_PREFIX = "gl3d-";

// style generation per map: bumped by install3D so update3D can tell whether the current style has the 3D layers
const generation = new WeakMap<MapboxMap, number>();

/** Idempotent; call on every style.load. Bumps a style generation. `standard` = Mapbox Standard (slots, symbol labels). */
export function install3D(map: MapboxMap, opts: { standard: boolean }): void {
  void opts;
  generation.set(map, (generation.get(map) ?? 0) + 1);
}

/** No-op until install3D ran for the current style; guarded with getLayer/getSource and try/catch. */
export function update3D(map: MapboxMap, input: Map3DInput): void {
  void input;
  if (!generation.has(map)) return;
}

/** Removes every gl3d-* layer and source. */
export function uninstall3D(map: MapboxMap): void {
  generation.delete(map);
}
