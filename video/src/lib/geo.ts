import geo from "../data/geo.json";

export type LonLat = [number, number];
export interface Camera {
  lon: number;
  lat: number;
  /** pixels per degree of latitude */
  zoom: number;
}

export const GEO = geo as unknown as {
  states: Record<string, LonLat[][]>;
  border: LonLat[];
  projects: { id: string; u: "desc" | "gpc" | "sertp26"; t: string; l: LonLat[][]; p: LonLat[] }[];
  pairs: { id: string; a: LonLat; b: LonLat; mi: number; s: string; badge: string; pa: string; pb: string }[];
};

export const W = 1920;
export const H = 1080;

export function projector(cam: Camera, cx = W / 2, cy = H / 2) {
  const k = Math.cos((cam.lat * Math.PI) / 180);
  return ([lon, lat]: LonLat): [number, number] => [cx + (lon - cam.lon) * k * cam.zoom, cy - (lat - cam.lat) * cam.zoom];
}

export const pathOf = (pts: LonLat[], P: (p: LonLat) => [number, number], close = false) =>
  pts.map((p, i) => {
    const [x, y] = P(p);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("") + (close ? "Z" : "");

export const lerpCam = (a: Camera, b: Camera, t: number): Camera => ({
  lon: a.lon + (b.lon - a.lon) * t,
  lat: a.lat + (b.lat - a.lat) * t,
  // zoom interpolates geometrically so the move feels even
  zoom: a.zoom * Math.pow(b.zoom / a.zoom, t),
});

/** Miles between two points (haversine). */
export function miles(a: LonLat, b: LonLat) {
  const R = 3958.8;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
