#!/usr/bin/env python3
"""Re-create the source cache on a fresh clone from data/manifest.json and check hashes.

  python3 scripts/ingest/fetch_all.py [--local gpc-irp-2025-vol3="path/to/2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"] ...

Sources that are not directly downloadable (e.g. the Georgia PSC docket package) need --local ID=PATH;
local-copy sources without a mapping are skipped (never filled with another document).
A hash mismatch means the publisher changed the document since the snapshot: the app keeps using
the frozen snapshot, and the changed source should be reviewed before rebuilding.
"""
import argparse
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="append", default=[], help="SOURCE_ID=PATH for a local copy of one source")
    a = ap.parse_args()
    local = dict(x.split("=", 1) for x in a.local)
    manifest = json.load(open(ROOT / "data" / "manifest.json"))
    changed, failed = [], []
    for s in manifest:
        cmd = [sys.executable, str(ROOT / "scripts/ingest/fetch_source.py"), "--id", s["id"], "--url", s["url"],
               "--publisher", s["publisher"], "--title", s["title"], "--source-type", s["sourceType"]]
        if s.get("localCopy"):
            if s["id"] not in local:
                print(f"skip {s['id']}: supply --local {s['id']}=PATH (see its source page: {s['url']})")
                continue
            cmd += ["--file", local[s["id"]]]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            failed.append(s["id"])
            print(f"FAIL {s['id']}: {r.stderr.strip().splitlines()[-1] if r.stderr else 'error'}")
            continue
        meta = json.loads(r.stdout)
        status = "ok" if meta["sha256"] == s["sha256"] else "CHANGED since snapshot"
        if status != "ok":
            changed.append(s["id"])
        print(f"{status:24s} {s['id']}")
    print(f"\n{len(manifest)} sources · {len(changed)} changed · {len(failed)} failed")


if __name__ == "__main__":
    main()
