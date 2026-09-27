import React from "react";
import { C, F } from "../theme";
import { GEO, LonLat, pathOf, projector } from "../lib/geo";
import { rand } from "../lib/anim";

/** A stylised public plan document: a stack of pages with a header, table rows and the plan's own little map. */
export const Doc: React.FC<{
  color: string;
  publisher: string;
  title: string;
  meta: string;
  state: "SC" | "GA";
  util: "desc" | "gpc";
  seed: number;
  mapT: number;
}> = ({ color, publisher, title, meta, state, util, seed, mapT }) => {
  const w = 500;
  const h = 640;
  // the plan's own map, framed on its own state
  const rings = GEO.states[state];
  const pts = rings.flat();
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const cam = { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, zoom: state === "GA" ? 38 : 48 };
  const P = projector(cam, (w - 64) / 2, 110);
  const projs = GEO.projects.filter((p) => (util === "gpc" ? p.u !== "desc" : p.u === "desc"));
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {[3, 2, 1].map((k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${k * 10}px, ${k * -10}px) rotate(${(k - 2) * 1.2}deg)`,
            background: "#e9ecee",
            opacity: 0.18 + 0.12 * (3 - k),
            borderRadius: 10,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, #f3f5f6, #e3e7ea)",
          borderRadius: 10,
          boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
          padding: 32,
          color: "#1d252c",
          overflow: "hidden",
        }}
      >
        <div style={{ height: 6, width: 90, background: color, borderRadius: 3, marginBottom: 18 }} />
        <div style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: "#52606a" }}>{publisher}</div>
        <div style={{ fontFamily: F.sans, fontSize: 25, fontWeight: 600, lineHeight: 1.22, marginTop: 10 }}>{title}</div>
        <div style={{ fontFamily: F.mono, fontSize: 14, color: "#6b7881", marginTop: 10 }}>{meta}</div>
        <svg width={w - 64} height={220} style={{ marginTop: 16, background: "#dde2e6", borderRadius: 8 }}>
          {rings.map((r, i) => (
            <path key={i} d={pathOf(r, P, true)} fill="#cfd6db" stroke="#8b979f" strokeWidth={1.2} />
          ))}
          {projs.map((p, i) =>
            p.p.slice(0, 1).map((pt: LonLat, j) => {
              const [x, y] = P(pt);
              const on = mapT * projs.length > i;
              return on ? <circle key={i + "-" + j} cx={x} cy={y} r={3} fill={color} /> : null;
            }),
          )}
        </svg>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ height: 9, width: 50 + rand(i, seed) * 30, background: "#b9c2c8", borderRadius: 3 }} />
              <div style={{ height: 9, width: 140 + rand(i + 9, seed) * 150, background: "#cbd2d7", borderRadius: 3 }} />
              <div style={{ height: 9, width: 40 + rand(i + 19, seed) * 40, background: "#cbd2d7", borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
