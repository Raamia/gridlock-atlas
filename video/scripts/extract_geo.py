"""Extract the real Savannah River data the video draws: state outlines, the SC-GA border,
DESC and Georgia Power project geometry, and every flagged cross-utility pair (closest points).

    python3 video/scripts/extract_geo.py matches.json   # matches.json = GET /api/matches?threshold=25
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
snap = json.load(open(ROOT / "data/snapshot.json"))
matches = json.load(open(sys.argv[1]))
states = json.load(open(ROOT / "public/geo/states.json"))

r4 = lambda c: [round(c[0], 4), round(c[1], 4)]

def rings(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [[r4(c) for c in poly[0]] for poly in polys]

keep = {"SC", "GA", "NC", "FL", "AL", "TN"}
state_out = {}
for f in states["features"]:
    ab = f["properties"]["abbr"]
    if ab in keep:
        state_out[ab] = [r for r in rings(f["geometry"]) if len(r) > 8]

# SC-GA shared border: runs of SC vertices that are also GA vertices
ga = {tuple(c) for r in state_out["GA"] for c in r}
border, run = [], []
for ring in state_out["SC"]:
    for c in ring:
        if tuple(c) in ga:
            run.append(c)
        elif run:
            border.append(run); run = []
    if run: border.append(run); run = []
border = max(border, key=len)

projects = []
for p in snap["projects"]:
    if p.get("region") != "southeast": continue
    u = p["owners"][0]["utilityId"]
    pts = [[pl["lon"], pl["lat"]] for pl in p["places"] if pl["precision"] != "county" and pl.get("role") != "context"]
    lines = []
    if p.get("route"):
        lines.append([r4(c) for c in p["route"]["coordinates"]])
    else:
        ends = [[pl["lon"], pl["lat"]] for pl in p["places"] if pl.get("role") == "endpoint" and pl["precision"] != "county"]
        if len(ends) >= 2:
            lines.append([r4(ends[0]), r4(ends[1])])
    if not pts and not lines: continue
    projects.append({"id": p["id"], "u": u, "t": p.get("shortTitle") or p["title"], "l": lines, "p": [r4(c) for c in pts]})

m = [x for x in matches["matches"] if x["projectAId"].startswith(("desc", "gpc", "sertp26")) and x["projectBId"].startswith(("desc", "gpc", "sertp26"))]
order = {"needs-review": 0, "known-coordination": 1, "possible": 2}
m.sort(key=lambda x: (order[x["reviewStatus"]], -x["priority"]))
pairs = []
for i, x in enumerate(m):
    c = x["geoDetail"].get("closest") or {}
    if not c.get("a") or not c.get("b"): continue
    pairs.append({"id": x["id"], "a": r4(c["a"]), "b": r4(c["b"]), "mi": round(c["miles"], 2), "s": x["reviewStatus"], "badge": x["badge"], "pa": x["projectAId"], "pb": x["projectBId"]})

out = {"states": state_out, "border": border, "projects": projects, "pairs": pairs,
       "counts": {"projects": len(projects), "pairs": len(pairs), "flaggedSoutheast": len(m)}}
dst = ROOT / "video/src/data/geo.json"
json.dump(out, open(dst, "w"), separators=(",", ":"))
print(dst, out["counts"], "border pts", len(border), "top", pairs[0]["id"], pairs[0]["mi"])
