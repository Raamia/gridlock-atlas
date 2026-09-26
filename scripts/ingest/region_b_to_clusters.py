#!/usr/bin/env python3
"""Turn parsed Region B plans + verified geocodes into research clusters for build-snapshot.ts.

Inputs:  data/region-b/parsed.json, data/region-b/geo/*.json (verified geocoding batches)
Outputs: data/research/sc-ga-desc.json, data/research/sc-ga-gpc.json

Modeling decisions (see plan.md §6-8):
- DESC publishes spending by year and a planned in-service date, not construction dates. We record a
  coarse "budget-year window" (first budgeted year → planned in-service), marked non-continuous so the
  engine can at most call a timing overlap "possible". The in-service date is kept as its own claim.
- GPC's Ten-Year Plan publishes a Start Date and a Need Date per project: recorded as a project window
  (start → need) plus the need date as the in-service claim.
- Earlier DESC list editions are kept as version history (completion claims with current=false).
"""
import calendar
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from parse_region_b import ev, first_words, verified  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
RB = ROOT / "data" / "region-b"
OUT = ROOT / "data" / "research"

CURRENT = "desc-scrtp-2026-2030"
EARLIER = ["desc-scrtp-2025-2029", "desc-scrtp-2024-2028"]
LIST_LABEL = {"desc-scrtp-2026-2030": "2026–2030 list", "desc-scrtp-2025-2029": "2025–2029 list", "desc-scrtp-2024-2028": "2024–2028 list"}
SNAPSHOT = "2026-09-26"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


SMALL = {"and", "of", "to", "the", "at", "in", "on", "for", "a"}
KEEP_UPPER = {"SAV", "GTC", "MEAG", "DU", "USA", "II", "III", "IV", "CC", "SPDC", "ACSR", "ACSS", "EA", "GPC", "USACE"}


def title_case(s):
    out = []
    for i, w in enumerate(s.split()):
        core = re.sub(r"[^A-Za-z0-9]", "", w)
        if re.fullmatch(r"\d+(/\d+)?KV", core.upper()):
            out.append(re.sub(r"KV", " kV", w.upper()).replace("  ", " "))
        elif core.upper() in KEEP_UPPER or re.fullmatch(r"#?\d+[A-Z]?", core.upper()):
            out.append(w.upper())
        elif i and core.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out).replace(" kV", " kV")


def short_title(t):
    t = re.sub(r"^(SAV|GTC|MEAG|DU)\s*:\s*", "", t, flags=re.I)
    t = t.split(":")[0].strip()
    t = re.sub(r"\s*\(.*?\)", "", t)
    return t if len(t) <= 44 else t[:42].rsplit(" ", 1)[0] + "…"


def iso_fix(iso):
    """Clamp impossible source dates (e.g. '4/31/2026') to month precision without inventing a day."""
    y, m, d = map(int, iso.split("-"))
    last = calendar.monthrange(y, m)[1]
    if d > last:
        return {"earliest": f"{y:04d}-{m:02d}-01", "latest": f"{y:04d}-{m:02d}-{last:02d}", "precision": "month"}, True
    return {"earliest": iso, "latest": iso, "precision": "day"}, False


def load_geo():
    out = {}
    for f in sorted((RB / "geo").glob("*.json")):
        for p in json.load(open(f)).get("projects", []):
            out[p["key"]] = p
    return out


def places_for(key, geo, title_ev):
    g = geo.get(key)
    if not g:
        return [], ["Endpoints not geocoded."]
    places, caveats = [], []
    for i, e in enumerate(g.get("endpoints", [])):
        if e.get("precision") == "unknown" or e.get("lat") is None:
            caveats.append(f"Terminal “{e['name']}” could not be located: {e.get('validation', '')}".strip())
            continue
        places.append({
            "id": f"{slug(key)}-ep{i + 1}", "label": e["name"], "kind": "substation", "precision": e["precision"],
            "lat": e["lat"], "lon": e["lon"], "uncertaintyMeters": e.get("uncertaintyMeters") or (800 if e["precision"] == "named-facility" else 6000),
            "coordinateSource": e["coordinateSource"], "evidence": [title_ev], "role": "endpoint",
            "confidence": "confirmed" if e.get("confidence") == "confirmed" else "lower-confidence",
            "validation": e.get("validation"),
        })
    if g.get("notes"):
        caveats.append(g["notes"])
    return places, caveats


def miles_ev(source_id, page, text):
    m = re.search(r"[^.]*?\b(?:approximately|approx\.?)?\s*[\d.]+\s*(?:-\s*)?miles?\b[^.]*\.?", text, re.I)
    if not m:
        return None
    frag = " ".join(m.group(0).split())
    words = frag.split(" ")
    if len(words) > 40:
        frag = " ".join(words[:40])
    e = ev(source_id, page, frag, "length of line work")
    return e if e["verifiedByScript"] else None


