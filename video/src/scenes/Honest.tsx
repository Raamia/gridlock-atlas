import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { Words } from "../components/ui";
import { CLAMP, inOut, pop, prog } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

const Row: React.FC<{ left: string; delay: number; children: React.ReactNode }> = ({ left, delay, children }) => {
  const f = useCurrentFrame();
  const t = prog(f, delay, 18);
  const line = prog(f, delay + 8, 18, inOut);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
      <span style={{ fontFamily: F.sans, fontSize: 44, fontWeight: 500, color: C.fg1, whiteSpace: "nowrap" }}>{left}</span>
      <span style={{ height: 2, width: 90 * line, backgroundImage: `linear-gradient(90deg, ${C.fg4} 50%, transparent 50%)`, backgroundSize: "10px 2px" }} />
      {children}
    </div>
  );
};

export const Honest: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = at("s14");
  const r1 = ph("s14", 0);
  const r2 = ph("s14", 1);
  const never = ph("s14", 3);
  const strike = prog(f, never + 18, 16, inOut);
  const tag = (delay: number) => pop(f, fps, delay, 12);
  const swap = prog(f, r2 - 10, 20, inOut);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 150 }}>
        <Words text="It never overstates." delay={a - 2} style={{ fontFamily: F.sans, fontSize: 84, fontWeight: 600, color: C.fg1, letterSpacing: "-0.02em" }} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 360, display: "flex", flexDirection: "column", gap: 70 }}>
        <Row left="Field-work dates" delay={r1 - 4}>
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 34,
              color: C.amber,
              border: `2px solid ${C.amber}`,
              borderRadius: 999,
              padding: "8px 24px",
              opacity: Math.min(1, tag(r1 + 20) * 1.4),
              transform: `scale(${0.7 + 0.3 * tag(r1 + 20)})`,
              whiteSpace: "nowrap",
            }}
          >
            not published
          </span>
        </Row>
        <Row left="No coordination on record" delay={r2}>
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 34,
              color: C.fg1,
              border: `2px solid ${C.fg2}`,
              borderRadius: 999,
              padding: "8px 24px",
              opacity: Math.min(1, tag(r2 + 40) * 1.4),
              transform: `scale(${0.7 + 0.3 * tag(r2 + 40)})`,
              whiteSpace: "nowrap",
            }}
          >
            “unknown”
          </span>
        </Row>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginLeft: 0, opacity: prog(f, never - 4, 14) }}>
          <span style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 60, color: C.fg2 }}>never</span>
          <span style={{ position: "relative", fontFamily: F.mono, fontSize: 40, color: C.warn, opacity: interpolate(strike, [0, 1], [1, 0.75], CLAMP) }}>
            “uncoordinated”
            <span style={{ position: "absolute", left: -6, right: -6, top: "52%", height: 4, background: C.warn, transform: `scaleX(${strike})`, transformOrigin: "left" }} />
          </span>
        </div>
      </div>
      {/* the app saying it, verbatim */}
      <AbsoluteFill style={{ opacity: 1 - swap }}>
        <AppFrame clip="b-select" label="In the app" width={760} x={560} y={40} trimBefore={236} playbackRate={0.12} shots={[{ f: 0, z: 2.5, x: 0.86, y: 0.37 }]} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: swap }}>
        <AppFrame clip="b-select" label="In the app" width={760} x={560} y={40} trimBefore={108} playbackRate={0.1} delay={-30} shots={[{ f: 0, z: 2.7, x: 0.93, y: 0.44 }]} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
