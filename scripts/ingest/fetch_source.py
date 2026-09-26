#!/usr/bin/env python3
"""Fetch one public source, hash it, and cache per-page text for citation checks.

Usage:
  python3 scripts/ingest/fetch_source.py --id psc-1515-ce-103-final \
      --url "https://..." --publisher "Public Service Commission of Wisconsin" \
      --title "Final Decision, docket 1515-CE-103" --source-type regulator

Writes (all under data/sources/.cache/, which is git-ignored):
  raw/<id>.<pdf|html>          original bytes (never republished)
  text/<id>/p0001.txt ...      one file per PDF page (pdftotext default mode)
  text/<id>/html.txt           visible text for HTML pages
  meta/<id>.json               url, publisher, sha256, retrievedAt, pageCount ...
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "sources" / ".cache"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template"}
    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br",
             "section", "article", "header", "footer", "td", "th", "dt", "dd"}

    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

    def text(self):
        lines = [" ".join(l.split()) for l in "".join(self.parts).splitlines()]
        return "\n".join(l for l in lines if l)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--publisher", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--source-type", required=True, choices=["utility", "regulator", "rto"])
    ap.add_argument("--published-at")
    ap.add_argument("--updated-at")
    ap.add_argument("--file", help="use a local copy (e.g. a document supplied in the challenge packet) instead of downloading")
    a = ap.parse_args()

    if a.file:
        body = pathlib.Path(a.file).read_bytes()
        ctype = "application/pdf" if body[:5] == b"%PDF-" else "text/html"
    else:
        req = urllib.request.Request(a.url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "").split(";")[0].strip()
    is_pdf = body[:5] == b"%PDF-" or ctype == "application/pdf"
    ext = "pdf" if is_pdf else "html"

    for sub in ("raw", "text", "meta"):
        (CACHE / sub).mkdir(parents=True, exist_ok=True)
    raw = CACHE / "raw" / f"{a.id}.{ext}"
    raw.write_bytes(body)
    tdir = CACHE / "text" / a.id
    tdir.mkdir(parents=True, exist_ok=True)
    for old in tdir.glob("*.txt"):
        old.unlink()

    pages = None
    if is_pdf:
        info = subprocess.run(["pdfinfo", str(raw)], capture_output=True, text=True).stdout
        pages = int(next(l.split()[-1] for l in info.splitlines() if l.startswith("Pages:")))
        for i in range(1, pages + 1):
            subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), str(raw),
                            str(tdir / f"p{i:04d}.txt")], check=True)
    else:
        p = _Text()
        p.feed(body.decode("utf-8", errors="replace"))
        (tdir / "html.txt").write_text(p.text())

    meta = {
        "id": a.id, "url": a.url, "publisher": a.publisher, "title": a.title,
        "sourceType": a.source_type, "publishedAt": a.published_at, "updatedAt": a.updated_at,
        "retrievedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": hashlib.sha256(body).hexdigest(),
        "mimeType": "application/pdf" if is_pdf else "text/html",
        "bytes": len(body), "pageCount": pages,
        "localCopy": bool(a.file),
    }
    (CACHE / "meta" / f"{a.id}.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
