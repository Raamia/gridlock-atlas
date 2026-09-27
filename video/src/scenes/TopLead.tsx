import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { GeoMap } from "../components/GeoMap";
import { Chip, Eyebrow } from "../components/ui";
import { CLAMP, inOut, outExpo, prog, smooth } from "../lib/anim";
import { GEO, LonLat } from "../lib/geo";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

const PAIR = GEO.pairs.find((p) => p.id === "desc-06367-d-g__gpc-20065")!;
const IDS = new Set([PAIR.pa, PAIR.pb]);
const T: Record<string, LonLat> = {
  Jasper: [-81.1242, 32.3607],
  Okatie: [-81.0314, 32.3358],
  Goshen: [-81.2095, 32.2487],
  McIntosh: [-81.1877, 32.3305],
};

// timeline: Jan 2025 → Jan 2029
const T0 = Date.UTC(2025, 0, 1);
const T1 = Date.UTC(2029, 0, 1);
const X0 = 330;
const X1 = 1590;
const tx = (y: number, m: number, d = 1) => X0 + ((Date.UTC(y, m - 1, d) - T0) / (T1 - T0)) * (X1 - X0);

export const TopLead: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s10 = at("s10");
  const names = ph("s10", 0);
  const gp = ph("s10", 1);
  const closest = ph("s10", 2);
  const s11 = at("s11");
  const swap = closest - 34;
  const appOut = prog(f, swap, 22, inOut);
  const mapIn = smooth(f, fps, swap + 6);
  const ruler = prog(f, closest + 6, 34, inOut);
  const tl = smooth(f, fps, s11 - 6);
  const bars = prog(f, s11, 30, inOut);
  const overlap = prog(f, ph("s11", 0) - 6, 22, outExpo);
  const cam = { lon: -81.118, lat: 32.303, zoom: interpolate(f, [swap, swap + 200], [3900, 4300], CLAMP) };
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - appOut, transform: `scale(${1 + appOut * 0.08})` }}>
        <AppFrame
          clip="b-select"
          width={1450}
          y={10}
          shots={[
            { f: names - 6, z: 1.0, x: 0.5, y: 0.5 },
            { f: names + 30, z: 1.9, x: 0.86, y: 0.28 },
            { f: gp + 40, z: 2.0, x: 0.86, y: 0.42 },
          ]}
        />
        <div style={{ position: "absolute", left: 200, top: 40, opacity: prog(f, s10, 12) * (1 - appOut) }}>
          <Chip color={C.amber} delay={s10}>
            Needs review · #1 of 70
          </Chip>
        </div>
      </AbsoluteFill>

      {/* anatomy of the #1 lead, drawn from the snapshot geometry */}
      <AbsoluteFill style={{ opacity: mapIn }}>
        <div style={{ position: "absolute", left: 0, top: -120, width: 1920, height: 1080 }}>
          <GeoMap cam={cam} outline={1} border={1} projectT={(i, p) => (IDS.has(p.id) ? prog(f, swap + 10, 30) : 0.25 * mapIn)} frame={f}>
            {(P) => {
              const [ax, ay] = P(PAIR.a);
              const [bx, by] = P(PAIR.b);
              return (
                <g>
                  {Object.entries(T).map(([name, ll]) => {
                    const [x, y] = P(ll);
                    const up = name === "Jasper" || name === "Okatie";
                    return (
                      <text key={name} x={x} y={y + (up ? -22 : 36)} textAnchor="middle" fill={C.fg2} fontFamily={F.mono} fontSize={22} opacity={prog(f, swap + 24, 14)}>
                        {name}
                      </text>
                    );
                  })}
                  {ruler > 0 && (
                    <g>
                      <line x1={ax} y1={ay} x2={ax + (bx - ax) * ruler} y2={ay + (by - ay) * ruler} stroke={C.amber} strokeWidth={4} strokeDasharray="10 8" />
                      <circle cx={ax} cy={ay} r={14} fill="none" stroke={C.amber} strokeWidth={2.5} />
                      <circle cx={bx} cy={by} r={14} fill="none" stroke={C.amber} strokeWidth={2.5} opacity={ruler} />
                    </g>
                  )}
                </g>
              );
            }}
          </GeoMap>
        </div>
        <div style={{ position: "absolute", left: 120, top: 90, width: 640 }}>
          <Eyebrow delay={swap + 10} dot={C.a} color={C.a}>
            Dominion Energy SC · 230 kV
          </Eyebrow>
          <div style={{ fontFamily: F.sans, fontSize: 44, fontWeight: 600, color: C.fg1, marginTop: 8, opacity: prog(f, swap + 14, 16) }}>Jasper – Okatie #2</div>
          <div style={{ height: 22 }} />
          <Eyebrow delay={swap + 22} dot={C.b} color={C.b}>
            Georgia Power · 115 kV
          </Eyebrow>
          <div style={{ fontFamily: F.sans, fontSize: 44, fontWeight: 600, color: C.fg1, marginTop: 8, opacity: prog(f, swap + 26, 16) }}>Goshen – McIntosh rebuild</div>
        </div>
        <div style={{ position: "absolute", right: 120, top: 110, textAlign: "right", opacity: prog(f, closest + 20, 14) }}>
          <div style={{ fontFamily: F.mono, fontSize: 132, color: C.amber, lineHeight: 1, textShadow: `0 0 40px ${C.amber}55` }}>
            {(4.25 * prog(f, closest + 20, 36, outExpo)).toFixed(2)}
            <span style={{ fontSize: 56 }}> mi</span>
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 30, color: C.fg2, marginTop: 10 }}>closest approach · inside 25 mi</div>
          <div style={{ fontFamily: F.mono, fontSize: 19, color: C.fg3, marginTop: 8 }}>tier: shared site logistics (&lt; 8 km)</div>
        </div>

        {/* published schedules */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: tl }}>
          <div style={{ position: "absolute", left: X0 - 200, top: 700, width: X1 - X0 + 400, height: 250, borderRadius: 22, background: "rgba(13,17,21,0.72)", border: `1px solid ${C.line}` }} />
          {[2025, 2026, 2027, 2028, 2029].map((y) => (
            <div key={y} style={{ position: "absolute", left: tx(y, 1), top: 722, transform: "translateX(-50%)", fontFamily: F.mono, fontSize: 20, color: C.fg3 }}>
              {y}
              <div style={{ width: 1, height: 170, background: C.line, margin: "6px auto 0" }} />
            </div>
          ))}
          {/* overlap band */}
          <div
            style={{
              position: "absolute",
              left: tx(2025, 6),
              top: 752,
              width: (tx(2026, 12) - tx(2025, 6)) * overlap,
              height: 140,
              background: "rgba(212,184,117,0.16)",
              border: `1.5px solid ${C.amber}`,
              borderRadius: 10,
              boxShadow: `0 0 40px rgba(212,184,117,${0.25 * overlap})`,
            }}
          />
          <div style={{ position: "absolute", left: X0 - 180, top: 778, fontFamily: F.mono, fontSize: 19, color: C.a }}>DESC</div>
          <div style={{ position: "absolute", left: tx(2025, 1), top: 772, height: 30, width: (tx(2026, 12) - tx(2025, 1)) * bars, background: `linear-gradient(90deg, ${C.a}55, ${C.a})`, borderRadius: 15 }} />
          <div style={{ position: "absolute", left: tx(2026, 12) + 16, top: 775, fontFamily: F.mono, fontSize: 19, color: C.fg2, opacity: prog(f, s11 + 26, 10) }}>in service Dec 1, 2026</div>
          <div style={{ position: "absolute", left: X0 - 180, top: 838, fontFamily: F.mono, fontSize: 19, color: C.b }}>GA POWER</div>
          <div
            style={{
              position: "absolute",
              left: tx(2025, 6),
              top: 832,
              height: 30,
              width: (tx(2028, 12, 31) - tx(2025, 6)) * bars,
              background: `linear-gradient(90deg, ${C.b}, ${C.b} 70%, ${C.b}22)`,
              borderRadius: 15,
            }}
          />
          <div style={{ position: "absolute", left: tx(2025, 6), top: 870, fontFamily: F.mono, fontSize: 17, color: C.fg3, opacity: prog(f, s11 + 26, 10) }}>start Jun 1, 2025 → in service 2028</div>
          <div
            style={{
              position: "absolute",
              left: tx(2025, 6),
              width: tx(2026, 12) - tx(2025, 6),
              top: 646,
              display: "flex",
              justifyContent: "center",
              opacity: overlap,
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 24, color: C.amber, background: "rgba(13,17,21,0.9)", border: `1.5px solid ${C.amber}`, borderRadius: 999, padding: "6px 18px", whiteSpace: "nowrap" }}>
              overlap · Jun 2025 – Dec 2026 · 18 months
            </span>
          </div>
          <div style={{ position: "absolute", left: 0, width: 1920, top: 912, textAlign: "center", fontFamily: F.mono, fontSize: 17, color: C.fg3, opacity: prog(f, ph("s11", 0) + 20, 14) }}>
            published schedules, start → in-service · field-work dates are not published
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
