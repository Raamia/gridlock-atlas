import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { C } from "../theme";

/** Charcoal field with a drifting survey grid, two utility-coloured glows and film grain. */
export const Background: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const f = useCurrentFrame();
  const drift = (f * 0.25) % 64;
  const breathe = 0.5 + 0.5 * Math.sin(f / 70);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 45%, ${C.canvas} 0%, ${C.bg1} 55%, ${C.bg0} 100%)` }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, rgba(238,238,238,0.075) 1.2px, transparent 1.4px)`,
          backgroundSize: "64px 64px",
          backgroundPosition: `${drift}px ${drift * 0.5}px`,
          maskImage: "radial-gradient(75% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: glow,
          background: `radial-gradient(40% 50% at ${12 + breathe * 4}% 30%, rgba(73,168,255,0.10), transparent 70%), radial-gradient(40% 50% at ${88 - breathe * 4}% 72%, rgba(255,82,99,0.08), transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Grain: React.FC = () => {
  const x = 0;
  const y = 0;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile("img/grain.png")})`,
          backgroundPosition: `${x}px ${y}px`,
          opacity: 0.028,
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(90% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

export const Icon: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile("img/icon.svg")} style={{ width: size, height: size }} />;
