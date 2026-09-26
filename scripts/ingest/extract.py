#!/usr/bin/env python3
"""Structured model extraction for one cached source page (plan.md §7, P0 #7).

  python3 scripts/ingest/extract.py desc-scrtp-2026-2030 --page 41                    # OpenAI (default)
  python3 scripts/ingest/extract.py desc-scrtp-2026-2030 --page 41 --provider gemini  # Google Gemini

Keys come from the environment or .env.local (OPENAI_API_KEY / GEMINI_API_KEY; server-side only, never
committed). Models: --model, else OPENAI_MODEL (default gpt-5.5) / GEMINI_MODEL (default gemini-2.5-flash).

The model returns typed fields plus an exact supporting excerpt for each. Every excerpt is then
checked verbatim against the cached page text; fields whose quote cannot be located are marked
`located: false` and never enter the snapshot as facts. Each located excerpt is also compared with
the excerpts the snapshot already cites on that page (`inSnapshot`), an independent cross-check of the
deterministic parse. The run (provider, model, prompt version, output, validation) is written to
data/extractions/<source>-p<page>.json and shown in the Method drawer.
Deterministic code — not the model — computes every overlap.
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from textnorm import normalize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "sources" / ".cache"
OUT = ROOT / "data" / "extractions"
SNAPSHOT = ROOT / "data" / "snapshot.json"
PROMPT_VERSION = "gridlock-extract/1.1"
DEFAULT_MODEL = {"openai": "gpt-5.5", "gemini": "gemini-2.5-flash"}

FIELDS = ["utility", "projectTitle", "projectId", "status", "constructionStart", "constructionEnd", "inServiceDate",
          "lengthMiles", "voltageKv", "estimatedCost", "coordinationMention"]

PROMPT = """You extract facts from ONE page of a public electric-utility transmission planning document.
Return JSON matching the schema. For every field give `value` and `excerpt`, where `excerpt` is copied
VERBATIM from the page text (8–40 words) and directly supports the value. If the page does not state a
field, return null for it — never infer a month, a coordinate, a construction window from an in-service
date, or a lack of coordination. If the page lists several projects, extract the first complete one.
namedFacilities: substations, switching stations or plants named as project terminals.
coordinationMention: only an explicit statement about coordinating with another utility."""


# ---------------------------------------------------------------- schemas (one per provider dialect)

def openai_schema():
    fact = {"type": "object", "properties": {"value": {"type": "string"}, "excerpt": {"type": "string"}},
            "required": ["value", "excerpt"], "additionalProperties": False}
    nullable = {"anyOf": [fact, {"type": "null"}]}
    props = {k: nullable for k in FIELDS}
    props["namedFacilities"] = {"type": "array", "items": fact}
    # strict structured outputs: every property is required; absent facts are null
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def gemini_schema():
    fact = {"type": "OBJECT", "nullable": True, "properties": {"value": {"type": "STRING"}, "excerpt": {"type": "STRING"}},
            "required": ["value", "excerpt"]}
    props = {k: fact for k in FIELDS}
    props["namedFacilities"] = {"type": "ARRAY", "items": fact}
    return {"type": "OBJECT", "properties": props, "required": ["utility", "projectTitle", "status", "inServiceDate", "namedFacilities"]}


# ---------------------------------------------------------------- providers

def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"{url}: HTTP {e.code}: {e.read().decode(errors='replace')[:600]}")


def run_openai(model, text, key, effort):
    body = {
        "model": model,
        "input": [{"role": "developer", "content": PROMPT}, {"role": "user", "content": "PAGE TEXT:\n" + text}],
        "text": {"format": {"type": "json_schema", "name": "page_facts", "strict": True, "schema": openai_schema()}},
    }
    if effort:
        body["reasoning"] = {"effort": effort}
    raw = post("https://api.openai.com/v1/responses", body, {"Authorization": f"Bearer {key}"})
    if raw.get("status") != "completed":
        sys.exit(f"OpenAI response status {raw.get('status')}: {json.dumps(raw.get('incomplete_details') or raw.get('error'))}")
    parts = [c for item in raw.get("output", []) if item.get("type") == "message" for c in item.get("content", [])]
    refusal = next((c.get("refusal") for c in parts if c.get("type") == "refusal"), None)
    if refusal:
        sys.exit(f"OpenAI refused: {refusal}")
    out_text = next(c["text"] for c in parts if c.get("type") == "output_text")
    return json.loads(out_text), raw.get("model", model), raw.get("usage")


def run_gemini(model, text, key, _effort):
    body = {
        "contents": [{"parts": [{"text": PROMPT + "\n\nPAGE TEXT:\n" + text}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": gemini_schema(), "temperature": 0},
    }
    raw = post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body, {"x-goog-api-key": key})
    return json.loads(raw["candidates"][0]["content"]["parts"][0]["text"]), raw.get("modelVersion", model), raw.get("usageMetadata")


PROVIDERS = {"openai": (run_openai, "OPENAI_API_KEY", "OPENAI_MODEL"), "gemini": (run_gemini, "GEMINI_API_KEY", "GEMINI_MODEL")}


# ---------------------------------------------------------------- helpers

def load_env_local():
    """Read KEY=value lines from .env.local (tolerates `export`, spaces and quotes); the environment wins."""
    f = ROOT / ".env.local"
    if not f.exists():
        return
    for line in f.read_text().splitlines():
        m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if m and not line.lstrip().startswith("#"):
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def snapshot_excerpts(source_id, page):
    if not SNAPSHOT.exists():
        return []
    ev = json.loads(SNAPSHOT.read_text())["evidence"]
    return [normalize(e["exactExcerpt"]) for e in ev.values() if e["sourceId"] == source_id and e.get("page") == page]


def same_passage(a, cited):
    """The model's excerpt and a snapshot excerpt quote the same passage (one contains the other)."""
    return any(len(c) >= 12 and (a in c or c in a) for c in cited)


