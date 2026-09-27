import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background, Grain } from "./components/Background";
import { Captions } from "./components/Captions";
import { CLAMP, inOut } from "./lib/anim";
import { OVER, TL } from "./lib/timeline";
import { SCENES } from "./scenes";

/** Cross-dissolve wrapper: each scene fades/sharpens in, and lingers OVER frames under the next one while it fades out. */
const SceneWrap: React.FC<{ dur: number; children: React.ReactNode; cut?: boolean; last?: boolean; cutAfter?: boolean }> = ({ dur, children, cut, last, cutAfter }) => {
  const f = useCurrentFrame();
  const inT = cut ? 1 : interpolate(f, [0, OVER], [0, 1], { ...CLAMP, easing: inOut });
  const outT = last ? 1 : cutAfter ? (f < dur ? 1 : 0) : interpolate(f, [dur - 2, dur + OVER], [1, 0], { ...CLAMP, easing: inOut });
  const o = Math.min(inT, outT);
  const blur = (1 - inT) * 12 + (1 - outT) * 8;
  const scale = 1 + (1 - inT) * 0.03 - (1 - outT) * 0.02;
  return (
    <AbsoluteFill style={{ opacity: o, filter: blur > 0.2 ? `blur(${blur}px)` : undefined, transform: `scale(${scale})` }}>{children}</AbsoluteFill>
  );
};

/** Scenes that open on a hard cut (on a music hit) instead of a dissolve. */
const CUTS = new Set(["title"]);

export const Demo: React.FC = () => {
  const f = useCurrentFrame();
  const fadeOut = interpolate(f, [TL.total - 45, TL.total - 2], [1, 0], CLAMP);
  const fadeIn = interpolate(f, [0, 20], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
        <Background />
        {TL.scenes.map((s, i) => {
          const Scene = SCENES[s.name];
          if (!Scene) return null;
          const last = i === TL.scenes.length - 1;
          const dur = s.to - s.from;
          return (
            <Sequence key={s.name} from={s.from} durationInFrames={dur + (last ? 0 : OVER)} name={s.name}>
              <SceneWrap dur={dur} cut={CUTS.has(s.name)} cutAfter={CUTS.has(TL.scenes[i + 1]?.name ?? "")} last={last}>
                <Scene />
              </SceneWrap>
            </Sequence>
          );
        })}
        <Captions />
        <Grain />
      </AbsoluteFill>
      {TL.cues.map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={c.frames + 10} name={`vo ${c.id}`}>
          <Audio src={staticFile(`vo/${c.id}.wav`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music.wav")} />
    </AbsoluteFill>
  );
};
