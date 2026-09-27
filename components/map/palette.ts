import type { ExpressionSpecification } from "mapbox-gl";

/**
 * Map paint colours. WebGL paint cannot read CSS variables, so these are literal mirrors of the SPEC §2 tokens in
 * app/globals.css (--canvas, --fg-*, --util-*, --overlap …). Change both together.
 */
export const C = {
  canvas: "#05080e",
  solid: "#0b1019",
  raised: "#111824",
  fg1: "#f3f5f9",
  fg2: "#b4bccb",
  fg3: "#8a93a4",
  fg4: "#5a6272",
  a: "#4cc9f0",
  b: "#a78bfa",
  other: "#8b95a7",
  overlap: "#f5b83d",
  ok: "#5ccf97",
  warn: "#f08a6c",
} as const;

/** Dot/route/halo colour by role: A and the region's first focal utility share --util-a, B and the second --util-b. */
export const roleColor: ExpressionSpecification = ["match", ["get", "role"], ["a", "u1"], C.a, ["b", "u2"], C.b, "hover", C.fg1, C.other];

/** CSS colour of a role, for the HTML callouts and cards. */
export function roleCss(role: "a" | "b" | "other"): string {
  return role === "a" ? "var(--util-a)" : role === "b" ? "var(--util-b)" : "var(--util-other)";
}
