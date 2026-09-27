import React from "react";
import { C } from "../theme";
import { Camera, GEO, H, LonLat, pathOf, projector, W } from "../lib/geo";

const COLOR = { desc: C.a, gpc: C.b, sertp26: C.b } as const;

export interface GeoMapProps {
  cam: Camera;
  /** 0→1 draw-on of state outlines */
  outline?: number;
  /** 0→1 glow of the SC–GA border (the Savannah River) */
  border?: number;
  /** per-project appearance 0→1 (index into GEO.projects) */
  projectT?: (i: number, p: (typeof GEO.projects)[number]) => number;
  /** per-pair link appearance 0→1 */
  pairT?: (i: number, p: (typeof GEO.pairs)[number]) => number;
  dim?: number;
  children?: (P: (p: LonLat) => [number, number]) => React.ReactNode;
  frame?: number;
  w?: number;
  h?: number;
  style?: React.CSSProperties;
}

/** SVG map drawn from the snapshot: Census state outlines, the Savannah River state line, both utilities' projects. */
export const GeoMap: React.FC<GeoMapProps> = ({ cam, outline = 1, border = 0, projectT, pairT, dim = 0, children, frame = 0, w = W, h = H, style }) => {
  const P = projector(cam, w / 2, h / 2);
  const sw = Math.max(0.8, Math.min(2.2, cam.zoom / 180));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, opacity: 1 - dim * 0.7, ...style }}>
      <defs>
        <filter id={`glow${w}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`softglow${w}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {/* states */}
      {Object.entries(GEO.states).map(([ab, rings]) =>
        rings.map((r, i) => {
          const focus = ab === "SC" || ab === "GA";
          return (
            <path
              key={ab + i}
              d={pathOf(r, P, true)}
              pathLength={1}
              fill={focus ? "rgba(48,54,62,0.55)" : "rgba(39,44,51,0.35)"}
              fillOpacity={outline}
              stroke={focus ? "#6f7a80" : "#4a545b"}
              strokeWidth={focus ? 1.4 : 1}
              strokeDasharray={1}
              strokeDashoffset={1 - outline}
            />
          );
        }),
      )}
      {/* the Savannah River: SC–GA state line */}
      {border > 0 && (
        <g opacity={border}>
          <path d={pathOf(GEO.border, P)} fill="none" stroke="#8fd3ff" strokeWidth={10} strokeOpacity={0.25} filter={`url(#softglow${w})`} />
          <path
            d={pathOf(GEO.border, P)}
            pathLength={1}
            fill="none"
            stroke="#bfe6ff"
            strokeWidth={2.4}
            strokeDasharray={1}
            strokeDashoffset={1 - border}
            strokeLinecap="round"
          />
        </g>
      )}
      {/* pair links (closest points): one blurred glow layer under the crisp arcs */}
      {pairT &&
        (() => {
          const arcs = GEO.pairs
            .map((p, i) => {
              const t = pairT(i, p);
              if (t <= 0) return null;
              const [x1, y1] = P(p.a);
              const [x2, y2] = P(p.b);
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.35;
              return { id: p.id, t, d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}` };
            })
            .filter((a): a is { id: string; t: number; d: string } => a !== null);
          return (
            <g>
              <g filter={`url(#softglow${w})`}>
                {arcs.map((a) => (
                  <path key={a.id} d={a.d} fill="none" stroke={C.amber} strokeWidth={5} strokeOpacity={0.18 * Math.min(1, a.t * 2)} />
                ))}
              </g>
              {arcs.map((a) => (
                <path key={a.id} d={a.d} pathLength={1} fill="none" stroke={C.amber} strokeWidth={1.6} strokeDasharray={1} strokeDashoffset={1 - a.t} strokeOpacity={0.9 * Math.min(1, a.t * 2)} />
              ))}
            </g>
          );
        })()}
      {/* projects */}
      {GEO.projects.map((p, i) => {
        const t = projectT ? projectT(i, p) : 1;
        if (t <= 0) return null;
        const col = COLOR[p.u];
        return (
          <g key={p.id} opacity={Math.min(1, t * 1.5)}>
            {p.l.map((ln, j) => (
              <path key={j} d={pathOf(ln, P)} pathLength={1} fill="none" stroke={col} strokeWidth={sw * 1.6} strokeDasharray={1} strokeDashoffset={1 - t} strokeLinecap="round" strokeOpacity={0.85} />
            ))}
            {p.p.map((pt, j) => {
              const [x, y] = P(pt);
              const r = sw * 2.6 * (0.4 + 0.6 * Math.min(1, t * 1.3));
              const tw = 0.6 + 0.4 * Math.sin(frame / 9 + i * 1.7);
              return (
                <g key={j}>
                  <circle cx={x} cy={y} r={r * 3.2} fill={col} opacity={0.12 * tw} />
                  <circle cx={x} cy={y} r={r} fill={col} />
                </g>
              );
            })}
          </g>
        );
      })}
      {children?.(P)}
    </svg>
  );
};
