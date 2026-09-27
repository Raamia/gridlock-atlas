import { Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import clipInfo from "../data/clips.json";
import { CLAMP, inOut, smooth } from "../lib/anim";
import { C, F } from "../theme";

export interface Shot {
  /** frame (scene-local) at which this framing is reached */
  f: number;
  /** zoom factor on the footage */
  z: number;
  /** focus point in the footage, 0..1 */
  x: number;
  y: number;
}

/**
 * Real app footage in a floating window. `shots` animate a virtual camera over the footage (zoom into the part the
 * narration talks about); the window itself tilts in from below.
 */
export const AppFrame: React.FC<{
  clip: string;
  trimBefore?: number;
  playbackRate?: number;
  width?: number;
  shots?: Shot[];
  label?: string;
  delay?: number;
  x?: number;
  y?: number;
}> = ({ clip, trimBefore = 0, playbackRate = 1, width = 1560, shots = [], label = "Live app · real footage", delay = 0, x = 0, y = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = smooth(f, fps, delay);
  const height = (width * 9) / 16;
  const total = (clipInfo as Record<string, number>)[clip] ?? 1e6;
  const lastLocal = Math.floor((total - 2 - trimBefore) / playbackRate);
  // camera over the footage
  let cam = { z: 1, x: 0.5, y: 0.5 };
  if (shots.length) {
    const pts = [{ f: 0, z: 1, x: 0.5, y: 0.5 }, ...shots];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (f >= a.f) {
        const span = Math.max(1, b.f - a.f);
        const t = interpolate(f, [a.f, a.f + Math.min(span, 36)], [0, 1], { ...CLAMP, easing: inOut });
        cam = { z: a.z + (b.z - a.z) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (f < b.f) break;
        cam = { z: b.z, x: b.x, y: b.y };
      }
    }
  }
  const tx = (0.5 - cam.x) * width * cam.z;
  const ty = (0.5 - cam.y) * height * cam.z;
  const maxX = ((cam.z - 1) * width) / 2;
  const maxY = ((cam.z - 1) * height) / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - width / 2 + x,
        top: 540 - height / 2 + y,
        width,
        height,
        perspective: 2400,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid rgba(238,238,238,0.16)`,
          boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4), 0 0 90px rgba(73,168,255,0.10)",
          transform: `translateY(${(1 - enter) * 160}px) rotateX(${(1 - enter) * 18}deg) scale(${0.92 + 0.08 * enter})`,
          opacity: interpolate(enter, [0, 0.4], [0, 1], CLAMP),
          background: C.canvas,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `translate(${Math.max(-maxX, Math.min(maxX, tx))}px, ${Math.max(-maxY, Math.min(maxY, ty))}px) scale(${cam.z})`,
          }}
        >
          {/* hold the last frame once the footage runs out */}
          <Freeze frame={lastLocal} active={f >= lastLocal}>
            <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} trimBefore={trimBefore} playbackRate={playbackRate} muted style={{ width: "100%", height: "100%" }} />
          </Freeze>
        </div>
      </div>
      {label && (
        <div
          style={{
            position: "absolute",
            left: 22,
            top: -52,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: F.mono,
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.fg2,
            opacity: interpolate(enter, [0.5, 1], [0, 1], CLAMP),
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 5, background: "#ff4d5e", boxShadow: "0 0 10px #ff4d5e" }} />
          {label}
        </div>
      )}
    </div>
  );
};
