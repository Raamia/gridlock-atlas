# GridLock Atlas — demo video

A 2:46 narrated demo for the Sperry Tech GridLock Challenge, built with [Remotion](https://www.remotion.dev/) (React → MP4).
The finished cut is [`out/gridlock-atlas-demo.mp4`](out/gridlock-atlas-demo.mp4) (1920×1080, 30 fps, H.264/AAC, −14 LUFS).

Everything on screen comes from the repo: the maps are drawn from `data/snapshot.json` (Census outlines, both utilities'
project geometry, every flagged pair's closest points), the counts from `data/eval/*.json`, the quotes are verbatim
excerpts with their pages, and the "live app" shots are frame-exact recordings of the real app.

## Story (≈ 2:46)

| Time | Scene | What it shows |
| --- | --- | --- |
| 0:00 | Cold open | Utilities plan years ahead, each in its own document, on its own map |
| 0:10 | The problem | 199 DESC × Georgia Power projects along the Savannah River, some 4.25 mi apart; FERC Order 1920 |
| 0:28 | Title | GridLock *Atlas* — two public plans, one map, every claim cited |
| 0:34 | How it works | 103 public documents → one map → 1,786 verbatim excerpts with pages |
| 0:43 | Selectivity | 7,929 pairs measured by closest points; naive OR rule 4,631 (58.4%) vs GridLock 149 (1.9%) |
| 1:03 | Live app | Compare public plans; queue ranked place → timing → evidence |
| 1:11 | #1 lead | Jasper–Okatie #2 × Goshen–McIntosh: 4.25 mi, published schedules overlap 18 months |
| 1:26 | Sperry OVL_3 | The sponsor's own example pair ranks #1 on today's plans |
| 1:32 | 3D close-up | The app's close-up simulation: on the ground, and in time |
| 1:40 | Honesty | Field-work dates not published; "unknown", never "uncoordinated" |
| 1:50 | Review brief | One question for planners, every fact numbered to its source |
| 1:58 | Impact | Tremval North, Wisconsin: one 345 kV terminal instead of two ≈ $9.0M–$12.4M (stated) |
| 2:14 | Audit | Sperry's worked example 6/6 + 10/10; GPT-5.5 cross-check 2,578 / 2,579 quotes verbatim |
| 2:32 | Close | Public plans. One map. Every claim cited. |

## Rebuild it

```bash
cd video && npm install
pip install kokoro-onnx soundfile numpy scipy imageio-ffmpeg   # voice, score, ffmpeg

# 1. real-app footage (app running on :3217 — from the repo root: npm run build && npx next start -p 3217)
npm run capture                     # → public/clips/*.mp4 (deterministic, frame-by-frame on a virtual clock)
# 2. narration (Kokoro TTS, voice af_heart; model files from github.com/thewh1teagle/kokoro-onnx releases)
python3 scripts/tts.py kokoro-v1.0.onnx voices-v1.0.bin   # → public/vo/*.wav + src/data/vo.json
# 3. scene timing on the 100 BPM grid, then the synthesised score
npm run timeline && npm run music   # → src/data/timeline.json, public/music.wav
# 4. render (+ two-pass loudness normalisation)
npm run render                      # → out/gridlock-atlas-demo.mp4
```

`npm run studio` opens the Remotion editor for scrubbing. `python3 scripts/extract_geo.py matches.json` rebuilds
`src/data/geo.json` from `GET /api/matches?threshold=25`.

## Notes

- **Footage.** `capture/recorder.mjs` drives the app with Playwright's fake clock, one video frame at a time, and keeps
  CSS/WAAPI animations locked to that clock through CDP, so camera flights and the 3D close-up are smooth at 30 fps on
  any machine. It hides only the "basemap unavailable" toast (it reports the recording machine's network, not the plans);
  without a reachable Mapbox token the app draws its bundled offline basemap, as it does here.
- **Voice.** Kokoro-82M (Apache-2.0). Names are respelled for pronunciation in `scripts/narration.json` ("Oh-Katie",
  "Mackintosh"); captions keep the real spelling.
- **Music and sound.** Composed in code (`scripts/music.py`): A-minor pads, bass, drums, arpeggios, risers, impacts,
  whooshes and UI clicks, ducked 10 dB under every narration line. No samples or licensed audio.
- **Fonts.** Geist, Geist Mono and Instrument Serif (SIL OFL), bundled in `public/fonts` — the app's own type.
