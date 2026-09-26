#!/usr/bin/env python3
"""Extraction agreement: GPT-5.5 with the frozen extract.py prompt vs the deterministic Region B parse, page by page.

  npm run extract:eval -- list                    # page inventory and cost projection (no API calls)
  npm run extract:eval -- run --max-usd 15        # every in-scope page not yet run (resumable; stops at the budget)
  npm run extract:eval -- score                   # data/eval/extraction/runs → data/eval/extraction-eval.{json,md}

Runs go to data/eval/extraction/runs/, never data/extractions/ (the app's showcase runs). Model values never enter the
snapshot. The reference is the parse (data/region-b/parsed.json), not human labels, so the metric is agreement:
  DESC (SCRTP lists, 3 editions): title, Project ID, status, planned in-service date, total cost, miles when stated
  GPC  (Ten-Year Plan pages, sponsor GPC or SAV): title, TEAMS #, Need Date (as in-service), Start Date, miles, cost REDACTED
  voltage: the kV classes in the title (description only if the title has none); named facilities: the snapshot's
  terminals for the page's project, else the geocoding batch, else a title split (a weaker reference, reported apart).
constructionEnd and coordinationMention are stated on none of these pages, so they measure abstention only.
"""
import argparse
import collections
import concurrent.futures as cf
import csv
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import re
import sys
import threading
import time
import unicodedata

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import extract as ex  # noqa: E402  (read-only: its main() writes data/extractions and is never called)

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "sources" / ".cache" / "text"
PARSED = ROOT / "data" / "region-b" / "parsed.json"
SNAPSHOT = ROOT / "data" / "snapshot.json"
BATCHES = ROOT / "data" / "region-b" / "geo"
OUT = ROOT / "data" / "eval" / "extraction"
RESULT = ROOT / "data" / "eval" / "extraction-eval.json"
ADJUDICATION = OUT / "adjudication.json"
REPORT = ROOT / "data" / "eval" / "extraction-eval.md"
IN_SCOPE_GPC = {"GPC", "SAV"}
# planning price (an assumption for the cost estimate, not a fact shown in the app); cached input is billed at the full rate (upper bound)
PRICE = {"model": "gpt-5.5", "url": "https://developers.openai.com/api/docs/models/gpt-5.5", "retrievedAt": "2026-09-26",
         "excerpt": "Price $5 • $30 Input • Output", "inputPerM": 5.0, "outputPerM": 30.0}
FALLBACK_TOKENS = (815, 790)  # mean input/output tokens per page over the 6 validation runs

# ------------------------------------------------------------------ normalizers
KV_CLASSES = {12, 25, 34, 44, 46, 69, 100, 115, 138, 161, 230, 345, 500, 765}
MONTHS = {m.lower(): i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                               "September", "October", "November", "December"], 1)}
GENERIC = r"\b(substations?|sub|switching station|switchyard|switch station|station|line terminal|terminal|tap|structure)\b"


