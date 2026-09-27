import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, outExpo, pop, prog } from "../lib/anim";
import { C, F } from "../theme";

/** Mono uppercase label, like the app's section eyebrows. */
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; delay?: number; size?: number; dot?: string; style?: React.CSSProperties }> = ({
  children,
  color = C.fg3,
  delay = 0,
  size = 20,
  dot,
  style,
}) => {
  const f = useCurrentFrame();
  const t = prog(f, delay, 18);
  return (
    <div
      style={{
        fontFamily: F.mono,
        fontSize: size,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
        opacity: t,
        transform: `translateY(${(1 - t) * 12}px)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...style,
      }}
    >
      {dot && <span style={{ width: 10, height: 10, borderRadius: 5, background: dot, boxShadow: `0 0 14px ${dot}` }} />}
      {children}
    </div>
  );
};

/** Words rise out of a blur one after another. */
export const Words: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
  highlight?: Record<string, React.CSSProperties>;
}> = ({ text, delay = 0, stagger = 3, style, highlight = {} }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.28em", ...style }}>
      {words.map((w, i) => {
        const t = prog(f, delay + i * stagger, 22, outExpo);
        const clean = w.replace(/[.,:;]$/, "");
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: t,
              transform: `translateY(${(1 - t) * 0.45}em)`,
              filter: `blur(${(1 - t) * 10}px)`,
              ...(highlight[clean] ?? {}),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** A rounded glass panel. */
export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; accent?: string }> = ({ children, style, accent }) => (
  <div
    style={{
      background: "linear-gradient(180deg, rgba(48,54,62,0.92), rgba(33,38,45,0.94))",
      border: `1px solid ${C.line}`,
      borderRadius: 22,
      boxShadow: `0 30px 80px rgba(0,0,0,0.45)${accent ? `, 0 0 0 1px ${accent}33, 0 0 60px ${accent}22` : ""}`,
      ...style,
    }}
  >
    {children}
  </div>
);

/** A big number that counts up and settles with a spring. */
export const BigNumber: React.FC<{ to: number; delay?: number; dur?: number; decimals?: number; prefix?: string; suffix?: string; style?: React.CSSProperties }> = ({
  to,
  delay = 0,
  dur = 40,
  decimals = 0,
  prefix = "",
  suffix = "",
  style,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = prog(f, delay, dur, outExpo);
  const s = pop(f, fps, delay, 12);
  const v = (to * t).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span style={{ fontFamily: F.mono, fontVariantNumeric: "tabular-nums", display: "inline-block", opacity: Math.min(1, s * 1.5), transform: `scale(${interpolate(s, [0, 1], [0.85, 1], CLAMP)})`, ...style }}>
      {prefix}
      {v}
      {suffix}
    </span>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; color: string; delay?: number; style?: React.CSSProperties; solid?: boolean }> = ({ children, color, delay = 0, style, solid }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(f, fps, delay, 13);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 999,
        fontFamily: F.mono,
        fontSize: 22,
        letterSpacing: "0.04em",
        color: solid ? C.bg0 : color,
        background: solid ? color : `linear-gradient(${color}24, ${color}24), rgba(13,17,21,0.88)`,
        border: `1.5px solid ${color}88`,
        opacity: Math.min(1, s * 1.4),
        transform: `scale(${0.7 + 0.3 * s})`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
};
