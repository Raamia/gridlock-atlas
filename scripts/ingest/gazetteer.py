#!/usr/bin/env python3
"""Find candidate coordinates for a named substation / plant in SC & GA from the bulk OSM power export.

Usage:
  python3 scripts/ingest/gazetteer.py "Thurmond Dam"                 # fuzzy name search
  python3 scripts/ingest/gazetteer.py "McIntosh" --near 32.35,-81.18  # rank by distance to a point
  python3 scripts/ingest/gazetteer.py "Okatie" --operator dominion     # filter by operator substring
  python3 scripts/ingest/gazetteer.py --around 32.35,-81.18 --km 15    # list named power features nearby

Data: data/region-b/osm-power-sc-ga.json (Overpass: power=substation|plant|switch, bbox SC+GA).
Each hit prints: score, name, operator, power type, lat/lon, OSM id, distance (if --near).
Always confirm a hit against the planning document's description (zone, county, nearby places).
"""
import argparse
import json
import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "region-b" / "osm-power-sc-ga.json"
STOP = {"substation", "sub", "primary", "switching", "station", "plant", "steam", "electric", "generating", "tap",
        "kv", "the", "switchyard", "power", "transmission", "distribution", "dam", "usa", "hydro", "energy", "center"}


def tokens(s):
    s = re.sub(r"\(.*?\)", " ", s.lower())
    s = re.sub(r"\d+\s*/?\s*\d*\s*kv", " ", s)
    return [t for t in re.findall(r"[a-z]+", s) if t not in STOP and len(t) > 1]


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def load():
    out = []
    for e in json.load(open(DATA))["elements"]:
        t = e.get("tags", {})
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None:
            continue
        out.append({"name": t.get("name", ""), "operator": t.get("operator", ""), "power": t.get("power", ""),
                    "voltage": t.get("voltage", ""), "ref": t.get("ref", ""), "lat": lat, "lon": lon,
                    "osm": f"{e['type']}/{e['id']}"})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="?")
    ap.add_argument("--near")
    ap.add_argument("--operator")
    ap.add_argument("--around")
    ap.add_argument("--km", type=float, default=10)
    ap.add_argument("-n", type=int, default=8)
    a = ap.parse_args()
    feats = load()

    if a.around:
        c = tuple(map(float, a.around.split(",")))
        rows = [(haversine_km(c, (f["lat"], f["lon"])), f) for f in feats if f["name"] or f["operator"]]
        rows = sorted([r for r in rows if r[0] <= a.km], key=lambda r: r[0])[: max(a.n, 25)]
        for d, f in rows:
            print(f"{d:6.2f} km  {f['name'] or '(unnamed)':40s} {f['operator'][:28]:28s} {f['power']:10s} {f['voltage']:14s} {f['lat']:.5f},{f['lon']:.5f}  {f['osm']}")
        return

    q = tokens(a.query)
    near = tuple(map(float, a.near.split(","))) if a.near else None
    scored = []
    for f in feats:
        if not f["name"]:
            continue
        if a.operator and a.operator.lower() not in f["operator"].lower():
            continue
        ft = tokens(f["name"])
        if not ft or not q:
            continue
        common = len(set(q) & set(ft))
        if not common:
            continue
        score = common / len(set(q) | set(ft))
        if " ".join(q) in " ".join(ft):
            score += 0.3
        d = haversine_km(near, (f["lat"], f["lon"])) if near else None
        scored.append((score, d, f))
    scored.sort(key=lambda r: (-r[0], r[1] if r[1] is not None else 0))
    for score, d, f in scored[: a.n]:
        dist = f"{d:7.1f} km" if d is not None else ""
        print(f"{score:.2f} {f['name'][:42]:42s} {f['operator'][:28]:28s} {f['power']:10s} {f['voltage']:14s} {f['lat']:.5f},{f['lon']:.5f} {f['osm']} {dist}")
    if not scored:
        print("no OSM match — try Nominatim, Open Infrastructure Map, or --around a known nearby town")


if __name__ == "__main__":
    main()
