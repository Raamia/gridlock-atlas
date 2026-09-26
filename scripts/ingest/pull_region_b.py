#!/usr/bin/env python3
"""Copy Region B workflow outputs (geocoding batches, SC–GA context, cost assumptions) into data/,
preferring the adversarially verified version of each."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
journal = pathlib.Path(sys.argv[1]) / "journal.jsonl"
labels, best = {}, {}
for line in journal.open():
    j = json.loads(line)
    if j.get("type") == "started":
        labels[j["key"]] = j.get("label") or ""
    elif j.get("type") == "result" and isinstance(j.get("result"), dict):
        label = labels.get(j["key"], "")
        kind, _, name = label.partition(":")
        r = j["result"]
        key = r.get("batch") or r.get("cluster") or ("cost" if "assumptions" in r else name)
        rank = 2 if kind == "verify" else 1
        if rank >= best.get(key, (0, None))[0]:
            best[key] = (rank, r)
(ROOT / "data/region-b/geo").mkdir(parents=True, exist_ok=True)
for key, (rank, r) in sorted(best.items()):
    if "projects" in r and "batch" in r:
        path = ROOT / "data/region-b/geo" / f"{key}.json"
    elif "assumptions" in r:
        path = ROOT / "data/region-b/cost.json"
    else:
        path = ROOT / "data/research" / f"{r.get('cluster', key)}.json"
    path.write_text(json.dumps(r, indent=1))
    print(f"{'verified' if rank == 2 else 'UNVERIFIED':10s} {key} -> {path.relative_to(ROOT)}")
