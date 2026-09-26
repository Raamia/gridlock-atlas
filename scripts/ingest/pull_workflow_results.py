#!/usr/bin/env python3
"""Copy research clusters out of a workflow journal, preferring the verified version of each cluster."""
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
    elif j.get("type") == "result" and isinstance(j.get("result"), dict) and j["result"].get("cluster"):
        label = labels.get(j["key"], "")
        r = j["result"]
        rank = 2 if label.startswith("verify:") else 1
        if rank >= best.get(r["cluster"], (0, None))[0]:
            best[r["cluster"]] = (rank, r)
out = ROOT / "data" / "research"
out.mkdir(parents=True, exist_ok=True)
for cluster, (rank, r) in sorted(best.items()):
    (out / f"{cluster}.json").write_text(json.dumps(r, indent=1))
    print(f"{'verified' if rank == 2 else 'UNVERIFIED':10s} {cluster}")
