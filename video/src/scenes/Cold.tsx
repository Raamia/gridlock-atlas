import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Doc } from "../components/Doc";
import { Words } from "../components/ui";
import { CLAMP, inOut, outExpo, prog, smooth } from "../lib/anim";
import { at } from "../lib/timeline";
import { C, F } from "../theme";

export const Cold: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = at("s01");
  const s2 = at("s02");
  const years = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
  const ruler = prog(f, 8, 60, inOut);
  const titleOut = prog(f, s2 - 14, 18, inOut);
  const docsIn = smooth(f, fps, s2 - 6);
  const split = prog(f, s2 + 40, 30, inOut);
  return (
    <AbsoluteFill>
      {/* planning horizon ruler */}
      <div style={{ position: "absolute", left: 160, right: 160, top: 760, opacity: 1 - titleOut * 0.85 }}>
        <div style={{ height: 1.5, background: `linear-gradient(90deg, transparent, ${C.fg4}, transparent)`, transform: `scaleX(${ruler})` }} />
        {years.map((y, i) => {
          const t = prog(f, 14 + i * 4, 20);
          return (
            <div key={y} style={{ position: "absolute", left: `${(i / (years.length - 1)) * 100}%`, top: -8, transform: "translateX(-50%)", opacity: t }}>
              <div style={{ width: 1.5, height: 16, background: C.fg4, margin: "0 auto" }} />
              <div style={{ fontFamily: F.mono, fontSize: 20, color: C.fg3, marginTop: 12 }}>{y}</div>
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            top: -30,
            left: `${interpolate(f, [0, 280], [2, 30], CLAMP)}%`,
            width: 10,
            height: 10,
            borderRadius: 5,
            background: C.amber,
            boxShadow: `0 0 16px ${C.amber}`,
            opacity: ruler,
          }}
        />
      </div>

      {/* statement */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - titleOut, transform: `translateY(${-titleOut * 60}px)` }}>
        <Words
          text="Power utilities plan their construction"
          delay={s1 - 4}
          stagger={3}
          style={{ fontFamily: F.sans, fontSize: 84, fontWeight: 600, color: C.fg1, letterSpacing: "-0.02em", justifyContent: "center", maxWidth: 1500 }}
        />
        <Words
          text="years in advance."
          delay={s1 + 18}
          stagger={4}
          style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 110, color: C.amber, justifyContent: "center", marginTop: 6 }}
        />
      </AbsoluteFill>

      {/* two plans, two documents */}
      <AbsoluteFill style={{ opacity: docsIn }}>
        <div
          style={{
            position: "absolute",
            left: 960 - 560 - split * 70,
            top: 150,
            transform: `translateX(${(1 - docsIn) * -500}px) rotate(${-3 + docsIn * 1}deg)`,
          }}
        >
          <Doc
            color={C.a}
            publisher="Dominion Energy South Carolina · SCRTP"
            title="Planned Transmission Projects $2M and above, 2026–2030"
            meta="145 plan pages · one project per page"
            state="SC"
            util="desc"
            seed={3}
            mapT={prog(f, s2 + 10, 40)}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 960 + 60 + split * 70,
            top: 150,
            transform: `translateX(${(1 - docsIn) * 500}px) rotate(${3 - docsIn * 1}deg)`,
          }}
        >
          <Doc
            color={C.b}
            publisher="Georgia Power · Georgia PSC Docket 56002"
            title="2024 GA ITS Ten-Year Plan (2025 IRP Technical Appendix Vol. 3)"
            meta="138 plan pages · summary table + project pages"
            state="GA"
            util="gpc"
            seed={8}
            mapT={prog(f, s2 + 40, 40)}
          />
        </div>
        {/* no shared view */}
        <div style={{ position: "absolute", left: 958, top: 130, width: 4, height: 700, opacity: split }}>
          <div style={{ width: 2, height: "100%", margin: "0 auto", backgroundImage: `linear-gradient(${C.fg3} 50%, transparent 50%)`, backgroundSize: "2px 16px" }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 960,
            top: 480,
            transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * prog(f, s2 + 44, 20, outExpo)})`,
            opacity: prog(f, s2 + 44, 12),
            width: 64,
            height: 64,
            borderRadius: 32,
            background: C.bg1,
            border: `1.5px solid ${C.warn}`,
            color: C.warn,
            fontSize: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: F.sans,
          }}
        >
          ×
        </div>
        <div style={{ position: "absolute", top: 870, width: "100%", display: "flex", justifyContent: "center", gap: 60 }}>
          <Words text="Each in its own document." delay={s2 + 16} style={{ fontFamily: F.sans, fontSize: 46, fontWeight: 500, color: C.fg1 }} />
          <Words text="On its own map." delay={s2 + 62} style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 56, color: C.amber }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
