import { AbsoluteFill } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { Chip } from "../components/ui";
import { at, ph } from "../lib/timeline";
import { C } from "../theme";

export const Brief: React.FC = () => {
  const a = at("s15");
  const q = ph("s15", 0);
  const cite = ph("s15", 1);
  return (
    <AbsoluteFill>
      <AppFrame
        clip="d-brief"
        label="Live app · cited review brief"
        width={1450}
        y={-4}
        trimBefore={24}
        shots={[
          { f: a + 20, z: 1.0, x: 0.5, y: 0.5 },
          { f: q - 6, z: 1.55, x: 0.5, y: 0.42 },
          { f: cite + 10, z: 1.6, x: 0.5, y: 0.46 },
        ]}
      />
      <div style={{ position: "absolute", right: 210, top: 44, display: "flex", gap: 12 }}>
        <Chip color={C.warn} delay={q}>
          the question to ask
        </Chip>
        <Chip color={C.amber} delay={cite + 6}>
          [1, 2, 3] numbered sources
        </Chip>
      </div>
    </AbsoluteFill>
  );
};
