import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { Chip } from "../components/ui";
import { CLAMP, inOut } from "../lib/anim";
import { ph } from "../lib/timeline";
import { C } from "../theme";

/**
 * The app's own 3D close-up. First "Run simulation" puts the pair on one ground (closest points 4.3 mi); then the
 * close-up's Time view raises each project to its in-service date, with the schedule overlap as a glass band.
 */
export const Closeup: React.FC = () => {
  const f = useCurrentFrame();
  const ground = ph("s13", 0);
  const toTime = ground + 26;
  const x = interpolate(f, [toTime - 8, toTime + 10], [0, 1], { ...CLAMP, easing: inOut });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - x }}>
        <AppFrame
          clip="c-closeup"
          label="Live app · 3D close-up · run simulation"
          width={1450}
          y={-4}
          trimBefore={200}
          playbackRate={1.25}
          shots={[{ f: 0, z: 1.32, x: 0.37, y: 0.5 }]}
        />
      </AbsoluteFill>
      {/* frames 36–135 of the recording: the close-up opened in its Time view, before "Run simulation" */}
      <Sequence from={toTime - 8} layout="none">
        <AbsoluteFill style={{ opacity: x }}>
          <AppFrame
            clip="c-closeup"
            label="Live app · 3D close-up · time view"
            width={1450}
            y={-4}
            delay={-60}
            trimBefore={36}
            playbackRate={0.6}
            shots={[{ f: 0, z: 1.5, x: 0.35, y: 0.42 }]}
          />
        </AbsoluteFill>
      </Sequence>
      <div style={{ position: "absolute", right: 210, top: 44, display: "flex", gap: 12 }}>
        <Chip color={C.fg2} delay={ground - 20}>
          on the ground
        </Chip>
        <Chip color={C.amber} delay={toTime}>
          and in time
        </Chip>
      </div>
    </AbsoluteFill>
  );
};
