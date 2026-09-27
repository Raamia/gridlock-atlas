import type { ExpressionSpecification } from "mapbox-gl";

/**
 * Map paint colours. WebGL paint cannot read CSS variables, so these are literal mirrors of the SPEC §2 tokens in
 * app/globals.css (--canvas, --fg-*, --util-*, --overlap …). Change both together.
 */
export const C = {
  canvas: "#1f252d",
  solid: "#272c33",
  raised: "#30363e",
  fg1: "#eeeeee",
  fg2: "#c7cccf",
  fg3: "#9ca6aa",
  fg4: "#6f7a80",
  a: "#49a8ff",
  b: "#ff5263",
  other: "#929ca2",
  overlap: "#d4b875",
  ok: "#8fc5a8",
  warn: "#e19b87",
} as const;

/** Dot/route/halo colour by role: A and the region's first focal utility share --util-a, B and the second --util-b. */
export const roleColor: ExpressionSpecification = ["match", ["get", "role"], ["a", "u1"], C.a, ["b", "u2"], C.b, "hover", C.fg1, C.other];

/** CSS colour of a role, for the HTML callouts and cards. */
export function roleCss(role: "a" | "b" | "other"): string {
  return role === "a" ? "var(--util-a)" : role === "b" ? "var(--util-b)" : "var(--util-other)";
}