def desc_clusters(parsed, geo):
    earlier = {sid: {r["projectId"]: r for r in parsed["desc"][sid]} for sid in EARLIER}
    projects, unresolved = [], []
    seen = {}
    for r in parsed["desc"][CURRENT]:
        seen[r["projectId"]] = seen.get(r["projectId"], 0) + 1
    dup_ids = {k for k, v in seen.items() if v > 1}

    def same_project(a, b):
        ta = set(re.findall(r"[a-z]{3,}", a.lower())) - {"rebuild", "line", "construct", "substation", "tie"}
        tb = set(re.findall(r"[a-z]{3,}", b.lower())) - {"rebuild", "line", "construct", "substation", "tie"}
        return bool(ta & tb)

    used = set()
    for r in parsed["desc"][CURRENT]:
        pid = r["projectId"]
        key = f"desc:{pid}"
        E = r["evidence"]
        title_ev = E["title"]
        places, caveats = places_for(key, geo, title_ev)

        status_raw = r["status"]
        status_val = "construction" if status_raw.lower().startswith("in progress") else "proposed" if status_raw.lower().startswith("planned") else "unknown"

        claims = []
        if r["inService"]:
            date, fixed = iso_fix(r["inService"])
            claims.append({"claimSourceId": CURRENT, "label": "planned in-service", "date": date, "evidence": [E["inService"]], "current": True})
            if fixed:
                caveats.append(f"The source gives an impossible date ({r['inServiceRaw']}); shown at month precision.")
        for sid in EARLIER:
            old = earlier[sid].get(pid)
            if old and pid in dup_ids and not same_project(old["title"], r["title"]):
                old = None
            if old and old["inService"] and old["inService"] != r["inService"]:
                d, _ = iso_fix(old["inService"])
                claims.append({"claimSourceId": sid, "label": f"planned in-service ({LIST_LABEL[sid]})", "date": d, "evidence": [old["evidence"]["inService"]], "current": False})
                if old["title"] != r["title"]:
                    caveats.append(f"Earlier {LIST_LABEL[sid]} named this project “{old['title']}”.")

        # coarse budget-year window
        windows = []
        years = sorted(int(y) for y, v in r["costs"].items() if y.isdigit() and v > 0)
        if years and r["inService"]:
            first = years[0]
            started_before = r["costs"].get("Previous", 0) > 0
            start = {"earliest": f"{first - 3 if started_before else first}-01-01", "latest": f"{first}-12-31", "precision": "year"}
            end_iso = iso_fix(r["inService"])[0]["latest"]
            last_spend = f"{years[-1]}-12-31"
            end_latest = max(end_iso, last_spend)
            end = {"earliest": min(iso_fix(r["inService"])[0]["earliest"], end_latest), "latest": end_latest, "precision": "day" if end_latest == end_iso else "year"}
            if start["earliest"] <= end["latest"]:
                windows.append({
                    "claimSourceId": CURRENT, "phase": "unknown", "start": start, "end": end, "continuous": False,
                    "evidence": [x for x in E["costs"] if x["verifiedByScript"]] + [E["inService"]],
                    "note": "Coarse budget-year window: first budgeted spending year → planned in-service date. DESC publishes yearly spending, not construction dates"
                            + ("; spending also occurred before 2026" if started_before else "") + ".",
                })

        facts = []
        if r["costs"].get("Total"):
            tot = [x for x in E["costs"] if x["exactExcerpt"].startswith("Total")]
            facts.append({"key": "costUsd", "label": "Estimated project cost", "value": f"${r['costs']['Total']:,}", "evidence": tot})
        me = miles_ev(CURRENT, r["page"], r["description"])
        if r["miles"] and me:
            facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{r['miles']:g} mi", "evidence": [me]})
        kv = re.findall(r"(\d{2,3})\s*-?\s*kV", r["title"], re.I)
        if kv:
            facts.append({"key": "voltageKv", "label": "Voltage", "value": f"{max(map(int, kv))} kV", "evidence": [title_ev]})

        pid_slug = f"desc-{slug(pid)}"
        if pid_slug in used:
            pid_slug = f"{pid_slug}-p{r['page']}"
        used.add(pid_slug)
        if pid in dup_ids:
            caveats.append(f"The source list uses project ID {pid} for more than one project; this one is on PDF p. {r['page']}.")
        projects.append({
            "id": pid_slug, "title": r["title"], "shortTitle": short_title(r["title"]), "titleEvidence": [title_ev],
            "summary": first_words(r["description"], 30), "owners": [{"utilityId": "desc", "name": "Dominion Energy South Carolina", "evidence": [E["projectId"]]}],
            "status": {"value": status_val, "label": status_raw, "asOf": "2026-04-28", "evidence": [E["status"]]},
            "states": ["SC"], "counties": [], "facts": facts, "places": places,
            "route": {"available": False, "precision": "none", "evidence": []},
            "constructionWindows": windows, "completionClaims": claims, "knownCoordination": [],
            "caveats": caveats, "docketId": f"DESC project {pid}", "region": "southeast",
        })
    return {"cluster": "sc-ga-desc", "sources": [], "projects": projects, "relations": [], "unresolved": unresolved}