def norm_text(s):
    if s is None:
        return None
    s = unicodedata.normalize("NFKC", str(s)).lower()
    s = re.sub(r"[‐‑‒–—−]", "-", s)
    s = re.sub(r"(?<=\d)o\b|(?<=\d)o(?=\s*kv)", "0", s)  # OCR: "23O KV" -> "230 kv"
    s = re.sub(r"(\d)\s*kv\b", r"\1 kv", s)
    s = re.sub(r"[^0-9a-z#&/\- ]+", " ", s)
    s = re.sub(r"\s*-\s*", " - ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_zone(s):
    """'sav: goshen ...' -> without the planning-area prefix."""
    return re.sub(r"^(?:[a-z]{2,4})\s*(?::|\s-\s)\s*", "", s) if s else s


def tokens(s):
    return [t for t in re.split(r"[\s\-/]+", s or "") if t]


def token_f1(a, b):
    ta, tb = collections.Counter(tokens(a)), collections.Counter(tokens(b))
    inter = sum((ta & tb).values())
    if not inter:
        return 0.0
    p, r = inter / sum(ta.values()), inter / sum(tb.values())
    return 2 * p * r / (p + r)


def norm_id(s):
    return re.sub(r"[^0-9a-z]", "", str(s).lower()) if s not in (None, "") else None


def parse_date(s):
    """-> (earliest ISO, latest ISO) or None. Days are kept as written (DESC prints '04/31/26')."""
    if not s:
        return None
    t = str(s).strip()
    m = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b", t)
    if m:
        y = m[3] if len(m[3]) == 4 else f"20{m[3]}"
        iso = f"{y}-{int(m[1]):02d}-{int(m[2]):02d}"
        return iso, iso
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
    if m:
        return m[0], m[0]
    m = re.search(r"\b([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\b", t)
    if m and m[1].lower() in MONTHS:
        iso = f"{m[3]}-{MONTHS[m[1].lower()]:02d}-{int(m[2]):02d}"
        return iso, iso
    m = re.search(r"\b([A-Za-z]+)\s+(\d{4})\b", t)
    if m and m[1].lower() in MONTHS:
        mo = MONTHS[m[1].lower()]
        return f"{m[2]}-{mo:02d}-01", f"{m[2]}-{mo:02d}-31"
    m = re.search(r"\b(?:19|20)\d{2}\b", t)
    if m:
        return f"{m[0]}-01-01", f"{m[0]}-12-31"
    return None


def parse_kv(s):
    """kV classes written with a kV unit (the reference: a page's title, else its description)."""
    if not s:
        return set()
    out = set()
    for m in re.finditer(r"(\d{2,3})(?:\s*[/-]\s*(\d{2,3}))?(?:\s*[/-]\s*(\d{2,3}))?\s*kv", norm_text(s)):
        out |= {int(x) for x in m.groups() if x and int(x) in KV_CLASSES}
    return out


def parse_cost(s):
    if s in (None, ""):
        return None
    t = str(s)
    if re.search(r"redacted", t, re.I):
        return "REDACTED"
    m = re.search(r"\$?\s*([\d,]+(?:\.\d+)?)\s*(million|m\b|k\b|thousand)?", t, re.I)
    if not m:
        return None
    v = float(m[1].replace(",", ""))
    unit = (m[2] or "").lower()
    return round(v * (1e6 if unit in ("million", "m") else 1e3 if unit in ("k", "thousand") else 1))


def norm_facility(s):
    s = norm_text(re.sub(r"\(.*?\)", " ", s or ""))
    s = re.sub(r"\b\d{2,3}(?:/\d{2,3})*\s*kv\b", " ", s)
    s = re.sub(GENERIC, " ", s)
    s = re.sub(r"#\s*\d+\b|\bnew\b|\bexisting\b", " ", s)
    return re.sub(r"\s+", " ", s).strip(" -")


def facility_match(a, b):
    ta, tb = tokens(a), tokens(b)
    return bool(ta and tb) and (ta == tb or ta[: len(tb)] == tb or tb[: len(ta)] == ta)


# ------------------------------------------------------------------ reference (deterministic parse)
def page_inventory(scope):
    d = json.loads(PARSED.read_text())
    pages = [{"sourceId": src, "page": int(r["page"]), "utility": "desc", "rec": r} for src, rows in d["desc"].items() for r in rows]
    pages += [{"sourceId": r["sourceId"], "page": int(r["page"]), "utility": "gpc", "rec": r} for r in d["gpc"]
              if scope == "all" or r["sponsor"] in IN_SCOPE_GPC]
    return pages


def snapshot_facilities():
    """(sourceId, page) -> terminal labels of the snapshot project whose title (or a dated claim) cites that page."""
    s = json.loads(SNAPSHOT.read_text())
    ev, out = s["evidence"], {}
    for p in s["projects"]:
        labels = [pl["label"] for pl in p["places"] if pl["precision"] != "county"]
        if not labels:
            continue
        ids = list(p.get("titleEvidenceIds", [])) + [i for c in p["completionClaims"] for i in c.get("evidenceIds", [])]
        for i in ids:
            e = ev.get(i)
            if e and e.get("page") is not None:
                out.setdefault((e["sourceId"], e["page"]), labels)
    return out


def batch_facilities():
    out = {}
    for f in BATCHES.glob("*.json"):
        for p in json.loads(f.read_text()).get("projects", []):
            names = [e["name"] for e in p.get("endpoints", []) if e.get("name")]
            if names and p.get("key"):
                out[p["key"]] = names
    return out


def title_terminals(title):
    t = re.split(r":", re.sub(r"^[A-Z]{2,4}:\s*", "", title))[0]
    parts = re.split(r"\s+[-–]\s+|\s*–\s*", t)
    if len(parts) < 2:
        return []
    return [re.sub(r"\b\d{2,3}(?:/\d{2,3})*\s*k?v\b.*$", "", x, flags=re.I).strip() for x in parts[:2]]


def reference(pg, snapfac, batchfac):
    r = pg["rec"]
    # the project's own class is in its title; descriptions also name neighbouring equipment
    kv = parse_kv(r["title"]) or parse_kv(r.get("description", ""))
    ref = {"projectTitle": r["title"], "voltageKv": sorted(kv) or None, "lengthMiles": r.get("miles"),
           "constructionEnd": None, "coordinationMention": None}
    if pg["utility"] == "desc":
        ref.update(projectId=r["projectId"], status=r.get("status"), inServiceDate=r.get("inService"),
                   estimatedCost=(r.get("costs") or {}).get("Total"), constructionStart=None)
        bkey = f"desc:{r['projectId']}"
    else:
        text = ex.normalize((CACHE / pg["sourceId"] / f"p{pg['page']:04d}.txt").read_text())
        redacted = "estimated cost - gpc redacted" in text
        ref.update(projectId=r["teams"], status=None, inServiceDate=r.get("need"), constructionStart=r.get("start"), estimatedCost="REDACTED" if redacted else None)
        bkey = f"gpc:{r['teams']}"
    fac, src = snapfac.get((pg["sourceId"], pg["page"])), "snapshot"
    if not fac and bkey in batchfac:
        fac, src = batchfac[bkey], "geocode-batch"
    if not fac:
        fac, src = title_terminals(r["title"]), "title-split"
    ref["namedFacilities"], ref["_facilitySource"] = fac or None, src
    return ref


# ------------------------------------------------------------------ scoring
SCALAR = ["projectTitle", "projectId", "status", "inServiceDate", "constructionStart", "constructionEnd", "voltageKv", "lengthMiles",
          "estimatedCost", "coordinationMention"]


def compare(field, ref, got):
    """-> 'agree' | 'near' | 'disagree' (both stated)."""
    if field == "projectTitle":
        a, b = norm_text(ref), norm_text(got)
        if a == b:
            return "agree"
        if strip_zone(a) == strip_zone(b):
            return "near"  # planning-area prefix ("SAV:") dropped
        return "near" if token_f1(strip_zone(a), strip_zone(b)) >= 0.8 else "disagree"
    if field == "projectId":
        return "agree" if norm_id(ref) == norm_id(re.sub(r"^\s*(?:teams|project id)\s*#?\s*", "", str(got), flags=re.I)) else "disagree"
    if field == "status":
        return "agree" if norm_text(ref) == norm_text(got) else "disagree"
    if field in ("inServiceDate", "constructionStart"):
        g = parse_date(got)
        if not g:
            return "disagree"
        if g[0] == ref == g[1]:
            return "agree"
        # a coarser date that holds the parse's, or several listed dates (phases) of which one is the parse's
        return "near" if any(d and d[0] <= ref <= d[1] for d in map(parse_date, re.split(r"\band\b|;", str(got)))) else "disagree"
    if field == "voltageKv":
        g = {int(x) for x in re.findall(r"(?<![\d.])(\d{2,3})(?![\d.])", str(got)) if int(x) in KV_CLASSES}
        if set(ref) == g:
            return "agree"
        return "near" if g and max(g) == max(ref) else "disagree"
    if field == "lengthMiles":
        nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(got).replace(",", ""))]
        close = [abs(g - float(ref)) <= max(0.05, 0.01 * float(ref)) for g in nums]
        return "agree" if close and close[0] else "near" if any(close) else "disagree"
    if field == "estimatedCost":
        g = parse_cost(got)
        if ref == "REDACTED" or g == "REDACTED":
            return "agree" if g == ref else "disagree"
        return "agree" if g is not None and abs(g - ref) <= 1 else "disagree"
    raise ValueError(field)


