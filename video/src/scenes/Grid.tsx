import { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BigNumber, Eyebrow, Panel } from "../components/ui";
import { CLAMP, inOut, outExpo, prog, rand, smooth } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

// data/eval/eval.json: 7,929 candidate cross-utility pairs; literal OR rule (B3) 4,631; GridLock engine 149
const N = 7929;
const NAIVE = 4631;
const FLAGGED = 149;
const COLS = 113;
const GX = 110;
const GY = 236;
const STEP = 8.7;

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const Grid: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const a = at("s07");
  const n = at("s08");
  const g = ph("s08", 1);
  const last = ph("s08", 2);
  const sets = useMemo(() => {
    const order = Array.from({ length: N }, (_, i) => i).sort((x, y) => rand(x, 3) - rand(y, 3));
    const naiveRank = new Float32Array(N).fill(-1);
    order.slice(0, NAIVE).forEach((i, k) => (naiveRank[i] = k / NAIVE));
    const flagRank = new Float32Array(N).fill(-1);
    order.slice(0, NAIVE).sort((x, y) => rand(x, 11) - rand(y, 11)).slice(0, FLAGGED).forEach((i, k) => (flagRank[i] = k / FLAGGED));
    return { naiveRank, flagRank };
  }, []);

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const base = hex("#6f7a80");
    const warn = hex(C.warn);
    const amb = hex(C.amber);
    const naiveOut = prog(f, g - 6, 24, inOut);
    const pulse = f >= last ? 0.5 + 0.5 * Math.sin((f - last) / 4) : 0;
    const glows: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const appear = prog(f, a + (col + row) * 0.42 + rand(i, 7) * 6, 12);
      if (appear <= 0) continue;
      const x = GX + col * STEP;
      const y = GY + row * STEP;
      let c = base;
      let alpha = 0.5 * appear;
      let r = 2.2;
      const nr = sets.naiveRank[i];
      if (nr >= 0) {
        const on = prog(f, n + 8 + nr * 45, 8);
        c = mix(base, warn, on * (1 - naiveOut));
        alpha = (0.5 + 0.45 * on) * appear * (1 - naiveOut * 0.55);
      }
      if (naiveOut > 0) alpha *= 1 - naiveOut * 0.35;
      const fr = sets.flagRank[i];
      if (fr >= 0) {
        const on = prog(f, g + fr * 22, 10, outExpo);
        if (on > 0) {
          c = mix(c, amb, on);
          alpha = Math.max(alpha, on);
          r = 2.2 + on * (2.6 + pulse * 1.2);
          glows.push([x, y, on]);
        }
      }
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [x, y, on] of glows) {
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 16 + pulse * 6);
      grd.addColorStop(0, `rgba(212,184,117,${0.45 * on})`);
      grd.addColorStop(1, "rgba(212,184,117,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, 16 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [f, a, n, g, last, sets]);

  const explain = smooth(f, fps, a + 30);
  const explainOut = prog(f, n - 10, 20, inOut);
  const bars = smooth(f, fps, n);
  const naiveW = prog(f, n + 8, 45, outExpo) * 0.584;
  const flagW = prog(f, g, 30, outExpo) * 0.019;
  const barMax = 560;
  return (
    <AbsoluteFill>
      <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: GX, top: 150 }}>
        <Eyebrow delay={a}>Every cross-utility pair · all regions</Eyebrow>
      </div>

      <div style={{ position: "absolute", left: 1180, top: 190, width: 640 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <BigNumber to={N} delay={a + 6} dur={ph("s07", 0) + 30 - a} style={{ fontSize: 112, color: C.fg1, fontWeight: 500 }} />
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 34, color: C.fg2, marginTop: 4, opacity: prog(f, a + 10, 16) }}>pairs measured, closest point to closest point</div>

        {/* how a pair is measured */}
        <div style={{ marginTop: 34, opacity: explain * (1 - explainOut), transform: `translateY(${(1 - explain) * 30}px)` }}>
          <Panel style={{ padding: 26 }}>
            <svg width={588} height={200}>
              <circle cx={318} cy={112} r={170 * prog(f, a + 70, 40, inOut)} fill="rgba(212,184,117,0.05)" stroke={C.amber} strokeOpacity={0.35} strokeDasharray="5 7" />
              <path d="M40,160 L230,70" stroke={C.a} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(f, a + 40, 24)} />
              <circle cx={40} cy={160} r={7} fill={C.a} opacity={prog(f, a + 40, 8)} />
              <circle cx={230} cy={70} r={7} fill={C.a} opacity={prog(f, a + 58, 8)} />
              <path d="M318,112 L420,150" stroke={C.b} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(f, a + 48, 24)} />
              <circle cx={318} cy={112} r={7} fill={C.b} opacity={prog(f, a + 48, 8)} />
              <circle cx={420} cy={150} r={7} fill={C.b} opacity={prog(f, a + 66, 8)} />
              <line x1={230} y1={70} x2={230 + 88 * prog(f, a + 80, 22, inOut)} y2={70 + 42 * prog(f, a + 80, 22, inOut)} stroke={C.amber} strokeWidth={3} strokeDasharray="6 5" />
              <text x={262} y={60} fill={C.amber} fontFamily={F.mono} fontSize={18} opacity={prog(f, a + 96, 12)}>
                closest approach
              </text>
              <text x={440} y={40} fill={C.fg3} fontFamily={F.mono} fontSize={16} opacity={prog(f, a + 100, 12)}>
                25 mi review radius
              </text>
            </svg>
            <div style={{ fontFamily: F.sans, fontSize: 22, color: C.fg2, marginTop: 8 }}>
              Routes, terminals and work sites keep their provenance: <span style={{ color: C.fg1 }}>official</span>, <span style={{ color: C.fg1 }}>estimated</span> or <span style={{ color: C.fg1 }}>site point</span>.
            </div>
          </Panel>
        </div>
      </div>

      {/* the comparison */}
      <div style={{ position: "absolute", left: 1180, top: 470, width: 640, opacity: bars, transform: `translateY(${(1 - bars) * 30}px)` }}>
        <div style={{ fontFamily: F.mono, fontSize: 20, color: C.warn, letterSpacing: "0.08em", textTransform: "uppercase" }}>Naive rule · close OR same time</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
          <div style={{ height: 26, width: barMax * naiveW, background: C.warn, borderRadius: 13, opacity: 1 - prog(f, g, 20) * 0.45 }} />
          <BigNumber to={NAIVE} delay={n + 8} dur={45} style={{ fontSize: 46, color: C.warn }} />
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 20, color: C.fg3, marginTop: 6 }}>{(58.4 * prog(f, n + 8, 45, outExpo)).toFixed(1)}% of all pairs</div>

        <div style={{ marginTop: 50, opacity: prog(f, g - 4, 16) }}>
          <div style={{ fontFamily: F.mono, fontSize: 20, color: C.amber, letterSpacing: "0.08em", textTransform: "uppercase" }}>GridLock Atlas</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
            <div style={{ height: 26, width: Math.max(8, barMax * flagW), background: C.amber, borderRadius: 13, boxShadow: `0 0 20px ${C.amber}` }} />
            <BigNumber to={FLAGGED} delay={g} dur={30} style={{ fontSize: 96, color: C.amber, fontWeight: 500 }} />
          </div>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 40,
              color: C.fg1,
              marginTop: 10,
              opacity: prog(f, last - 4, 14),
              transform: `scale(${interpolate(prog(f, last - 4, 14, outExpo), [0, 1], [0.9, 1], CLAMP)})`,
              transformOrigin: "left",
            }}
          >
            just <span style={{ fontFamily: F.mono, color: C.amber }}>1.9%</span> — worth a planner's call
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
