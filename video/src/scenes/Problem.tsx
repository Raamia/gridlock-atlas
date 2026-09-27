import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { GeoMap } from "../components/GeoMap";
import { Chip, Eyebrow, Panel, Words } from "../components/ui";
import { CLAMP, count, inOut, outExpo, prog, smooth } from "../lib/anim";
import { Camera, GEO, lerpCam } from "../lib/geo";
import { at } from "../lib/timeline";
import { C, F } from "../theme";

const WIDE: Camera = { lon: -83.1, lat: 33.25, zoom: 162 };
const RIVER: Camera = { lon: -81.5, lat: 32.62, zoom: 560 };
const CLOSE: Camera = { lon: -81.14, lat: 32.335, zoom: 2500 };
// the side card takes the right half: pan so the pair sits in the left third
const ASIDE: Camera = { lon: -81.14 + 430 / (Math.cos((32.33 * Math.PI) / 180) * 1500), lat: 32.3, zoom: 1500 };
// counts as published in the two plans (the app's "199 planned projects"; one GPC project has no mappable place)
const DESC_N = 54;
const GPC_N = 145;
const TOP = GEO.pairs.find((p) => p.id === "desc-06367-d-g__gpc-20065")!;

export const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s3 = at("s03");
  const s4 = at("s04");
  const zoomT = prog(f, s3 + 116, 76, inOut);
  const closeT = prog(f, s3 + 150, 60, inOut);
  const asideT = prog(f, s4 - 10, 40, inOut);
  const cam = lerpCam(lerpCam(lerpCam(WIDE, RIVER, zoomT), CLOSE, closeT), ASIDE, asideT);
  const outline = prog(f, 0, 50, inOut);
  const border = prog(f, 22, 50, inOut);
  const desc = GEO.projects.filter((p) => p.u === "desc").length;
  const gpc = GEO.projects.length - desc;
  const countsOut = prog(f, s3 + 118, 24, inOut);
  // projects pop in by utility, west→east for Georgia Power, east→west for DESC
  const order = GEO.projects.map((p, i) => ({ i, lon: p.p[0]?.[0] ?? p.l[0]?.[0]?.[0] ?? 0, u: p.u }));
  const rank = new Map<number, number>();
  order.filter((o) => o.u === "desc").sort((a, b) => b.lon - a.lon).forEach((o, k) => rank.set(o.i, k / desc));
  order.filter((o) => o.u !== "desc").sort((a, b) => a.lon - b.lon).forEach((o, k) => rank.set(o.i, k / gpc));
  const projectT = (i: number, p: (typeof GEO.projects)[number]) => prog(f, (p.u === "desc" ? s3 + 40 : s3 + 60) + (rank.get(i) ?? 0) * 70, 22);
  const ruler = prog(f, s3 + 188, 30, inOut);
  const dim = prog(f, s4 - 6, 30, inOut);
  const cardIn = smooth(f, fps, s4 + 4);
  const countT = prog(f, s3 + 36, 50, outExpo);
  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <GeoMap cam={cam} outline={outline} border={border} projectT={projectT} dim={dim * 0.35} frame={f}>
          {(P) => {
            const [bx, by] = P([-81.75, 32.95]);
            const [ax, ay] = P(TOP.a);
            const [cx, cy] = P(TOP.b);
            const lbl = prog(f, 40, 30);
            return (
              <g>
                <text
                  x={bx}
                  y={by}
                  fill="#bfe6ff"
                  opacity={lbl * (0.9 - zoomT * 0.2)}
                  fontFamily={F.mono}
                  fontSize={18 + zoomT * 4}
                  letterSpacing="0.2em"
                  transform={`rotate(${-52} ${bx} ${by})`}
                  textAnchor="middle"
                >
                  SAVANNAH RIVER · STATE LINE
                </text>
                {ruler > 0 && (
                  <g opacity={ruler}>
                    <line x1={ax} y1={ay} x2={ax + (cx - ax) * ruler} y2={ay + (cy - ay) * ruler} stroke={C.amber} strokeWidth={3} strokeDasharray="7 6" />
                    <circle cx={ax} cy={ay} r={9} fill="none" stroke={C.amber} strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={9} fill="none" stroke={C.amber} strokeWidth={2} opacity={ruler} />
                    <g transform={`translate(${(ax + cx) / 2}, ${(ay + cy) / 2 - 70})`}>
                      <rect x={-150} y={-40} width={300} height={64} rx={32} fill="rgba(13,17,21,0.88)" stroke={C.amber} strokeOpacity={0.7} />
                      <text x={0} y={4} textAnchor="middle" fill={C.amber} fontFamily={F.mono} fontSize={32}>
                        {(4.25 * ruler).toFixed(2)} mi apart
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          }}
        </GeoMap>
      </AbsoluteFill>

      {/* project counts */}
      <div style={{ position: "absolute", left: 90, top: 80, opacity: 1 - countsOut, display: "flex", flexDirection: "column", gap: 18 }}>
        <Eyebrow delay={s3}>Savannah River · SC–GA · public plans</Eyebrow>
        <div style={{ fontFamily: F.sans, fontSize: 64, fontWeight: 600, color: C.fg1, letterSpacing: "-0.02em", opacity: prog(f, s3 + 30, 20) }}>
          <span style={{ fontFamily: F.mono, fontWeight: 500 }}>{count(countT, DESC_N + GPC_N)}</span> planned projects
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Chip color={C.a} delay={s3 + 44}>
            ● Dominion Energy SC · {count(countT, DESC_N)}
          </Chip>
          <Chip color={C.b} delay={s3 + 64}>
            ● Georgia Power · {count(countT, GPC_N)}
          </Chip>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 120,
          opacity: prog(f, s3 + 196, 20) * (1 - dim),
          fontFamily: F.serif,
          fontStyle: "italic",
          fontSize: 64,
          color: C.amber,
        }}
      >
        just miles apart
      </div>

      {/* 2024: the federal rule */}
      <div style={{ position: "absolute", right: 110, top: 190, width: 760, opacity: cardIn, transform: `translateX(${(1 - cardIn) * 120}px)` }}>
        <Panel style={{ padding: "34px 40px" }} accent={C.fg2}>
          <Eyebrow delay={s4 + 6}>2024 · Federal Energy Regulatory Commission</Eyebrow>
          <div style={{ fontFamily: F.sans, fontSize: 56, fontWeight: 600, color: C.fg1, marginTop: 14, letterSpacing: "-0.01em" }}>FERC Order No. 1920</div>
          <div style={{ fontFamily: F.sans, fontSize: 27, color: C.fg2, marginTop: 10, lineHeight: 1.4 }}>Long-term regional transmission planning — effective August 12, 2024.</div>
        </Panel>
        <div style={{ marginTop: 56 }}>
          <Words text="Planning in isolation" delay={s4 + 60} style={{ fontFamily: F.sans, fontSize: 60, fontWeight: 600, color: C.fg1, letterSpacing: "-0.02em" }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 10 }}>
            <span style={{ fontFamily: F.sans, fontSize: 60, color: C.fg3, opacity: prog(f, s4 + 110, 14) }}>→</span>
            <Words text="waste," delay={s4 + 118} style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 84, color: C.warn }} />
            <Words text="and delays." delay={s4 + 150} style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 84, color: C.warn }} />
          </div>
        </div>
      </div>
      {/* keep the title safe from the caption band */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 140, background: `linear-gradient(transparent, rgba(13,17,21,${0.5 * interpolate(dim, [0, 1], [1, 0.4], CLAMP)}))` }} />
    </AbsoluteFill>
  );
};
