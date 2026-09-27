import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Eyebrow, Panel } from "../components/ui";
import { inOut, pop, prog, smooth } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

// Sperry's starter file overlap table (reproduced exactly in the Method drawer)
const ROWS = [
  ["OVL_1", "DESC_2 × GPC_1", "4.09", "3,074"],
  ["OVL_2", "DESC_3 × GPC_2", "5.65", "152"],
  ["OVL_3", "DESC_3 × GPC_3", "7.55", "517"],
  ["OVL_4", "DESC_1 × GPC_1", "8.01", "3,074"],
  ["OVL_5", "DESC_5 × GPC_2", "14.34", "365"],
  ["OVL_6", "DESC_5 × GPC_3", "14.81", "730"],
];

export const Ovl3: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = at("s12");
  const today = ph("s12", 0);
  const hi = prog(f, a + 30, 16, inOut);
  const shift = prog(f, today - 10, 26, inOut);
  const badge = pop(f, fps, today + 4, 12);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 200 - shift * 90, top: 200, width: 820 }}>
        <Eyebrow delay={a - 4}>Sperry's worked example · starter file</Eyebrow>
        <Panel style={{ marginTop: 22, padding: "14px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px 130px", padding: "10px 30px", fontFamily: F.mono, fontSize: 17, color: C.fg3, letterSpacing: "0.08em" }}>
            <span>ROW</span>
            <span>PAIR</span>
            <span style={{ textAlign: "right" }}>MILES</span>
            <span style={{ textAlign: "right" }}>DAYS</span>
          </div>
          {ROWS.map((r, i) => {
            const t = smooth(f, fps, a - 6 + i * 3);
            const isHi = r[0] === "OVL_3";
            return (
              <div
                key={r[0]}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 120px 130px",
                  padding: "14px 30px",
                  fontFamily: F.mono,
                  fontSize: 26,
                  color: isHi ? C.fg1 : C.fg2,
                  opacity: t * (isHi ? 1 : 1 - hi * 0.55),
                  transform: `translateX(${(1 - t) * -30}px) scale(${isHi ? 1 + hi * 0.04 : 1})`,
                  background: isHi ? `rgba(212,184,117,${0.14 * hi})` : undefined,
                  borderTop: `1px solid ${C.line}`,
                  boxShadow: isHi ? `inset 4px 0 0 rgba(212,184,117,${hi})` : undefined,
                }}
              >
                <span style={{ color: isHi ? C.amber : undefined }}>{r[0]}</span>
                <span>{r[1]}</span>
                <span style={{ textAlign: "right" }}>{r[2]}</span>
                <span style={{ textAlign: "right" }}>{r[3]}</span>
              </div>
            );
          })}
        </Panel>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <path d="M1000,512 C1110,512 1130,470 1210,470" fill="none" stroke={C.amber} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(f, today - 4, 20, inOut)} />
      </svg>
      <div style={{ position: "absolute", left: 1220, top: 300, width: 560, opacity: Math.min(1, badge * 1.3), transform: `scale(${0.7 + 0.3 * badge})`, transformOrigin: "left center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 22, color: C.fg3, letterSpacing: "0.12em", textTransform: "uppercase" }}>On today's plans</div>
        <div style={{ fontFamily: F.mono, fontSize: 230, color: C.amber, lineHeight: 1, textShadow: `0 0 60px ${C.amber}66` }}>#1</div>
        <div style={{ fontFamily: F.sans, fontSize: 30, color: C.fg1, lineHeight: 1.35 }}>
          Jasper – Okatie 230 kV #2
          <br />× Goshen – McIntosh 115 kV rebuild
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 18, color: C.fg3, marginTop: 12 }}>Needs review · 4.25 mi · schedules overlap 18 mo</div>
      </div>
    </AbsoluteFill>
  );
};
