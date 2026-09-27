"""Generate the narration with Kokoro (af_heart) and write src/data/vo.json with each line's duration.

    python3 scripts/tts.py <kokoro-v1.0.onnx> <voices-v1.0.bin>
"""
import json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
lines = json.load(open(HERE / "narration.json"))
k = Kokoro(sys.argv[1], sys.argv[2])
out = []
for ln in lines:
    audio, sr = k.create(ln["text"], voice=ln.get("voice", "af_heart"), speed=ln.get("speed", 1.02), lang="en-us")
    # trim leading/trailing near-silence so timing is exact
    a = np.abs(audio)
    idx = np.where(a > 0.01)[0]
    audio = audio[max(0, idx[0] - int(0.03 * sr)): idx[-1] + int(0.08 * sr)]
    path = ROOT / "public/vo" / f"{ln['id']}.wav"
    sf.write(path, audio, sr)
    out.append({"id": ln["id"], "caption": ln.get("caption", ln["text"]), "seconds": round(len(audio) / sr, 3)})
    print(ln["id"], out[-1]["seconds"])
json.dump(out, open(ROOT / "src/data/vo.json", "w"), indent=1)
print("total", round(sum(o["seconds"] for o in out), 1))
