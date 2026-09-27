import { SNAPSHOT } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { formatDate, formatMilesNear } from "@/lib/format";
import { dayCount } from "@/lib/matching/time";
import type { CloseupModel } from "./model";
import type { TimeModel } from "./time";

/*
 * "Play the story": a short guided flight through one pair's close-up for someone who has never read a transmission
 * filing — the pair, the ground between them, time rising out of the plinth, where they meet (or don't) in time, and
 * the call. Every sentence is built from the snapshot and the engine's result for this pair; the honesty wording is the
 * inspector's (a schedule is start → in-service, never field-work dates; "needs review" is not "uncoordinated").
 */

/** A camera goal in scene space. `home`: the fitted whole-plinth target for the current mode (ignores `target`). */
export interface Shot {
  home?: boolean;
  target: [number, number, number];
  /** Orbit distance as a fraction of the fitted home distance for the step's mode. */
  distK: number;
  /** Polar angle from straight above (0 = looking straight down at the plinth). */
  polar: number;
  /** THREE spherical theta; null keeps the current azimuth. */
  azimuth: number | null;
}

export interface StoryStep {
  id: "pair" | "ground" | "rise" | "time" | "call";
  kicker: string;
  text: string;
  names?: string;
  /** The time axis is raised during this step. */
  time: boolean;
  /** Replays the time sweep (pillars grow in date order) when the step starts. */
  sweep?: boolean;
  /** A slow orbit once the camera has arrived. */
  orbit?: boolean;
  shot: Shot;
  ms: number;
}

const PI = Math.PI;
export const STEP_MS = 6800;
export const SWEEP_MS = 4200;

