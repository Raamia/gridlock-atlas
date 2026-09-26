#!/usr/bin/env python3
"""Re-create the source cache on a fresh clone from data/manifest.json and check hashes.

  python3 scripts/ingest/fetch_all.py [--local-pdf path/to/2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf]

Sources that are not directly downloadable (the Georgia PSC docket package) need --local-pdf.
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
    ap.add_argument("--local-pdf")
    a = ap.parse_args()
    manifest = json.load(open(ROOT / "data" / "manifest.json"))
    changed, failed = [], []
    for s in manifest:
        cmd = [sys.executable, str(ROOT / "scripts/ingest/fetch_source.py"), "--id", s["id"], "--url", s["url"],
               "--publisher", s["publisher"], "--title", s["title"], "--source-type", s["sourceType"]]
        if s.get("localCopy"):
            if not a.local_pdf:
                print(f"skip {s['id']}: supply --local-pdf (from Georgia PSC Docket 56002 filing 221233)")
                continue
            cmd += ["--file", a.local_pdf]
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
