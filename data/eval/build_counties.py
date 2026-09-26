#!/usr/bin/env python3
"""County polygons for the evaluation's county baseline (data/eval/counties.json), from the US Census Bureau's 2023
cartographic boundary file cb_2023_us_county_20m (public/geo/counties.json has no South Carolina or Georgia counties).

  python3 data/eval/build_counties.py [--zip path/to/cb_2023_us_county_20m.zip]   # default: download from census.gov

Only the states the snapshot's projects touch (and their neighbors) are kept; coordinates are rounded to 3 decimals.
Rings are stored as the shapefile lists them: a point is in a county when an odd number of its rings contain it.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import pathlib
import struct
import urllib.request
import zipfile

URL = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip"
OUT = pathlib.Path(__file__).resolve().parent / "counties.json"
STATES = {"GA", "SC", "NC", "AL", "FL", "TN", "WI", "MN", "IA", "IL", "SD", "ND", "TX", "OK"}


def dbf_records(buf):
    n, header_len, rec_len = struct.unpack("<IHH", buf[4:12])
    fields, pos = [], 32
    while buf[pos] != 0x0D:
        name = buf[pos:pos + 11].split(b"\0")[0].decode()
        fields.append((name, buf[pos + 16]))
        pos += 32
    for i in range(n):
        rec, off, row = buf[header_len + i * rec_len: header_len + (i + 1) * rec_len], 1, {}
        for name, size in fields:
            row[name] = rec[off:off + size].decode("latin-1").strip()
            off += size
        yield row


def shp_rings(buf):
    pos = 100
    while pos < len(buf):
        _, words = struct.unpack(">ii", buf[pos:pos + 8])
        body = buf[pos + 8: pos + 8 + words * 2]
        pos += 8 + words * 2
        if struct.unpack("<i", body[:4])[0] != 5:
            yield []
            continue
        nparts, npoints = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{nparts}i", body[44:44 + 4 * nparts])) + [npoints]
        pts = struct.unpack(f"<{2 * npoints}d", body[44 + 4 * nparts: 44 + 4 * nparts + 16 * npoints])
        yield [[[round(pts[2 * j], 3), round(pts[2 * j + 1], 3)] for j in range(parts[k], parts[k + 1])] for k in range(nparts)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip")
    a = ap.parse_args()
    raw = pathlib.Path(a.zip).read_bytes() if a.zip else urllib.request.urlopen(URL, timeout=120).read()
    z = zipfile.ZipFile(io.BytesIO(raw))
    rows = list(dbf_records(z.read("cb_2023_us_county_20m.dbf")))
    rings = list(shp_rings(z.read("cb_2023_us_county_20m.shp")))
    counties = [{"geoid": r["GEOID"], "name": r["NAME"], "state": r["STUSPS"], "rings": g} for r, g in zip(rows, rings) if r["STUSPS"] in STATES and g]
    counties.sort(key=lambda c: c["geoid"])
    meta = {"source": "US Census Bureau, 2023 cartographic boundary file, counties (1:20,000,000)", "url": URL,
            "file": "cb_2023_us_county_20m.zip", "sha256": hashlib.sha256(raw).hexdigest(),
            "builtAt": dt.date.today().isoformat(), "states": sorted(STATES), "rule": "even-odd over rings; coordinates rounded to 3 decimals"}
    OUT.write_text(json.dumps({"meta": meta, "counties": counties}, separators=(",", ":")) + "\n")
    print(f"{len(counties)} counties → {OUT}")


if __name__ == "__main__":
    main()