function groundLine(cu: CloseupModel): { text: string; focus: [number, number] } {
  const T = cu.thresholdMiles;
  const center = cu.a.center && cu.b.center ? { x: (cu.a.center.x + cu.b.center.x) / 2, z: (cu.a.center.z + cu.b.center.z) / 2 } : (cu.a.center ?? cu.b.center ?? { x: 0, z: 0 });
  if (cu.site) {
    const text = cu.beyondRadius
      ? `Flagged through the shared site ${cu.site.label} (${cu.site.basis}), beyond the ${T} mi radius.`
      : `Both reach ${cu.site.label} (${cu.site.basis}), so they touch there.`;
    return { text, focus: [cu.site.pos.x, cu.site.pos.z] };
  }
  if (cu.touch) return { text: "Their mapped work touches or crosses: a zero-mile closest approach, not a route.", focus: [cu.touch.x, cu.touch.z] };
  if (cu.touching) return { text: "They share a facility, so they touch.", focus: [center.x, center.z] };
  if (cu.closest && cu.miles != null) {
    const miles = formatMilesNear(cu.miles, T);
    const value = `${cu.approx && !miles.startsWith("<") ? "≈" : ""}${miles}`;
    const text = `Closest points ${value} apart${cu.estimated ? " (estimated)" : ""}, ${cu.within ? "inside" : "outside"} the ${T} mi review radius.`;
    return { text, focus: [(cu.closest.a.x + cu.closest.b.x) / 2, (cu.closest.a.z + cu.closest.b.z) / 2] };
  }
  const county = [cu.a, cu.b].find((p) => p.countyOnly);
  return { text: `${county ? `${county.owner}'s project is` : "One project is"} located only at county level, so no distance is drawn.`, focus: [center.x, center.z] };
}

function timeLine(m: Match, tm: TimeModel): { kicker: string; text: string; y: number } {
  const [pa, pb] = [tm.pillars.find((p) => p.side === "a"), tm.pillars.find((p) => p.side === "b")];
  const gap = tm.gap;
  const gapSentence = gap ? ` In-service dates ${gap.coarse ? "at least " : ""}${dayCount(gap.days)} apart.` : "";
  if (tm.overlap) {
    const o = tm.overlap;
    const sched = m.timeDetail.basis === "schedule";
    const text = sched
      ? `Their published schedules (start → in-service) overlap ${o.span}; field-work dates are not published.${gapSentence}`
      : o.confirmed
        ? `Their published construction windows overlap ${o.span}.${gapSentence}`
        : `Their ${o.noun} may overlap ${o.span}, at the precision the sources state.${gapSentence}`;
    return { kicker: o.confirmed ? "Overlapping in time" : "Possibly overlapping", text, y: (o.from + o.to) / 2 };
  }
  if (gap) {
    return {
      kicker: "Apart in time",
      text: `In service ${gap.coarse ? "at least " : ""}${dayCount(gap.days)} apart: ${pa?.isd?.text} and ${pb?.isd?.text}. Same ground, different years, so time ranks it lower.`,
      y: (gap.from + gap.to) / 2,
    };
  }
  if (pa?.isd && pb?.isd) {
    return {
      kicker: "The same period",
      text: `Both in service in the same stated period (${pa.isd.text} · ${pb.isd.text}), overlapping at the precision the sources give.`,
      y: (pa.isd.from + pb.isd.to) / 2,
    };
  }
  const drawn = pa ?? pb;
  const away = tm.unplaced[0];
  if (away && drawn) {
    const when = (isd: string | null | undefined) => (isd ? `in service ${isd}` : "no in-service date published");
    return {
      kicker: "Time, one side",
      text: `${drawn.owner}: ${when(drawn.isd?.text)}. ${away.owner}'s project is located only at county level, so it has no pillar (${when(away.isd)}).`,
      y: drawn.isd ? (drawn.isd.from + drawn.isd.to) / 2 : tm.height / 2,
    };
  }
  const missing = [pa, pb].filter((p): p is NonNullable<typeof p> => !!p && !p.isd).map((p) => p.owner);
  const who = missing.length ? missing.join(" and ") : "Neither project";
  return { kicker: "Time unknown", text: `${who} ${missing.length > 1 ? "publish" : "publishes"} no in-service date here, so time cannot rank this pair.`, y: tm.height / 2 };
}

function callLine(m: Match): string {
  if (m.reviewStatus === "known-coordination") return "Coordination is already documented: a known interface, not a new gap.";
  if (m.reviewStatus === "needs-review") return "Worth a planner's call. No coordination plan was found in the reviewed sources: status unknown, not “uncoordinated.”";
  return "The evidence is coarse: a lead to verify, not a finding.";
}

/** The story for one pair. Pure (no DOM, no three). */
export function buildStory(m: Match, cu: CloseupModel, tm: TimeModel): StoryStep[] {
  const side = tm.sideAzimuth;
  const ground = groundLine(cu);
  const time = timeLine(m, tm);
  const names = `${cu.a.title}  ·  ${cu.b.title}`;
  const undated = tm.undated.length ? ` ${tm.undated.join(" and ")} ${tm.undated.length > 1 ? "publish" : "publishes"} no date here.` : "";
  return [
    {
      id: "pair",
      kicker: "The pair",
      text: `Two public plans, ${cu.a.owner} and ${cu.b.owner}, placed to scale on the same ground.`,
      names,
      time: false,
      shot: { home: true, target: [0, 0, 0], distK: 1, polar: 0.27 * PI, azimuth: side },
      ms: STEP_MS - 800,
    },
    {
      id: "ground",
      kicker: "On the ground",
      text: ground.text,
      time: false,
      shot: { target: [ground.focus[0], 0.2, ground.focus[1]], distK: 0.62, polar: 0.2 * PI, azimuth: side },
      ms: STEP_MS,
    },
    {
      id: "rise",
      kicker: "Time rises",
      text: `Height is time. Each project rises to its filed in-service date; the glass sheet is the snapshot, ${formatDate(SNAPSHOT.snapshotDate)}.${undated}`,
      time: true,
      sweep: true,
      shot: { home: true, target: [0, 0, 0], distK: 0.9, polar: 0.41 * PI, azimuth: side },
      ms: SWEEP_MS + 3600,
    },
    {
      id: "time",
      kicker: time.kicker,
      text: time.text,
      time: true,
      shot: { target: [tm.mid.x, time.y, tm.mid.z], distK: 0.68, polar: 0.45 * PI, azimuth: side },
      ms: STEP_MS + 600,
    },
    {
      id: "call",
      kicker: "The call",
      text: callLine(m),
      time: true,
      orbit: true,
      shot: { home: true, target: [0, 0, 0], distK: 0.94, polar: 0.35 * PI, azimuth: side + 0.55 },
      ms: STEP_MS + 400,
    },
  ];
}
