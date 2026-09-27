import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { GeoMap } from "../components/GeoMap";
import { BigNumber, Eyebrow, Panel } from "../components/ui";
import { inOut, pop, prog, smooth } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

const SOURCES = [
  "Dominion Energy South Carolina · SCRTP",
  "Georgia Power · Georgia PSC Docket 56002",
  "Southeastern Regional Transmission Planning",
  "Public Service Commission of South Carolina",
  "Public Service Commission of Wisconsin",
  "Midcontinent ISO (MISO) cost guides",
  "Federal Register · FERC Order No. 1920",
];

const QUOTES = [
  { q: "Jasper – Okatie 230 kV #2: Construct", src: "Dominion Energy South Carolina · SCRTP 2026–2030", page: "p. 12", color: C.a },
  { q: "SAV: GOSHEN (SAV) - MCINTOSH 115KV LINE REBUILD", src: "Georgia Power · 2025 IRP Vol. 3 (PSC Docket 56002)", page: "p. 314", color: C.b },
];

const Flow: React.FC<{ x1: number; x2: number; y: number; t: number; f: number }> = ({ x1, x2, y, t, f }) => (
  <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
    <line x1={x1} y1={y} x2={x1 + (x2 - x1) * t} y2={y} stroke={C.fg4} strokeWidth={2} strokeDasharray="4 8" />
    {t >= 1 &&
      [0, 1, 2].map((k) => {
        const p = ((f / 40 + k / 3) % 1 + 1) % 1;
        return <circle key={k} cx={x1 + (x2 - x1) * p} cy={y} r={4} fill={C.amber} opacity={Math.sin(p * Math.PI)} />;
      })}
    {t > 0.95 && <path d={`M${x2 - 12},${y - 9} L${x2},${y} L${x2 - 12},${y + 9}`} fill="none" stroke={C.fg3} strokeWidth={2} />}
  </svg>
);

export const Pipeline: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = at("s06");
  const b = ph("s06", 0);
  const c = ph("s06", 1);
  const colY = 520;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 92, width: "100%", display: "flex", justifyContent: "center" }}>
        <Eyebrow delay={a - 6} size={22}>
          How it works
        </Eyebrow>
      </div>

      {/* 1 · sources */}
      <div style={{ position: "absolute", left: 90, top: 190, width: 520 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <BigNumber to={103} delay={a} dur={45} style={{ fontSize: 120, color: C.fg1, fontWeight: 500 }} />
          <span style={{ fontFamily: F.sans, fontSize: 34, color: C.fg2, opacity: prog(f, a + 10, 16) }}>public documents</span>
        </div>
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          {SOURCES.map((s, i) => {
            const t = pop(f, fps, a + 8 + i * 5, 16);
            return (
              <div
                key={s}
                style={{
                  fontFamily: F.mono,
                  fontSize: 19,
                  color: C.fg2,
                  padding: "11px 16px",
                  borderRadius: 10,
                  background: "rgba(48,54,62,0.7)",
                  border: `1px solid ${C.line}`,
                  opacity: Math.min(1, t * 1.3),
                  transform: `translateX(${(1 - t) * -60}px)`,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ width: 16, height: 20, borderRadius: 3, border: `1.5px solid ${C.fg3}`, flexShrink: 0 }} />
                {s}
              </div>
            );
          })}
        </div>
      </div>
      <Flow x1={640} x2={720} y={colY} t={prog(f, b - 8, 16, inOut)} f={f} />

      {/* 2 · one map */}
      <div style={{ position: "absolute", left: 745, top: 230, width: 480, opacity: smooth(f, fps, b - 4) }}>
        <Panel style={{ width: 480, height: 480, position: "relative", overflow: "hidden" }}>
          <GeoMap
            w={480}
            h={480}
            cam={{ lon: -82.1, lat: 32.75, zoom: 70 }}
            outline={prog(f, b - 4, 30, inOut)}
            border={prog(f, b + 6, 30)}
            projectT={(i, p) => prog(f, b + (p.u === "desc" ? 10 : 22) + (i % 40), 18)}
            frame={f}
          />
        </Panel>
        <div style={{ marginTop: 22, textAlign: "center", fontFamily: F.sans, fontSize: 32, color: C.fg1, whiteSpace: "nowrap", opacity: prog(f, b + 20, 16) }}>
          <span style={{ color: C.a }}>DESC</span> + <span style={{ color: C.b }}>Georgia Power</span>, one map
        </div>
      </div>
      <Flow x1={1250} x2={1330} y={colY} t={prog(f, c - 8, 16, inOut)} f={f} />

      {/* 3 · every fact cited */}
      <div style={{ position: "absolute", left: 1355, top: 200, width: 480 }}>
        {QUOTES.map((q, i) => {
          const t = smooth(f, fps, c + i * 12);
          return (
            <div key={q.q} style={{ opacity: t, transform: `translateY(${(1 - t) * 40}px)`, marginBottom: 20 }}>
              <Panel style={{ padding: "22px 24px", borderLeft: `4px solid ${q.color}` }}>
                <div style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 32, color: C.fg1, lineHeight: 1.25 }}>“{q.q}”</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14, fontFamily: F.mono, fontSize: 16, color: C.fg3 }}>
                  <span>{q.src}</span>
                  <span style={{ color: C.amber, flexShrink: 0, opacity: prog(f, c + 28 + i * 12, 12), border: `1px solid ${C.amber}66`, borderRadius: 6, padding: "1px 7px" }}>{q.page}</span>
                </div>
              </Panel>
            </div>
          );
        })}
        <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 14 }}>
          <BigNumber to={1786} delay={c + 30} dur={50} style={{ fontSize: 76, color: C.amber, fontWeight: 500 }} />
          <span style={{ fontFamily: F.sans, fontSize: 28, color: C.fg2, opacity: prog(f, c + 40, 16) }}>verbatim excerpts</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 18, color: C.ok, marginTop: 8, opacity: prog(f, c + 58, 16), display: "flex", gap: 10, alignItems: "center" }}>
          ✓ each one re-found in its source, by script
        </div>
      </div>
    </AbsoluteFill>
  );
};
