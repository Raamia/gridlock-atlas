"""Original score + sound design for the video, synthesised from scratch (no samples, no licences).

Reads src/data/timeline.json (scene starts sit on the 100 BPM beat grid) and writes public/music.wav:
A-minor pads (Am-F-C-G), bass, drums and arpeggios whose intensity follows the scenes, a riser and impact into the
title and the outro, whooshes on dissolves, UI clicks on the app clips, and ducking under every narration line.
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
TL = json.load(open(ROOT / "src/data/timeline.json"))
VO = {v["id"]: v for v in json.load(open(ROOT / "src/data/vo.json"))}
SR = 48000
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
BAR = BEAT * 4
DUR = TL["total"] / FPS + 0.5
N = int(DUR * SR)
rng = np.random.default_rng(20260927)
scene = {s["name"]: (s["from"] / FPS, s["to"] / FPS) for s in TL["scenes"]}

def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def buf():
    return np.zeros((N, 2))

def place(dst, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(x) <= 0:
        return
    x = x[: N - i] if i >= 0 else x[-i:]
    i = max(i, 0)
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    if x.ndim == 1:
        dst[i : i + len(x), 0] += x * gain * l * np.sqrt(2)
        dst[i : i + len(x), 1] += x * gain * r * np.sqrt(2)
    else:
        dst[i : i + len(x)] += x * gain

def env(n, a, d, s, r, sus):
    """ADSR over n samples of note-on (release added after)."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(max(n - a - d, 0), s), np.linspace(s, 0, max(r, 1))])
    return e[: n + r]

def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)

def hp(x, fc, order=2):
    sos = signal.butter(order, fc, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)

def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)

def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + phase) % 1) - 1

def supersaw(f, n, voices=7, spread=0.18):
    out = np.zeros(n)
    for k in range(voices):
        det = (k - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        out += saw(f * 2 ** (det / 12), n, rng.random())
    return out / voices

# ---------------------------------------------------------------------------------------------- arrangement
CHORDS = [  # Am F C G, one per bar
    ([57, 60, 64, 69], 45),
    ([53, 57, 60, 65], 41),
    ([55, 60, 64, 67], 48),
    ([55, 59, 62, 67], 43),
]

LEVELS = {  # layer gains per scene
    "cold": dict(pad=0.45, drone=0.5, tick=0.22),
    "problem": dict(pad=0.5, drone=0.35, bass=0.5, kick_half=0.5, hat=0.22, arp=0.18, tick=0.12),
    "title": dict(pad=0.85, bell=0.5, bass_sus=0.55),
    "pipeline": dict(pad=0.5, bass=0.7, kick=0.65, hat=0.35, clap=0.28, arp=0.35),
    "grid": dict(pad=0.5, bass=0.75, kick=0.7, hat=0.4, clap=0.32, arp=0.42),
    "compare": dict(pad=0.52, bass=0.75, kick=0.72, hat=0.42, clap=0.34, arp=0.45),
    "toplead": dict(pad=0.55, bass=0.78, kick=0.75, hat=0.45, clap=0.35, arp=0.48),
    "ovl3": dict(pad=0.55, bass=0.75, kick=0.7, hat=0.45, clap=0.35, arp=0.45),
    "closeup": dict(pad=0.75, bass=0.8, kick=0.75, hat=0.5, clap=0.38, arp=0.55, bell=0.45),
    "honest": dict(pad=0.55, bass_sus=0.45, hat=0.2, arp=0.25, bell=0.3),
    "brief": dict(pad=0.52, bass=0.65, kick=0.55, hat=0.38, arp=0.38),
    "impact": dict(pad=0.58, bass=0.8, kick=0.78, hat=0.48, clap=0.38, arp=0.5),
    "proof": dict(pad=0.6, bass=0.8, kick=0.8, hat=0.52, clap=0.42, arp=0.55),
    "outro": dict(pad=0.9, bell=0.5, bass_sus=0.6, kick=0.55, hat=0.3),
}

def levels_at(t):
    for name, (a, b) in scene.items():
        if a <= t < b:
            return LEVELS[name], name
    return LEVELS["outro"], "outro"

music = buf()
drums = buf()
fx = buf()

# kick/hat/clap one-shots
def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.16)
    x += 0.25 * lp(rng.standard_normal(n) * np.exp(-t / 0.004), 4000)
    return np.tanh(1.6 * x)

def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t / (0.07 if open_ else 0.018)) * 0.5

def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) / (0.01 if k < 2 else 0.09))
    return bp(rng.standard_normal(n), 900, 2600) * e * 0.7

