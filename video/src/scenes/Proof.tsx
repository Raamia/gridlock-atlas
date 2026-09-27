import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { AppFrame } from "../components/AppFrame";
import { BigNumber, Eyebrow, Panel } from "../components/ui";
import { inOut, pop, prog, rand, smooth } from "../lib/anim";
import { at, ph } from "../lib/timeline";
import { C, F } from "../theme";

// data/eval/extraction-eval.json: 283 in-scope plan pages (145 DESC, 138 Georgia Power); 2,578 of 2,579 quotes verbatim
const PAGES = 283;
const COLS = 24;
const PW = 30;
const PH = 40;
const GAP = 8;
const GX = 120;
const GY = 250;
const ODD = 171; // the one quote that was not verbatim (illustrative position)

export const Proof: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = at("s18");
  const exact = ph("s18", 1);
  const s19 = at("s19");
  const pagesAt = ph("s19", 1);
  const allBut = ph("s19", 3);
  const appOut = prog(f, s19 - 18, 22, inOut);
  const pagesIn = smooth(f, fps, s19 - 4);
  const scanX = GX - 60 + ((f - (s19 + 10)) / 170) * (COLS * (PW + GAP) + 120);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - appOut }}>
        <AppFrame
          clip="f-method"
          label="Live app · Method & audit"
          width={1450}
          y={-4}
          trimBefore={10}
          shots={[
            { f: 30, z: 1.0, x: 0.5, y: 0.5 },
            { f: 80, z: 1.45, x: 0.55, y: 0.4 },
            { f: exact, z: 1.5, x: 0.6, y: 0.62 },
          ]}
        />
        <div style={{ position: "absolute", right: 150, top: 700, display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-end" }}>
          {[
            ["6 / 6", "overlap rows", exact - 20],
            ["10 / 10", "project rows", exact - 8],
          ].map(([n, l, d]) => {
            const s = pop(f, fps, d as number, 12);
            return (
              <Panel key={l as string} style={{ padding: "16px 26px", display: "flex", alignItems: "baseline", gap: 16, opacity: Math.min(1, s * 1.4), transform: `scale(${0.7 + 0.3 * s})` }} accent={C.ok}>
                <span style={{ fontFamily: F.mono, fontSize: 58, color: C.ok }}>{n}</span>
                <span style={{ fontFamily: F.sans, fontSize: 26, color: C.fg1 }}>{l} ✓</span>
              </Panel>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* GPT-5.5 re-reads every plan page */}
      <AbsoluteFill style={{ opacity: pagesIn }}>
        <div style={{ position: "absolute", left: GX, top: 160 }}>
          <Eyebrow delay={s19}>Model cross-check · 283 plan pages</Eyebrow>
        </div>
        {Array.from({ length: PAGES }).map((_, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const x = GX + col * (PW + GAP);
          const y = GY + row * (PH + GAP);
          const appear = prog(f, s19 - 4 + (col + row) * 0.6, 10);
          const done = scanX > x + PW / 2;
          const odd = i === ODD;
          const col2 = done ? (odd ? C.warn : C.ok) : C.fg4;
          const desc = i < 145;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: PW,
                height: PH,
                borderRadius: 4,
                background: done ? `${col2}${odd ? "44" : "26"}` : "rgba(238,238,238,0.07)",
                border: `1.5px solid ${done ? col2 : "rgba(238,238,238,0.14)"}`,
                borderTop: `3px solid ${desc ? C.a : C.b}`,
                opacity: appear,
                transform: `scale(${odd && done ? 1.25 : 1})`,
                boxShadow: odd && done ? `0 0 20px ${C.warn}` : undefined,
              }}
            >
              {[0, 1, 2].map((k) => (
                <div key={k} style={{ height: 2, margin: `${k ? 4 : 8}px 5px 0`, width: 10 + rand(i, k) * 12, background: "rgba(238,238,238,0.25)" }} />
              ))}
            </div>
          );
        })}
        {f > s19 + 10 && scanX < GX + COLS * (PW + GAP) + 40 && (
          <div
            style={{
              position: "absolute",
              left: scanX,
              top: GY - 30,
              width: 4,
              height: 12 * (PH + GAP) + 50,
              background: C.amber,
              boxShadow: `0 0 30px 8px ${C.amber}88`,
              opacity: 0.9,
            }}
          />
        )}
        <div style={{ position: "absolute", left: 1110, top: 250, width: 720 }}>
          <div style={{ fontFamily: F.mono, fontSize: 22, color: C.fg3, letterSpacing: "0.08em", opacity: prog(f, s19 + 6, 14) }}>GPT-5.5 · FROZEN PROMPT · STRUCTURED OUTPUT</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 20 }}>
            <BigNumber to={283} delay={pagesAt - 50} dur={50} style={{ fontSize: 96, color: C.fg1, fontWeight: 500 }} />
            <span style={{ fontFamily: F.sans, fontSize: 32, color: C.fg2, opacity: prog(f, pagesAt - 40, 14) }}>plan pages re-read</span>
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 20, color: C.fg3, marginTop: 6, opacity: prog(f, pagesAt - 30, 14) }}>
            <span style={{ color: C.a }}>145 DESC</span> · <span style={{ color: C.b }}>138 Georgia Power</span>
          </div>
          <div style={{ marginTop: 44, opacity: prog(f, allBut - 40, 14) }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <BigNumber to={2578} delay={allBut - 40} dur={60} style={{ fontSize: 110, color: C.ok, fontWeight: 500 }} />
              <span style={{ fontFamily: F.mono, fontSize: 50, color: C.fg3 }}>/ 2,579</span>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 32, color: C.fg1, marginTop: 8 }}>quotes verbatim on the page</div>
          </div>
          <div style={{ marginTop: 30, fontFamily: F.mono, fontSize: 20, color: C.fg3, lineHeight: 1.6, opacity: prog(f, allBut + 20, 16) }}>
            a cross-check only: model output never enters the snapshot or the engine
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
