import { interpolate } from "remotion";
import { CLAMP } from "../lib/anim";
import { C } from "../theme";

/** The app icon (app/icon.svg), drawn on: two plans converge on one amber point. t: 0→1. */
export const LogoMark: React.FC<{ size: number; t: number; pulse?: number }> = ({ size, t, pulse = 0 }) => {
  const draw = (a: number, b: number) => interpolate(t, [a, b], [0, 1], CLAMP);
  const len = 16;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible" }}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#31363f" stroke="#eeeeee" strokeOpacity={0.16} opacity={draw(0, 0.3)} />
      <circle cx="20" cy="16" r={7.5 + pulse * 3} fill="none" stroke={C.amber} strokeOpacity={0.34 * draw(0.65, 0.95) * (1 - pulse * 0.6)} strokeWidth="1.25" />
      <path d="M7 7.5C10 12.6 12.6 15.1 17 15.6" fill="none" stroke={C.a} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw(0.15, 0.6))} />
      <path d="M7 24.5C10 19.4 12.6 16.9 17 16.4" fill="none" stroke={C.b} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw(0.15, 0.6))} />
      <circle cx="20" cy="16" r={3.5 * draw(0.55, 0.8)} fill={C.amber} style={{ filter: `drop-shadow(0 0 ${2 + pulse * 3}px ${C.amber})` }} />
    </svg>
  );
};