K, HC, HO, CL = kick(), hat(), hat(True), clap()
kick_times = []

bars = int(DUR / BAR) + 1
for b in range(bars):
    t0 = b * BAR
    chord, root = CHORDS[b % 4]
    L, name = levels_at(t0 + 0.01)
    # pad: one chord per bar, long release, gently filtered
    if L.get("pad"):
        n = int(BAR * SR)
        x = sum(supersaw(mtof(m), n + int(1.6 * SR)) for m in chord) / len(chord)
        bright = 1600 if name in ("cold", "problem", "honest") else 2800 if name not in ("title", "closeup", "outro") else 4200
        x = lp(x, bright) * env(n, 0.35, 0.4, 0.8, 1.6, 0.8)[: len(x)]
        place(music, np.stack([x, np.roll(x, 331)], 1), t0, L["pad"] * 0.55)
    if L.get("drone") and b % 2 == 0:
        n = int(2 * BAR * SR)
        t = np.arange(n + SR) / SR
        x = np.sin(2 * np.pi * mtof(33) * t) * 0.8 + 0.3 * np.sin(2 * np.pi * mtof(45) * t)
        x *= env(n, 1.2, 0.5, 0.9, 1.0, 0.9)[: len(x)]
        place(music, x, t0, L["drone"] * 0.5)
    # bass: eighth-note pulses on the root
    if L.get("bass"):
        for k in range(8):
            n = int(BEAT / 2 * SR * 0.9)
            t = np.arange(n) / SR
            f = mtof(root)
            x = 0.7 * np.sin(2 * np.pi * f * t) + 0.35 * lp(saw(f, n), 600)
            x *= np.minimum(1, t / 0.004) * np.exp(-t / 0.22)
            place(music, x, t0 + k * BEAT / 2, L["bass"] * (0.55 if k % 2 else 0.65))
    if L.get("bass_sus"):
        n = int(BAR * SR)
        t = np.arange(n + int(0.6 * SR)) / SR
        f = mtof(root)
        x = (0.8 * np.sin(2 * np.pi * f * t) + 0.25 * lp(saw(f, len(t)), 500)) * env(n, 0.2, 0.3, 0.8, 0.6, 0.8)[: len(t)]
        place(music, x, t0, L["bass_sus"] * 0.6)
    # arpeggio: 16th plucks over the chord
    if L.get("arp"):
        pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 3, 2, 1, 3, 2, 1]
        for k, idx in enumerate(pattern):
            m = chord[idx] + 12
            n = int(0.28 * SR)
            t = np.arange(n) / SR
            x = saw(mtof(m), n) * np.exp(-t / 0.09)
            x = lp(x, 3200)
            place(music, x, t0 + k * BEAT / 4, L["arp"] * 0.16 * (1.0 if k % 4 == 0 else 0.7), pan=0.35 if k % 2 else -0.35)
    # bells: sparse FM bell on the chord's top notes
    if L.get("bell"):
        for k, idx in enumerate([3, 2]):
            m = chord[idx] + 12
            n = int(2.2 * SR)
            t = np.arange(n) / SR
            fc = mtof(m)
            mod = np.sin(2 * np.pi * fc * 3.5 * t) * 2.2 * np.exp(-t / 0.4)
            x = np.sin(2 * np.pi * fc * t + mod) * np.exp(-t / 0.9)
            place(music, x, t0 + k * BEAT * 2, L["bell"] * 0.22, pan=-0.3 if k else 0.3)
    # drums
    for k in range(4):
        tb = t0 + k * BEAT
        Lb, _ = levels_at(tb + 0.01)
        if Lb.get("kick") or (Lb.get("kick_half") and k % 2 == 0):
            place(drums, K, tb, (Lb.get("kick") or Lb.get("kick_half")) * 0.9)
            kick_times.append(tb)
        if Lb.get("clap") and k % 2 == 1:
            place(drums, CL, tb, Lb["clap"] * 0.6)
        if Lb.get("hat"):
            place(drums, HO, tb + BEAT / 2, Lb["hat"] * 0.45, pan=0.2)
            place(drums, HC, tb + BEAT / 4, Lb["hat"] * 0.25, pan=-0.2)
            place(drums, HC, tb + 3 * BEAT / 4, Lb["hat"] * 0.25, pan=-0.2)
        if Lb.get("tick"):
            for q in range(4):
                place(drums, HC, tb + q * BEAT / 4, Lb["tick"] * (0.35 if q == 0 else 0.18))

