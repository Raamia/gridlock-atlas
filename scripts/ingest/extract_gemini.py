#!/usr/bin/env python3
"""Gemini structured extraction for one cached source page (plan.md §7, P0 #7).

  GEMINI_API_KEY=... python3 scripts/ingest/extract_gemini.py desc-scrtp-2026-2030 --page 41

The model returns typed fields plus an exact supporting excerpt for each. Every excerpt is then
checked verbatim against the cached page text; fields whose quote cannot be located are marked
`located: false` and never enter the snapshot as facts. The run (model, prompt version, output,
validation) is written to data/extractions/<source>-p<page>.json and shown in the Method drawer.
Deterministic code — not the model — computes every overlap.
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from textnorm import normalize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "sources" / ".cache"
OUT = ROOT / "data" / "extractions"
PROMPT_VERSION = "gridlock-extract/1.0"

FIELD = {"type": "OBJECT", "nullable": True, "properties": {"value": {"type": "STRING"}, "excerpt": {"type": "STRING"}}, "required": ["value", "excerpt"]}
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "utility": FIELD, "projectTitle": FIELD, "projectId": FIELD, "status": FIELD,
        "constructionStart": FIELD, "constructionEnd": FIELD, "inServiceDate": FIELD,
        "namedFacilities": {"type": "ARRAY", "items": FIELD},
        "lengthMiles": FIELD, "voltageKv": FIELD, "estimatedCost": FIELD,
        "coordinationMention": FIELD,
    },
    "required": ["utility", "projectTitle", "status", "inServiceDate", "namedFacilities"],
}
PROMPT = """You extract facts from ONE page of a public electric-utility transmission planning document.
Return JSON matching the schema. For every field give `value` and `excerpt`, where `excerpt` is copied
VERBATIM from the page text (8–40 words) and directly supports the value. If the page does not state a
field, return null for it — never infer a month, a coordinate, a construction window from an in-service
date, or a lack of coordination. namedFacilities: substations, switching stations or plants named as
project terminals. coordinationMention: only an explicit statement about coordinating with another utility.

PAGE TEXT:
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_id")
    ap.add_argument("--page", type=int, required=True)
    ap.add_argument("--model", default=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
    a = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("Set GEMINI_API_KEY (server-side only; never commit it).")

    text = (CACHE / "text" / a.source_id / f"p{a.page:04d}.txt").read_text()
    body = {
        "contents": [{"parts": [{"text": PROMPT + text}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA, "temperature": 0},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = json.loads(resp.read())
    out = json.loads(raw["candidates"][0]["content"]["parts"][0]["text"])

    page_norm = normalize(text)
    fields = []

    def add(name, f):
        if not f:
            return
        fields.append({"field": name, "value": str(f.get("value", "")), "excerpt": f.get("excerpt", ""),
                       "located": bool(f.get("excerpt")) and normalize(f["excerpt"]) in page_norm, "humanChecked": False})

    for k, v in out.items():
        if isinstance(v, list):
            for i, item in enumerate(v):
                add(f"{k}[{i}]", item)
        else:
            add(k, v)

    OUT.mkdir(parents=True, exist_ok=True)
    run = {
        "id": f"{a.source_id}-p{a.page}", "sourceId": a.source_id, "model": a.model, "promptVersion": PROMPT_VERSION,
        "runAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "status": "completed",
        "fields": fields,
        "note": f"Page {a.page}. {sum(f['located'] for f in fields)}/{len(fields)} excerpts located verbatim; unlocated fields are rejected.",
    }
    (OUT / f"{a.source_id}-p{a.page}.json").write_text(json.dumps(run, indent=1))
    print(json.dumps(run, indent=1))


if __name__ == "__main__":
    main()