def wilson(k, n, z=1.96):
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 3), round(min(1.0, c + h), 3)]


def rate(k, n):
    return {"k": k, "n": n, "rate": round(k / n, 3) if n else None, "ci95": wilson(k, n)}


def usd(inp, out):
    return round(inp / 1e6 * PRICE["inputPerM"] + out / 1e6 * PRICE["outputPerM"], 4)


def outcome_of(field, r, g, located):
    if r in (None, "", []) and g in (None, ""):
        return "both-null"
    if r in (None, "", []):
        return "extra-located" if located else "extra-unlocated"
    if g in (None, "") and r == "REDACTED":
        return "abstained-redacted"  # the public disclosure redacts GPC costs; null is an acceptable answer
    if g in (None, ""):
        return "missed"
    out = compare(field, r, g)
    return "disagree-unlocated" if out == "disagree" and not located else out


def score(runs, pages, snapfac, batchfac):
    idx = {(p["sourceId"], p["page"]): p for p in pages}
    cells = collections.defaultdict(collections.Counter)
    fac = collections.defaultdict(collections.Counter)
    ex_stats = collections.defaultdict(collections.Counter)
    disagreements, usage, models, prompts, errors = [], collections.Counter(), collections.Counter(), collections.Counter(), []
    for run in runs:
        if run.get("error"):
            errors.append({"id": run["id"], "error": run["error"]})
            continue
        pg = idx.get((run["sourceId"], run["page"]))
        if not pg:
            continue
        u = pg["utility"]
        ref = reference(pg, snapfac, batchfac)
        vals = {f["field"]: f for f in run["fields"] if not f["field"].startswith("namedFacilities[")}
        mfac = [f for f in run["fields"] if f["field"].startswith("namedFacilities[")]
        models[run["model"]] += 1
        prompts[run["promptVersion"]] += 1
        us = run.get("usage") or {}
        usage["pages"] += 1
        usage["input"] += us.get("input_tokens", 0) or 0
        usage["output"] += us.get("output_tokens", 0) or 0
        usage["reasoning"] += (us.get("output_tokens_details") or {}).get("reasoning_tokens", 0) or 0
        usage["cachedInput"] += (us.get("input_tokens_details") or {}).get("cached_tokens", 0) or 0
        for f in run["fields"]:
            for key in ("all", u):
                ex_stats[key]["fields"] += 1
                ex_stats[key]["located"] += bool(f.get("located"))
                ex_stats[key]["inSnapshot"] += bool(f.get("inSnapshot"))
        for field in SCALAR:
            if field == "status" and u == "gpc":
                continue  # Ten-Year Plan pages publish no project status
            f = vals.get(field)
            g = f["value"] if f else None
            located = bool(f and f.get("located"))
            out = outcome_of(field, ref.get(field), g, located)
            cells[(u, field)][out] += 1
            if out not in ("agree", "both-null", "abstained-redacted"):
                disagreements.append({"utility": u, "sourceId": run["sourceId"], "page": run["page"], "field": field, "outcome": out,
                                      "reference": json.dumps(ref.get(field), ensure_ascii=False), "model": g,
                                      "excerpt": (f or {}).get("excerpt", "")[:200], "located": located})
        rf = [x for x in (norm_facility(y) for y in (ref["namedFacilities"] or [])) if x]
        mf = [x for x in (norm_facility(f["value"]) for f in mfac) if x]
        key = (u, ref["_facilitySource"])
        fac[key]["pages"] += 1
        fac[key]["model"] += len(mf)
        fac[key]["reference"] += len(rf)
        fac[key]["modelMatched"] += sum(any(facility_match(m, r) for r in rf) for m in mf)
        fac[key]["referenceMatched"] += sum(any(facility_match(r, m) for m in mf) for r in rf)
        fac[key]["modelUnlocated"] += sum(not f.get("located") for f in mfac)

    fields = {}
    tot = collections.Counter()
    for (u, field), c in sorted(cells.items()):
        dis = c["disagree"] + c["disagree-unlocated"]
        both = c["agree"] + c["near"] + dis
        abst = c["both-null"] + c["extra-located"] + c["extra-unlocated"]
        fields[f"{u}.{field}"] = {
            "utility": u, "field": field, "counts": dict(c), "stated": both + c["missed"] + c["abstained-redacted"],
            "exact": rate(c["agree"], both), "lenient": rate(c["agree"] + c["near"], both),
            "recallWhenStated": rate(c["agree"] + c["near"], both + c["missed"]), "abstention": rate(c["both-null"], abst),
        }
        for k, v in c.items():
            tot[k] += v
    dis = tot["disagree"] + tot["disagree-unlocated"]
    both = tot["agree"] + tot["near"] + dis
    fac_table = {}
    for (u, src), c in sorted(fac.items()):
        fac_table[f"{u}.{src}"] = {**dict(c), "modelInReference": rate(c["modelMatched"], c["model"]), "referenceNamed": rate(c["referenceMatched"], c["reference"])}
    cost = usd(usage["input"], usage["output"])
    return {
        "pagesScored": usage["pages"], "errors": errors, "models": dict(models), "promptVersions": dict(prompts),
        "tokens": {k: usage[k] for k in ("input", "output", "reasoning", "cachedInput")},
        "estimatedCostUsd": cost, "price": PRICE,
        "verbatimQuote": {k: rate(v["located"], v["fields"]) for k, v in sorted(ex_stats.items())},
        "quotesSnapshotPassage": {k: rate(v["inSnapshot"], v["located"]) for k, v in sorted(ex_stats.items())},
        "overall": {
            "exact": rate(tot["agree"], both), "lenient": rate(tot["agree"] + tot["near"], both),
            "recallWhenStated": rate(tot["agree"] + tot["near"], both + tot["missed"]),
            "missed": tot["missed"], "disagreeWithVerbatimQuote": tot["disagree"], "disagreeUnlocatedQuote": tot["disagree-unlocated"],
            "extraWithVerbatimQuote": tot["extra-located"], "extraUnlocatedQuote": tot["extra-unlocated"],
            "abstention": rate(tot["both-null"], tot["both-null"] + tot["extra-located"] + tot["extra-unlocated"]),
        },
        "fields": fields, "namedFacilities": fac_table, "adjudication": adjudicate(disagreements),
        "gpcCost": {"pages": sum(cells[("gpc", "estimatedCost")][k] for k in ("agree", "abstained-redacted", "disagree", "disagree-unlocated", "missed")),
                    **{k: cells[("gpc", "estimatedCost")][k] for k in ("agree", "abstained-redacted", "disagree", "disagree-unlocated")}},
    }, disagreements


