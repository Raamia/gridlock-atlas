import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CLAMP } from "../lib/anim";
import { interpolate } from "remotion";
import timeline from "../data/timeline.json";
import { C, F } from "../theme";

/** Lines the scene itself sets in large type get no caption. */
const ON_SCREEN = new Set(["s01", "s02", "s05", "s20", "s21"]);

/** Sentence captions under the narration. */
export const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const cue = timeline.cues.find((c) => f >= c.from - 4 && f < c.from + c.frames + 8);
  if (!cue || ON_SCREEN.has(cue.id)) return null;
  const o = Math.min(interpolate(f, [cue.from - 4, cue.from + 4], [0, 1], CLAMP), interpolate(f, [cue.from + cue.frames, cue.from + cue.frames + 8], [1, 0], CLAMP));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 38, pointerEvents: "none" }}>
      <div
        style={{
          maxWidth: 1500,
          textAlign: "center",
          fontFamily: F.sans,
          fontSize: 30,
          lineHeight: 1.35,
          fontWeight: 500,
          color: C.fg1,
          opacity: o,
          padding: "10px 26px",
          borderRadius: 14,
          background: "rgba(13,17,21,0.62)",
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          letterSpacing: "0.005em",
        }}
      >
        {cue.caption}
      </div>
    </AbsoluteFill>
  );
};
