"use client";

import { MapControls } from "./map/MapControls";
import { MapKey } from "./map/MapKey";

/**
 * The map's floating chrome, rendered inside the shell's focal slot (the part of the map no panel covers):
 * the Map key chip at the top-left and the controls stack at the bottom-right. Each piece is its own compact,
 * absolutely placed element carrying data-map-ui, so callouts avoid it and the map stays interactive around it.
 * (The shell owns the vignette and the link/dropped-pair notices; rank chips and callouts are map markers.)
 */
export function MapOverlays() {
  return (
    <>
      <MapKey />
      <MapControls />
    </>
  );
}
