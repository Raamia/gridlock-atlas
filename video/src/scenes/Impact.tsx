import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { Chip, Eyebrow, Panel, Words } from "../components/ui";
import { inOut, outExpo, prog, smooth } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

export const Impact: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = at("s16");
  const cites = ph("s16", 0);
  const wi = ph("s16", 2);
  const s17 = at("s17");
  const est = ph("s17", 0);
  const introOut = prog(f, wi - 16, 20, inOut);
  const wisc = smooth(f, fps, wi + 2);
  const big = prog(f, est - 4, 40, outExpo);
  return (
    <AbsoluteFill>
      {/* impact is split into cited channels, never added together */}
      <AbsoluteFill style={{ opacity: 1 - introOut, justifyContent: "center", paddingLeft: 160 }}>
        <Words text="Rough impact, every number cited." delay={a - 2} style={{ fontFamily: F.sans, fontSize: 76, fontWeight: 600, color: C.fg1, letterSpacing: "-0.02em" }} />
        <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
          <Chip color={C.ok} delay={cites - 12}>
            stated
          </Chip>
          <Chip color={C.amber} delay={cites - 6}>
            conditional
          </Chip>
          <Chip color={C.fg2} delay={cites}>
            context
          </Chip>
          <span style={{ fontFamily: F.mono, fontSize: 22, color: C.fg3, alignSelf: "center", marginLeft: 12, opacity: prog(f, cites + 10, 14) }}>
            formula · unit cost · source page · dollar year — never summed
          </span>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: wisc }}>
        <AppFrame
          clip="e-midwest"
          label="Live app · Upper Midwest"
          width={1100}
          x={-340}
          y={10}
          delay={wi + 2}
          playbackRate={0.8}
          trimBefore={10}
          shots={[
            { f: wi, z: 1.0, x: 0.5, y: 0.5 },
            { f: est - 20, z: 1.9, x: 0.84, y: 0.4 },
          ]}
        />
        <div style={{ position: "absolute", left: 1260, top: 150, width: 560 }}>
          <Eyebrow delay={wi}>Known coordination · Wisconsin</Eyebrow>
          <div style={{ marginTop: 18, fontFamily: F.sans, fontSize: 28, color: C.fg1, lineHeight: 1.45, opacity: prog(f, wi + 6, 16) }}>
            <span style={{ color: C.a }}>●</span> Dairyland · Alma–Blair 345 kV
            <br />
            <span style={{ color: C.b }}>●</span> Xcel · Western Wisconsin Transmission
          </div>
          <div style={{ marginTop: 24, opacity: smooth(f, fps, wi + 30) }}>
            <Panel style={{ padding: "22px 24px", borderLeft: `4px solid ${C.ok}` }}>
              <div style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 30, color: C.fg1, lineHeight: 1.3 }}>
                “…terminating at the new Tremval switching station approved in docket 5-CE-158.”
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: F.mono, fontSize: 16, color: C.fg3 }}>
                <span>Public Service Commission of Wisconsin · 1515-CE-103</span>
                <span style={{ color: C.amber, border: `1px solid ${C.amber}66`, borderRadius: 6, padding: "1px 7px" }}>p. 14</span>
              </div>
            </Panel>
          </div>
          <div style={{ marginTop: 44, opacity: prog(f, s17 - 4, 14) }}>
            <div style={{ fontFamily: F.sans, fontSize: 30, color: C.fg2 }}>One 345 kV terminal instead of two</div>
            <div style={{ fontFamily: F.mono, fontSize: 72, color: C.amber, lineHeight: 1.1, marginTop: 6, whiteSpace: "nowrap", textShadow: `0 0 40px ${C.amber}44`, opacity: prog(f, est - 4, 8) }}>
              ${(9.0 * big).toFixed(1)}M–${(12.4 * big).toFixed(1)}M
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
              <Chip color={C.ok} delay={est + 10} style={{ fontSize: 18, padding: "6px 14px" }}>
                stated
              </Chip>
              <span style={{ fontFamily: F.mono, fontSize: 17, color: C.fg3, opacity: prog(f, est + 16, 12) }}>MISO cost guide · MTEP24 $ · 1.5–2.2 acres</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
