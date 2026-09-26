import * as THREE from "three";

/**
 * Procedural low-poly structure models (SPEC §6.2), shared by the 3D map scene (exported to public/models/*.glb by
 * scripts/build-models.ts) and the 3D pair close-up.
 *
 * Units and frame: metres, Y-up, origin at the base centre (the model stands on y = 0, centred on x = z = 0).
 * Material: MeshStandardMaterial #d9dde3, roughness 0.6, no textures (tinted per utility at render time).
 *
 * FOUNDATION STUB: final signatures, placeholder boxes. map-3d replaces the bodies (merged geometry per material,
 * ≤3 meshes per model, indexed).
 */

export interface LatticeTowerOptions {
  /** Height to the top cross-arm, metres (default 40). */
  height?: number;
  /** Cross-arm span, metres (default 14). */
  armSpan?: number;
}

export interface SubstationOptions {
  /** Yard footprint along x, metres (default 60). */
  width?: number;
  /** Yard footprint along z, metres (default 40). */
  depth?: number;
}

const material = () => new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.6 });

/** A box of w×h×d metres standing on y = 0 at (x, z). */
function box(w: number, h: number, d: number, x = 0, z = 0, y0 = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material());
  mesh.position.set(x, y0 + h / 2, z);
  return mesh;
}

/** Transmission lattice tower (placeholder: tapered mast + cross-arm). */
export function buildLatticeTower(opts: LatticeTowerOptions = {}): THREE.Group {
  const height = opts.height ?? 40;
  const span = opts.armSpan ?? 14;
  const g = new THREE.Group();
  g.name = "lattice-tower";
  g.add(box(4, height, 4));
  g.add(box(span, 1, 1.2, 0, 0, height * 0.85));
  return g;
}

/** Substation yard (placeholder: pad + two transformer blocks + gantry). */
export function buildSubstation(opts: SubstationOptions = {}): THREE.Group {
  const width = opts.width ?? 60;
  const depth = opts.depth ?? 40;
  const g = new THREE.Group();
  g.name = "substation";
  g.add(box(width, 0.5, depth));
  g.add(box(width * 0.18, 6, depth * 0.25, -width * 0.2, 0, 0.5));
  g.add(box(width * 0.18, 6, depth * 0.25, width * 0.2, 0, 0.5));
  g.add(box(width * 0.8, 1, 1, 0, -depth * 0.3, 12));
  return g;
}

/** Marker pylon for a project center with unknown voltage (placeholder: slim column, 20 m). */
export function buildMarkerPylon(): THREE.Group {
  const g = new THREE.Group();
  g.name = "marker-pylon";
  g.add(box(2, 20, 2));
  return g;
}

/** Region-zoom spire (placeholder: thin column, 40 m; the map scales it non-uniformly). */
export function buildSpire(): THREE.Group {
  const g = new THREE.Group();
  g.name = "spire";
  g.add(box(3, 40, 3));
  return g;
}