def adjudicate(dis):
    """Label every non-agreement with the page-based verdict in adjudication.json (items by page, rules for systematic cases)."""
    if not ADJUDICATION.exists():
        return None
    adj = json.loads(ADJUDICATION.read_text())
    items = {(i["sourceId"], i["page"], i["field"]): i for i in adj["items"]}
    missing = [f"{i['sourceId']} p{i['page']} {i['field']}" for i in adj["items"]
               if ex.normalize(i["pageExcerpt"]) not in ex.normalize((CACHE / i["sourceId"] / f"p{i['page']:04d}.txt").read_text())]
    counts, used = collections.Counter(), set()
    for d in dis:
        k = (d["sourceId"], d["page"], d["field"])
        rule = next((r for r in adj["rules"] if r["field"] == d["field"] and r["outcome"] == d["outcome"] and r.get("utility", d["utility"]) == d["utility"]), None)
        d["adjudication"] = items[k]["verdict"] if k in items else rule["verdict"] if rule else "not adjudicated"
        used.add(k)
        counts[d["adjudication"]] += 1
    return {"reviewer": adj["reviewer"], "verdicts": adj["verdicts"], "rules": adj["rules"], "counts": dict(counts),
            "excerptsVerified": len(adj["items"]) - len(missing), "excerptsNotFound": missing,
            "stale": [f"{k[0]} p{k[1]} {k[2]}" for k in items if k not in used]}


