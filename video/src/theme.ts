import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Same palette and type as the app (app/globals.css, components/map/palette.ts).
export const C = {
  bg0: "#0d1115",
  bg1: "#151a20",
  canvas: "#1f252d",
  panel: "#272c33",
  raised: "#30363e",
  line: "rgba(238,238,238,0.12)",
  fg1: "#eeeeee",
  fg2: "#c7cccf",
  fg3: "#9ca6aa",
  fg4: "#6f7a80",
  a: "#49a8ff",
  b: "#ff5263",
  amber: "#d4b875",
  ok: "#8fc5a8",
  warn: "#e19b87",
} as const;

// Bundled (SIL OFL) so rendering never depends on a font CDN.
loadFont({ family: "Geist", url: staticFile("fonts/Geist-Variable.woff2"), weight: "100 900" });
loadFont({ family: "Geist Mono", url: staticFile("fonts/GeistMono-Variable.woff2"), weight: "100 900" });
loadFont({ family: "Instrument Serif", url: staticFile("fonts/InstrumentSerif-Italic.woff2"), style: "italic", weight: "400" });

export const F = { sans: "Geist, sans-serif", mono: "'Geist Mono', monospace", serif: "'Instrument Serif', serif" } as const;
