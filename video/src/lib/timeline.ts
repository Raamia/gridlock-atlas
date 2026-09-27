import tl from "../data/timeline.json";

export const TL = tl;
export const OVER = 16; // frames each scene lingers under the next one (cross-dissolve)

export const sceneOf = (name: string) => {
  const s = TL.scenes.find((x) => x.name === name);
  if (!s) throw new Error(`no scene ${name}`);
  return s;
};

export const cueOf = (id: string) => {
  const c = TL.cues.find((x) => x.id === id);
  if (!c) throw new Error(`no cue ${id}`);
  return c;
};

/** Frame, relative to its scene, at which narration line `id` starts. */
export const at = (id: string) => {
  const c = cueOf(id);
  return c.from - sceneOf(c.scene).from;
};

/** Frame, relative to its scene, at which narration line `id` ends. */
export const end = (id: string) => at(id) + cueOf(id).frames;

import vo from "../data/vo.json";

/** Frame, relative to its scene, of the k-th pause (phrase break) in narration line `id`. */
export const ph = (id: string, k: number) => {
  const v = (vo as { id: string; pauses: number[] }[]).find((x) => x.id === id);
  const p = v?.pauses[k];
  if (p === undefined) throw new Error(`no pause ${k} in ${id}`);
  return at(id) + Math.round(p * TL.fps);
};
