import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { GeoMap } from "../components/GeoMap";
import { LogoMark } from "../components/Logo";
import { Words } from "../components/ui";
import { CLAMP, inOut, prog, smooth } from "../lib/anim";
import { lerpCam } from "../lib/geo";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s20 = at("s20");
  const plans = ph("s20", 0) - 34;
  const oneMap = ph("s20", 0);
  const cited = ph("s20", 1);
  const s21 = at("s21");
  const cam = lerpCam({ lon: -81.4, lat: 32.55, zoom: 520 }, { lon: -81.9, lat: 32.9, zoom: 300 }, prog(f, 0, 400, inOut));
  const logo = prog(f, s20 - 20, 40, inOut);
  const word = smooth(f, fps, s20 - 6);
  const endCard = prog(f, s21 + 110, 24);
  const glow = 0.5 + 0.5 * Math.sin(f / 10);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.55 }}>
        <GeoMap
          cam={cam}
          outline={1}
          border={prog(f, 0, 40)}
          projectT={(i) => prog(f, (i % 60) * 0.8, 20)}
          pairT={(i) => prog(f, 10 + i * 1.2, 30, inOut) * (0.75 + 0.25 * glow)}
          frame={f}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(50% 45% at 50% 46%, rgba(13,17,21,0.85), rgba(13,17,21,0.2) 80%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", transform: `translateY(${-40 - endCard * 40}px)` }}>
        <div style={{ opacity: logo, transform: `scale(${0.8 + 0.2 * logo})` }}>
          <LogoMark size={110} t={logo} pulse={glow * 0.4} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 26, opacity: word, transform: `translateY(${(1 - word) * 30}px)` }}>
          <span style={{ fontFamily: F.sans, fontWeight: 650, fontSize: 124, color: C.fg1, letterSpacing: "-0.03em" }}>GridLock</span>
          <span style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 140, color: C.amber }}>Atlas</span>
        </div>
        <div style={{ display: "flex", gap: 34, marginTop: 26 }}>
          <Words text="Public plans." delay={plans} style={{ fontFamily: F.sans, fontSize: 44, color: C.fg1, fontWeight: 500 }} />
          <Words text="One map." delay={oneMap - 4} style={{ fontFamily: F.sans, fontSize: 44, color: C.fg1, fontWeight: 500 }} />
          <Words text="Every claim cited." delay={cited - 4} style={{ fontFamily: F.sans, fontSize: 44, color: C.amber, fontWeight: 500 }} />
        </div>
        <Words
          text="So neighboring utilities can plan together, and build together."
          delay={s21 - 2}
          stagger={2}
          style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 50, color: C.fg2, marginTop: 44, justifyContent: "center" }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 40,
          fontFamily: F.mono,
          fontSize: 24,
          letterSpacing: "0.14em",
          color: C.fg3,
          textTransform: "uppercase",
          opacity: endCard,
          transform: `translateY(${interpolate(endCard, [0, 1], [20, 0], CLAMP)}px)`,
        }}
      >
        <span>ShellHacks 2026</span>
        <span style={{ color: C.fg4 }}>·</span>
        <span>Sperry Tech GridLock Challenge</span>
        <span style={{ color: C.fg4 }}>·</span>
        <span style={{ textTransform: "none", letterSpacing: "0.04em" }}>github.com/Raamia/shellhacks</span>
      </div>
    </AbsoluteFill>
  );
};