# sidechain pump on the music bed from the kicks
pump = np.ones(N)
for kt in kick_times:
    i = int(kt * SR)
    n = min(int(0.3 * SR), N - i)
    if n > 0:
        pump[i : i + n] = np.minimum(pump[i : i + n], 1 - 0.45 * np.exp(-np.arange(n) / SR / 0.09))
music *= pump[:, None]

# ---------------------------------------------------------------------------------------------- sound design
def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # time-varying band: process in 40 ms blocks
    blk = int(0.04 * SR)
    for i in range(0, n, blk):
        p = i / n
        lo = 300 + 5000 * p**2
        seg = noise[max(0, i - 2000) : i + blk]
        y = bp(seg, lo, min(lo * 2.2, 20000))
        out[i : i + blk] = y[-len(out[i : i + blk]) :]
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t / dur * 2)) / SR) * 0.25
    e = (t / dur) ** 2.2
    return (out * 0.5 + tone) * e

def impact():
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = 30 + 50 * np.exp(-t / 0.15)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    crash = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.8) * 0.35
    body = lp(rng.standard_normal(n), 900) * np.exp(-t / 0.12) * 0.6
    return np.tanh(1.3 * (boom + crash + body))

def whoosh(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.sin(np.pi * t / dur) ** 2
    x = bp(rng.standard_normal(n), 400, 3500) * e
    return x

def click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 2000, 7000) * np.exp(-t / 0.006) * 0.8 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.01) * 0.3

title_t = scene["title"][0]
outro_t = scene["outro"][0]
place(fx, riser(4 * BEAT), title_t - 4 * BEAT, 0.5)
place(fx, impact(), title_t, 0.9)
place(fx, riser(4 * BEAT), outro_t - 4 * BEAT, 0.45)
place(fx, impact(), outro_t, 0.75)
# snare build into the outro
for k in range(16):
    tb = outro_t - 2 * BAR + k * BAR / 8
    place(drums, CL, tb, 0.12 + 0.35 * k / 16)
for name, (a, b) in scene.items():
    if name in ("cold", "title", "outro"):
        continue
    place(fx, whoosh(), a - 0.35, 0.12, pan=0.4 if len(name) % 2 else -0.4)
# UI clicks where the cursor clicks in the recorded clips (scene-relative seconds)
CLICKS = {"compare": 44 / FPS, "toplead": 35 / FPS, "brief": 32 / FPS, "proof": 34 / FPS}
for name, dt in CLICKS.items():
    place(fx, click(), scene[name][0] + dt, 0.3)

# ---------------------------------------------------------------------------------------------- mix
def reverb(x, secs=2.6, mix=0.25):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / (secs / 5))[:, None]
    ir = lp(ir, 5000)
    ir /= np.sqrt((ir**2).sum(0))
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix * 3

music = reverb(music, 2.8, 0.3)
fx = reverb(fx, 2.2, 0.25)
drums = reverb(drums, 1.2, 0.08)

bed = music + drums
# duck the bed under narration (-10 dB, 60 ms attack, 350 ms release)
duck = np.ones(N)
for c in TL["cues"]:
    a = c["from"] / FPS - 0.08
    b = (c["from"] + c["frames"]) / FPS + 0.1
    duck[int(a * SR) : int(b * SR)] = 0.32
k_att = np.exp(-1 / (0.06 * SR))
k_rel = np.exp(-1 / (0.35 * SR))
sm = np.empty(N)
v = 1.0
for i in range(N):
    target = duck[i]
    kk = k_att if target < v else k_rel
    v = target + (v - target) * kk
    sm[i] = v
bed *= sm[:, None]

mix = bed + fx
# fade in/out
fi = int(0.8 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(4.0 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix = np.tanh(mix * 1.1) / np.tanh(1.1)

# level against the narration: bed about 13 dB under the voice while it speaks
vo_rms = np.mean([np.sqrt(np.mean(sf.read(ROOT / f"public/vo/{c}.wav")[0] ** 2)) for c in VO])
speech = np.zeros(N, bool)
for c in TL["cues"]:
    speech[int(c["from"] / FPS * SR) : int((c["from"] + c["frames"]) / FPS * SR)] = True
bed_rms = np.sqrt(np.mean(mix[speech] ** 2))
gain = vo_rms * 10 ** (-13 / 20) / bed_rms
mix *= gain
peak = np.abs(mix).max()
if peak > 0.89:
    mix *= 0.89 / peak
sf.write(ROOT / "public/music.wav", mix.astype(np.float32), SR)
print("music.wav", round(DUR, 1), "s · gain", round(gain, 3), "· peak", round(float(np.abs(mix).max()), 3), "· vo rms", round(vo_rms, 4))
