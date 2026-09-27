import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { Chip } from "../components/ui";
import { prog } from "../lib/anim";
import { ph } from "../lib/timeline";
import { C, F } from "../theme";

export const Compare: React.FC = () => {
  const f = useCurrentFrame();
  const place = ph("s09", 1) - 16;
  const time = ph("s09", 2) - 8;
  const evidence = ph("s09", 2) + 14;
  return (
    <AbsoluteFill>
      <AppFrame
        clip="a-compare"
        width={1450}
        y={10}
        playbackRate={0.93}
        shots={[
          { f: 40, z: 1.0, x: 0.5, y: 0.5 },
          { f: 108, z: 1.55, x: 0.22, y: 0.45 },
          { f: 190, z: 1.08, x: 0.55, y: 0.52 },
        ]}
      />
      <div style={{ position: "absolute", right: 200, top: 40, display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ fontFamily: F.mono, fontSize: 20, color: C.fg3, letterSpacing: "0.12em", textTransform: "uppercase", opacity: prog(f, place - 8, 12) }}>Ranked by</span>
        <Chip color={C.amber} delay={place}>
          1 · place
        </Chip>
        <span style={{ color: C.fg4, fontSize: 26, opacity: prog(f, time, 10) }}>→</span>
        <Chip color={C.fg2} delay={time}>
          2 · timing
        </Chip>
        <span style={{ color: C.fg4, fontSize: 26, opacity: prog(f, evidence, 10) }}>→</span>
        <Chip color={C.ok} delay={evidence}>
          3 · evidence
        </Chip>
      </div>
    </AbsoluteFill>
  );
};
