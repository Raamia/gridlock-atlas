import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { LogoMark } from "../components/Logo";
import { CLAMP, inOut, outExpo, prog, rand, smooth } from "../lib/anim";
import { C, F } from "../theme";

/** Streaks of both utilities' colours converge on one amber point; the wordmark lands on the hit. */
export const Title: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 960;
  const cy = 520;
  const hit = 14;
  const flash = interpolate(f, [hit, hit + 3, hit + 26], [0, 0.55, 0], CLAMP);
  const ring = prog(f, hit, 50, outExpo);
  const logo = prog(f, hit - 4, 46, inOut);
  const word = smooth(f, fps, hit + 10);
  const tag = prog(f, hit + 52, 24);
  const shine = interpolate(f, [hit + 40, hit + 90], [-40, 140], CLAMP);
  const drift = interpolate(f, [0, 180], [1.05, 1], CLAMP);
  const streaks = Array.from({ length: 26 }, (_, i) => {
    const left = i % 2 === 0;
    const y0 = 60 + rand(i, 4) * 960;
    const x0 = left ? -80 : 2000;
    const c1x = left ? 380 + rand(i, 9) * 200 : 1540 - rand(i, 9) * 200;
    const d = `M${x0},${y0} C${c1x},${y0} ${left ? 700 : 1220},${cy} ${cx},${cy}`;
    const t = prog(f, -6 + rand(i, 2) * 10, 22, inOut);
    const fade = 1 - prog(f, hit + 4, 26);
    return { d, t, fade, col: left ? C.a : C.b, w: 1 + rand(i, 5) * 2.2 };
  });
  return (
    <AbsoluteFill style={{ transform: `scale(${drift})` }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="tblur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#tblur)">
          {streaks.map((s, i) => (
            <path key={i} d={s.d} fill="none" stroke={s.col} strokeWidth={s.w * 4} opacity={0.25 * s.fade} pathLength={1} strokeDasharray="0.25 1" strokeDashoffset={1 - s.t * 1.25} />
          ))}
        </g>
        {streaks.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={s.col} strokeWidth={s.w} opacity={s.fade} pathLength={1} strokeDasharray="0.25 1" strokeDashoffset={1 - s.t * 1.25} strokeLinecap="round" />
        ))}
        <circle cx={cx} cy={cy} r={40 + ring * 900} fill="none" stroke={C.amber} strokeWidth={3 - ring * 2} opacity={(1 - ring) * 0.8} />
        <circle cx={cx} cy={cy} r={20 + ring * 520} fill="none" stroke={C.amber} strokeWidth={1.5} opacity={(1 - ring) * 0.5} />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(40% 40% at 50% 48%, rgba(212,184,117,${flash}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `rgba(255,248,230,${flash * 0.35})` }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <div style={{ transform: `translateY(${-20}px) scale(${0.7 + 0.3 * logo})`, opacity: logo, filter: `drop-shadow(0 0 40px rgba(212,184,117,${0.35 * logo}))` }}>
          <LogoMark size={150} t={logo} pulse={interpolate(f, [hit + 30, hit + 70], [0, 1], CLAMP) * (1 - interpolate(f, [hit + 70, hit + 90], [0, 1], CLAMP))} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 26,
            marginTop: 34,
            opacity: word,
            transform: `translateY(${(1 - word) * 40}px)`,
            letterSpacing: `${(1 - word) * 0.08 - 0.03}em`,
          }}
        >
          <span
            style={{
              fontFamily: F.sans,
              fontWeight: 650,
              fontSize: 168,
              lineHeight: 1,
              backgroundImage: `linear-gradient(100deg, ${C.fg1} ${shine - 18}%, #fffdf5 ${shine}%, ${C.fg1} ${shine + 18}%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            GridLock
          </span>
          <span style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 190, lineHeight: 1, color: C.amber }}>Atlas</span>
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: F.mono,
            fontSize: 30,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: C.fg2,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 14}px)`,
          }}
        >
          Two public plans · One map · Every claim cited
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
