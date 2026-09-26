#!/usr/bin/env python3
"""Check that an excerpt appears verbatim (after normalization) in a cached source.

Usage: python3 scripts/ingest/find_excerpt.py <source-id> "exact excerpt text" [--page N]
Prints every page where it occurs, or NOT FOUND with the closest page by word overlap.
Search a keyword instead with --grep "word or phrase" to see surrounding context.
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from textnorm import normalize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
TEXT = ROOT / "data" / "sources" / ".cache" / "text"


def pages(source_id):
    d = TEXT / source_id
    if not d.exists():
        sys.exit(f"no cached text for {source_id}; run fetch_source.py first")
    for f in sorted(d.glob("*.txt")):
        page = int(f.stem[1:]) if f.stem.startswith("p") else None
        yield page, f.read_text(errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_id")
    ap.add_argument("excerpt", nargs="?")
    ap.add_argument("--page", type=int)
    ap.add_argument("--grep")
    a = ap.parse_args()

    if a.grep:
        needle = normalize(a.grep)
        for page, text in pages(a.source_id):
            n = normalize(text)
            i = n.find(needle)
            while i != -1:
                print(f"[page {page}] ...{n[max(0, i - 220):i + len(needle) + 220]}...\n")
                i = n.find(needle, i + 1)
        return

    needle = normalize(a.excerpt)
    hits, best = [], (0.0, None)
    words = set(needle.split())
    for page, text in pages(a.source_id):
        n = normalize(text)
        if needle in n:
            hits.append(page)
        elif words:
            overlap = len(words & set(n.split())) / len(words)
            if overlap > best[0]:
                best = (overlap, page)
    if hits:
        ok = a.page is None or a.page in hits
        print(f"FOUND on page(s) {hits}" + ("" if ok else f"  (WARNING: not on requested page {a.page})"))
        sys.exit(0 if ok else 2)
    print(f"NOT FOUND. closest page {best[1]} word-overlap {best[0]:.0%}")
    sys.exit(1)


if __name__ == "__main__":
    main()
