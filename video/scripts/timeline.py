"""Lay the scenes out on the narration: each scene gets a lead-in, its lines (with gaps) and a tail, and every scene
start is snapped to the music's beat grid. Writes src/data/timeline.json (read by the video and by music.py)."""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
BPM = 100
BEAT = 60 / BPM
vo = {v["id"]: v for v in json.load(open(ROOT / "src/data/vo.json"))}

# name, lines, lead-in, gap between lines, tail (seconds)
SCENES = [
    ("cold", ["s01", "s02"], 1.2, 0.5, 0.7),
    ("problem", ["s03", "s04"], 0.7, 0.7, 0.8),
    ("title", ["s05"], 1.3, 0, 2.6),
    ("pipeline", ["s06"], 0.4, 0, 0.7),
    ("grid", ["s07", "s08"], 0.4, 0.7, 1.1),
    ("compare", ["s09"], 0.4, 0, 0.8),
    ("toplead", ["s10", "s11"], 0.3, 0.5, 0.8),
    ("ovl3", ["s12"], 0.3, 0, 0.9),
    ("closeup", ["s13"], 0.4, 0, 3.4),
    ("honest", ["s14"], 0.4, 0, 0.8),
    ("brief", ["s15"], 0.3, 0, 1.0),
    ("impact", ["s16", "s17"], 0.4, 0.5, 1.0),
    ("proof", ["s18", "s19"], 0.4, 0.6, 0.8),
    ("outro", ["s20", "s21"], 1.0, 0.7, 4.6),
]

t = 0.0
scenes, cues = [], []
for name, lines, lead, gap, tail in SCENES:
    start = math.ceil(round(t / BEAT, 6)) * BEAT
    cur = start + lead
    for i, lid in enumerate(lines):
        if i:
            cur += gap
        cues.append({"id": lid, "scene": name, "from": round(cur * FPS), "frames": math.ceil(vo[lid]["seconds"] * FPS), "caption": vo[lid]["caption"]})
        cur += vo[lid]["seconds"]
    end = cur + tail
    scenes.append({"name": name, "from": round(start * FPS), "to": round(end * FPS)})
    t = end

# each scene runs until the next one starts
for a, b in zip(scenes, scenes[1:]):
    a["to"] = b["from"]
total = scenes[-1]["to"]
json.dump({"fps": FPS, "bpm": BPM, "total": total, "scenes": scenes, "cues": cues}, open(ROOT / "src/data/timeline.json", "w"), indent=1)
for s in scenes:
    print(f"{s['name']:9s} {s['from']/FPS:7.2f} → {s['to']/FPS:7.2f}  ({(s['to']-s['from'])/FPS:5.2f}s)")
print("total", total / FPS)