# ------------------------------------------------------------------ report
def pct(r):
    if not r or r["rate"] is None:
        return "–"
    lo, hi = r["ci95"]
    return f"{r['k']}/{r['n']} ({100 * r['rate']:.1f}%, CI {100 * lo:.1f}–{100 * hi:.1f})"


def markdown(res, meta):
    o, gi = res["overall"], res["fields"]["gpc.inServiceDate"]
    lines = [
        "# Extraction agreement (GPT-5.5 vs the deterministic parse)", "",
        f"Generated by `npm run extract:eval -- score` from {res['pagesScored']} page runs in `data/eval/extraction/runs/`. "
        f"Model {', '.join(res['models'])}; prompt {', '.join(res['promptVersions'])} (frozen, sha256 `{meta['promptSha256'][:12]}`). "
        "The reference is the deterministic parse, not human labels: these are agreement rates, not accuracy. "
        "Rates are k/n with Wilson 95% intervals.", "",
        f"- Verbatim quotes: {pct(res['verbatimQuote'].get('all'))} of returned fields quote text found on the page "
        f"(DESC {pct(res['verbatimQuote'].get('desc'))}, GPC {pct(res['verbatimQuote'].get('gpc'))}).",
        f"- Field agreement where both state a value: exact {pct(o['exact'])}, lenient {pct(o['lenient'])}; "
        f"recall when the parse has a value {pct(o['recallWhenStated'])}.",
        f"- Georgia Power's Need Date: the model returns it as the in-service date on {gi['stated'] - gi['counts'].get('missed', 0)} of {gi['stated']} "
        f"pages ({gi['exact']['k']} of {gi['exact']['n']} exact) and leaves it null on {gi['counts'].get('missed', 0)}: the page labels it \"Need Date\" and the frozen "
        "prompt asks for an in-service date. Reported, not fixed mid-evaluation.",
        f"- Misses (parse has a value, model returns none): {o['missed']}. Disagreements with a verbatim quote: {o['disagreeWithVerbatimQuote']}; "
        f"with a quote not found on the page: {o['disagreeUnlocatedQuote']}.",
        f"- Values the parse lacks: {o['extraWithVerbatimQuote']} with a verbatim quote (parse gap or over-reach; review), "
        f"{o['extraUnlocatedQuote']} without one (hallucination candidates; the app would reject them). "
        f"Correct abstentions {pct(o['abstention'])}.",
        f"- Tokens: {res['tokens']['input']:,} input, {res['tokens']['output']:,} output ({res['tokens']['reasoning']:,} reasoning). "
        f"Estimated cost ≈ ${res['estimatedCostUsd']:.2f} at ${PRICE['inputPerM']:g}/${PRICE['outputPerM']:g} per 1M tokens "
        f"({PRICE['url']}, \"{PRICE['excerpt']}\", retrieved {PRICE['retrievedAt']}; cached input billed at the full rate, an upper bound).",
        f"- \"Estimated Cost – GPC REDACTED\" appears on {res['gpcCost']['pages']} of {res['fields']['gpc.projectId']['stated']} Georgia Power "
        f"pages (checked on the page text): the model answered REDACTED on {res['gpcCost']['agree']} and returned null on "
        f"{res['gpcCost']['abstained-redacted']} (acceptable); {res['gpcCost']['disagree'] + res['gpcCost']['disagree-unlocated']} gave a number.",
        *([f"- Every non-agreement was adjudicated against the page by the evaluating agent (Claude), not a human; its {a['excerptsVerified']} page "
           "excerpts are re-found verbatim by the scorer: "
           + ", ".join(f"{k} {v}" for k, v in sorted(a["counts"].items(), key=lambda x: -x[1])) + "."] if (a := res.get("adjudication")) else []),
        f"- Errors: {len(res['errors'])} page(s) without a run.", "",
        "| Field | Utility | Parse states | Exact | Lenient | Missed | Disagree (quote found / not) | Extra (quote found / not) | Correct abstentions |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in res["fields"].values():
        c = r["counts"]
        lines.append(f"| {r['field']} | {r['utility'].upper()} | {r['stated']} | {pct(r['exact'])} | {pct(r['lenient'])} | {c.get('missed', 0)} | "
                     f"{c.get('disagree', 0)} / {c.get('disagree-unlocated', 0)} | {c.get('extra-located', 0)} / {c.get('extra-unlocated', 0)} | {pct(r['abstention'])} |")
    lines += ["", "Named facilities (set agreement with the reference terminals; the model also names facilities a description mentions, "
              "so the first column is agreement, not precision):", "",
              "| Utility · reference | Pages | Model's names in the reference | Reference terminals the model names |", "| --- | --- | --- | --- |"]
    for k, v in res["namedFacilities"].items():
        u, src = k.split(".", 1)
        lines.append(f"| {u.upper()} · {src} | {v['pages']} | {pct(v['modelInReference'])} | {pct(v['referenceNamed'])} |")
    lines += ["", "Notes: *near* = the same title after dropping a planning-area prefix, or token F1 ≥ 0.8; a date inside the model's coarser "
              "range, or one of several dates it lists (phases); one of several lengths it lists; the same highest kV class. The voltage "
              "reference is the kV classes written in the title (the description when the title has none). GPC's in-service reference is the "
              "page's Need Date. Every non-agreement is listed with the model's quote and its adjudication in "
              "`data/eval/extraction/disagreements.csv` (verdicts and page excerpts: `data/eval/extraction/adjudication.json`).", ""]
    return "\n".join(lines)


# ------------------------------------------------------------------ model runs
def load_runs():
    d = OUT / "runs"
    return [json.loads(f.read_text()) for f in sorted(d.glob("*.json"))] if d.exists() else []


def prompt_meta():
    return {"promptVersion": ex.PROMPT_VERSION, "promptSha256": hashlib.sha256(ex.PROMPT.encode()).hexdigest(),
            "schemaSha256": hashlib.sha256(json.dumps(ex.openai_schema(), sort_keys=True).encode()).hexdigest()}


def call(provider, model, text, key, effort):
    run = ex.PROVIDERS[provider][0]
    for attempt in range(4):
        try:
            return run(model, text, key, effort)
        except SystemExit as e:  # extract.post() exits on HTTP errors and incomplete responses
            msg = str(e)
            if attempt == 3 or not re.search(r"HTTP (408|409|429|5\d\d)|status (incomplete|failed)", msg):
                raise RuntimeError(msg[:400])
        except Exception as e:  # network timeouts, malformed JSON
            if attempt == 3:
                raise RuntimeError(f"{type(e).__name__}: {e}"[:400])
        time.sleep(8 * 2 ** attempt)


def run_page(pg, provider, model, key, effort):
    text = (CACHE / pg["sourceId"] / f"p{pg['page']:04d}.txt").read_text()
    rec = {"id": f"{pg['sourceId']}-p{pg['page']}", "sourceId": pg["sourceId"], "page": pg["page"], "provider": provider, "model": model,
           "promptVersion": ex.PROMPT_VERSION, "effort": effort, "runAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    try:
        out, resolved, usage = call(provider, model, text, key, effort)
    except RuntimeError as e:
        return {**rec, "error": str(e)}
    page_norm, cited, fields = ex.normalize(text), ex.snapshot_excerpts(pg["sourceId"], pg["page"]), []
    for k, v in out.items():
        for name, f in ([(f"{k}[{i}]", it) for i, it in enumerate(v)] if isinstance(v, list) else [(k, v)]):
            if not f:
                continue
            exc = f.get("excerpt", "") or ""
            located = bool(exc) and ex.normalize(exc) in page_norm
            fields.append({"field": name, "value": str(f.get("value", "")), "excerpt": exc, "located": located,
                           "inSnapshot": located and ex.same_passage(ex.normalize(exc), cited)})
    return {**rec, "model": resolved, "fields": fields, "usage": usage}


def per_page_usd(runs):
    ok = [r for r in runs if r.get("usage")]
    if len(ok) < 3:
        return usd(*FALLBACK_TOKENS)
    return usd(sum(r["usage"].get("input_tokens", 0) for r in ok), sum(r["usage"].get("output_tokens", 0) for r in ok)) / len(ok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "run", "score"])
    ap.add_argument("--scope", choices=["all", "in-scope"], default="in-scope", help="in-scope = DESC + GPC/SAV pages (GTC/MEAG/DU excluded)")
    ap.add_argument("--pages", help="comma list sourceId:page (run only these)")
    ap.add_argument("--max-usd", type=float, default=15.0, help="stop before the estimated spend of this invocation exceeds this")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--provider", default="openai")
    ap.add_argument("--model")
    ap.add_argument("--effort")
    ap.add_argument("--retry-errors", action="store_true", help="re-run pages whose last run failed")
    a = ap.parse_args()
    pages = page_inventory(a.scope)
    runs = load_runs()
    done = {(r["sourceId"], r["page"]) for r in runs if a.retry_errors is False or not r.get("error")}
    todo = [p for p in pages if (p["sourceId"], p["page"]) not in done]
    if a.pages:
        want = {(s.split(":")[0], int(s.split(":")[1])) for s in a.pages.split(",")}
        todo = [p for p in todo if (p["sourceId"], p["page"]) in want]
    each = per_page_usd(runs)

    if a.cmd == "list":
        print(json.dumps({"scope": a.scope, "pages": len(pages), "bySource": collections.Counter(p["sourceId"] for p in pages),
                          "alreadyRun": len(pages) - len(todo), "toRun": len(todo), "estimatedUsdPerPage": round(each, 4),
                          "projectedUsd": round(each * len(todo), 2), **prompt_meta()}, indent=1))
        return

    if a.cmd == "run":
        ex.load_env_local()
        _, key_var, model_var = ex.PROVIDERS[a.provider]
        key = os.environ.get(key_var)
        if not key:
            sys.exit(f"{key_var} not set (environment or .env.local)")
        model = a.model or os.environ.get(model_var) or ex.DEFAULT_MODEL[a.provider]
        projected = each * len(todo)
        print(f"{len(todo)} page(s) to run with {a.provider}/{model}; projected ≈ ${projected:.2f} (cap ${a.max_usd:.2f})", file=sys.stderr)
        if projected > a.max_usd:
            sys.exit("projected spend is above the cap; nothing was run (narrow --pages or raise --max-usd)")
        (OUT / "runs").mkdir(parents=True, exist_ok=True)
        lock, spent = threading.Lock(), [0.0]

        def task(pg):
            with lock:
                if spent[0] + each > a.max_usd:
                    return None
            rec = run_page(pg, a.provider, model, key, a.effort)
            (OUT / "runs" / f"{rec['id']}.json").write_text(json.dumps(rec, indent=1, ensure_ascii=False) + "\n")
            with lock:
                u = rec.get("usage") or {}
                spent[0] += usd(u.get("input_tokens", 0), u.get("output_tokens", 0))
            return rec

        with cf.ThreadPoolExecutor(max_workers=max(1, a.workers)) as pool:
            for n, rec in enumerate(pool.map(task, todo), 1):
                if rec is None:
                    continue
                note = rec["error"][:120] if rec.get("error") else f"{sum(f['located'] for f in rec['fields'])}/{len(rec['fields'])} located"
                print(f"  [{n}/{len(todo)}] {rec['id']}: {note}  (≈${spent[0]:.2f})", file=sys.stderr)
        runs = load_runs()

    in_scope = {(p["sourceId"], p["page"]) for p in pages}
    res, dis = score([r for r in runs if (r["sourceId"], r["page"]) in in_scope], pages, snapshot_facilities(), batch_facilities())
    meta = {**prompt_meta(), "scope": a.scope, "pagesInScope": len(pages),
            "reference": "data/region-b/parsed.json (deterministic parse; not human labels)", "runs": "data/eval/extraction/runs/"}
    OUT.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps({"meta": meta, **res}, indent=1, ensure_ascii=False) + "\n")
    REPORT.write_text(markdown(res, meta))
    with (OUT / "disagreements.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["utility", "sourceId", "page", "field", "outcome", "adjudication", "reference", "model", "excerpt", "located"])
        w.writeheader()
        w.writerows(sorted(dis, key=lambda x: (x["field"], x["sourceId"], x["page"])))
    print(json.dumps({"pagesScored": res["pagesScored"], "overall": res["overall"], "verbatimQuote": res["verbatimQuote"]["all"] if res["verbatimQuote"] else None,
                      "tokens": res["tokens"], "estimatedCostUsd": res["estimatedCostUsd"]}, indent=1))


if __name__ == "__main__":
    main()