def main():
    load_env_local()
    ap = argparse.ArgumentParser()
    ap.add_argument("source_id")
    ap.add_argument("--page", type=int, required=True)
    ap.add_argument("--provider", choices=list(PROVIDERS), default=os.environ.get("EXTRACT_PROVIDER") or ("openai" if os.environ.get("OPENAI_API_KEY") else "gemini"))
    ap.add_argument("--model")
    ap.add_argument("--effort", choices=["minimal", "low", "medium", "high"], help="OpenAI reasoning effort (default: the model's)")
    a = ap.parse_args()
    run, key_var, model_var = PROVIDERS[a.provider]
    key = os.environ.get(key_var)
    if not key:
        sys.exit(f"Set {key_var} in the environment or .env.local (server-side only; never commit it).")
    model = a.model or os.environ.get(model_var) or DEFAULT_MODEL[a.provider]

    page_file = CACHE / "text" / a.source_id / f"p{a.page:04d}.txt"
    if not page_file.exists():
        sys.exit(f"No cached text for {a.source_id} p.{a.page} ({page_file}); fetch the source first.")
    text = page_file.read_text()
    out, resolved, usage = run(model, text, key, a.effort)

    page_norm = normalize(text)
    cited = snapshot_excerpts(a.source_id, a.page)
    fields = []

    def add(name, f):
        if not f:
            return
        ex = f.get("excerpt", "") or ""
        located = bool(ex) and normalize(ex) in page_norm
        fields.append({"field": name, "value": str(f.get("value", "")), "excerpt": ex, "located": located,
                       "inSnapshot": located and same_passage(normalize(ex), cited), "humanChecked": False})

    for k, v in out.items():
        if isinstance(v, list):
            for i, item in enumerate(v):
                add(f"{k}[{i}]", item)
        else:
            add(k, v)

    n_loc = sum(f["located"] for f in fields)
    n_snap = sum(f["inSnapshot"] for f in fields)
    OUT.mkdir(parents=True, exist_ok=True)
    record = {
        "id": f"{a.source_id}-p{a.page}", "sourceId": a.source_id, "page": a.page, "provider": a.provider, "model": resolved,
        "promptVersion": PROMPT_VERSION, "runAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "status": "completed",
        "fields": fields,
        "usage": usage,
        "note": f"Page {a.page}. {n_loc}/{len(fields)} excerpts located verbatim (unlocated fields are rejected); "
                f"{n_snap} of the located excerpts quote a passage the snapshot already cites on this page.",
    }
    (OUT / f"{a.source_id}-p{a.page}.json").write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps({k: record[k] for k in ("id", "provider", "model", "note")}, indent=1))
    for f in fields:
        mark = "✓" if f["located"] else "✗"
        print(f"  {mark} {'S' if f['inSnapshot'] else ' '} {f['field']:<22} {f['value'][:70]}")


if __name__ == "__main__":
    main()
