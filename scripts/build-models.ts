/**
 * Exports the procedural structure models (lib/models/structures.ts) to binary glTF for the 3D map scene:
 *   public/models/spire.glb       region-zoom spire (gl3d-spires)
 *   public/models/tower.glb       lattice transmission tower (gl3d-structures, official-GIS routes only)
 *   public/models/substation.glb  substation yard (gl3d-structures)
 *   public/models/pylon.glb       marker pylon for unknown voltage classes (gl3d-structures)
 *
 * Run: npx tsx scripts/build-models.ts
 *
 * three's GLTFExporter reads blobs with FileReader, which Node does not have: a small shim is installed first.
 * Each file must stay under 200 KB (checked below; the script exits non-zero otherwise).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { MAP_BAKE, buildLatticeTower, buildMarkerPylon, buildSpire, buildSubstation } from "../lib/models/structures";

type ReaderEvent = { target: FileReaderShim };

/** Minimal FileReader: readAsArrayBuffer / readAsDataURL via blob.arrayBuffer(), then onload + onloadend. */
class FileReaderShim {
  result: ArrayBuffer | string | null = null;
  error: unknown = null;
  onload: ((e: ReaderEvent) => void) | null = null;
  onloadend: ((e: ReaderEvent) => void) | null = null;
  onerror: ((e: ReaderEvent) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void this.read(blob, (buf) => buf);
  }

  readAsDataURL(blob: Blob): void {
    void this.read(blob, (buf) => `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`);
  }

  private async read(blob: Blob, map: (buf: ArrayBuffer) => ArrayBuffer | string): Promise<void> {
    try {
      this.result = map(await blob.arrayBuffer());
      this.onload?.({ target: this });
    } catch (err) {
      this.error = err;
      this.onerror?.({ target: this });
    }
    this.onloadend?.({ target: this });
  }
}

const g = globalThis as unknown as { FileReader?: unknown };
if (typeof g.FileReader === "undefined") g.FileReader = FileReaderShim;

const MAX_BYTES = 200 * 1024;
const outDir = path.join(process.cwd(), "public", "models");

/**
 * Bakes a uniform or per-axis scale into the geometry (normals are re-derived by applyMatrix4), so the map can use
 * one model-scale curve for every structure: mapbox-gl 3.31 cannot vary a zoom-dependent model-scale per feature.
 */
function baked(object: THREE.Object3D, [sx, sy, sz]: readonly [number, number, number]): THREE.Object3D {
  const m = new THREE.Matrix4().makeScale(sx, sy, sz);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.applyMatrix4(m);
  });
  return object;
}

// Map variants (the 3D close-up builds its structures live from lib/models/structures.ts and never loads these):
// MAP_BAKE scales them relative to each other; the substation also drops its gravel pad (a 2 km slab at map scale).
const models: Record<string, () => THREE.Object3D> = {
  spire: buildSpire,
  tower: () => baked(buildLatticeTower(), MAP_BAKE.tower),
  substation: () => baked(buildSubstation({ pad: false }), MAP_BAKE.substation),
  pylon: () => baked(buildMarkerPylon(), MAP_BAKE.pylon),
};

async function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  const scene = new THREE.Scene();
  scene.add(object);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return a binary glTF");
  return result;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  let failed = false;
  for (const [name, build] of Object.entries(models)) {
    const object = build();
    let triangles = 0;
    let meshes = 0;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const geo = mesh.geometry;
      triangles += (geo.index ? geo.index.count : geo.getAttribute("position").count) / 3;
    });
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const glb = await exportGlb(object);
    const file = path.join(outDir, `${name}.glb`);
    writeFileSync(file, Buffer.from(glb));
    const kb = glb.byteLength / 1024;
    const ok = glb.byteLength < MAX_BYTES && meshes <= 3;
    if (!ok) failed = true;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${name.padEnd(10)} ${kb.toFixed(1).padStart(6)} KB  ${meshes} meshes  ${triangles} tris  ` +
        `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m (x × y-up × z)`,
    );
  }
  if (failed) {
    console.error(`some models exceed ${MAX_BYTES / 1024} KB or 3 meshes`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