def gpc_clusters(parsed, geo):
    projects = []
    for r in parsed["gpc"]:
        if r["sponsor"] not in ("GPC", "SAV"):
            continue
        key = f"gpc:{r['teams']}"
        E = r["evidence"]
        places, caveats = places_for(key, geo, E["title"])
        if r["sponsor"] == "SAV":
            caveats.append("Listed with project sponsor “SAV” (Georgia Power's Savannah area) in the Ten-Year Plan summary table.")
        windows, claims = [], []
        if r["start"] and r["need"]:
            windows.append({
                "claimSourceId": r["sourceId"], "phase": "unknown",
                "start": {"earliest": r["start"], "latest": r["start"], "precision": "day"},
                "end": {"earliest": r["need"], "latest": r["need"], "precision": "day"},
                "continuous": True, "evidence": [E["dates"]],
                "note": "Project window as published (Start Date → Need Date); the months of field work within it are not stated.",
            })
        if r["need"]:
            claims.append({"claimSourceId": r["sourceId"], "label": "need date (in-service)", "date": {"earliest": r["need"], "latest": r["need"], "precision": "day"}, "evidence": [E["dates"]], "current": True})
        facts = []
        me = miles_ev(r["sourceId"], r["page"], r["description"]) if r["description"] else None
        if r["miles"] and me:
            facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{r['miles']:g} mi", "evidence": [me]})
        kv = re.findall(r"(\d{2,3})\s*-?\s*KV", r["title"], re.I)
        if kv:
            facts.append({"key": "voltageKv", "label": "Voltage", "value": f"{max(map(int, kv))} kV", "evidence": [E["title"]]})
        facts.append({"key": "costUsd", "label": "Estimated cost", "value": "Redacted in the public disclosure", "evidence": []})
        title = title_case(r["title"])
        projects.append({
            "id": f"gpc-{r['teams']}", "title": title, "shortTitle": short_title(title), "titleEvidence": [E["title"]],
            "summary": first_words(r["description"], 30) if r["description"] else "",
            "owners": [{"utilityId": "gpc", "name": "Georgia Power", "evidence": [E["teams"]]}],
            "status": {"value": "proposed", "label": "In the 2025–2034 Ten-Year Plan", "evidence": [E["teams"]]},
            "states": ["GA"], "counties": [], "facts": facts, "places": places,
            "route": {"available": False, "precision": "none", "evidence": []},
            "constructionWindows": windows, "completionClaims": claims, "knownCoordination": [],
            "caveats": caveats, "docketId": f"TEAMS {r['teams']} · zone {r['zone']}", "region": "southeast",
        })
    return {"cluster": "sc-ga-gpc", "sources": [], "projects": projects, "relations": [], "unresolved": []}


def main():
    parsed = json.load(open(RB / "parsed.json"))
    geo = load_geo()
    OUT.mkdir(parents=True, exist_ok=True)
    src = []
    for sid in [CURRENT, *EARLIER, "gpc-irp-2025-vol3"]:
        m = json.load(open(ROOT / "data" / "sources" / ".cache" / "meta" / f"{sid}.json"))
        src.append({"id": sid, "title": m["title"], "publisher": m["publisher"], "url": m["url"], "sourceType": m["sourceType"], "publishedAt": m.get("publishedAt"), "cached": True})
    d = desc_clusters(parsed, geo)
    g = gpc_clusters(parsed, geo)
    d["sources"] = [s for s in src if s["id"].startswith("desc")]
    g["sources"] = [s for s in src if s["id"].startswith("gpc")]
    json.dump(d, open(OUT / "sc-ga-desc.json", "w"), indent=1)
    json.dump(g, open(OUT / "sc-ga-gpc.json", "w"), indent=1)
    located = lambda ps: sum(1 for p in ps if p["places"])
    print(f"DESC {len(d['projects'])} projects ({located(d['projects'])} located) · GPC {len(g['projects'])} ({located(g['projects'])} located) · geo keys {len(geo)}")


if __name__ == "__main__":
    main()
