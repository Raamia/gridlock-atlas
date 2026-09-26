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
- A DESC budget year under 5% of the total is preconstruction spending and never starts the window.
- Newer dated statements (SERTP 2025 in-service years, the Dominion project page's construction start)
  are added beside the plan's own dates; the older date is kept, never overwritten.
"""
import calendar
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from parse_region_b import CACHE, ev, first_words, verified  # noqa: E402
from textnorm import normalize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
RB = ROOT / "data" / "region-b"
OUT = ROOT / "data" / "research"

CURRENT = "desc-scrtp-2026-2030"
EARLIER = ["desc-scrtp-2025-2029", "desc-scrtp-2024-2028"]
LIST_LABEL = {"desc-scrtp-2026-2030": "2026–2030 list", "desc-scrtp-2025-2029": "2025–2029 list", "desc-scrtp-2024-2028": "2024–2028 list"}
SNAPSHOT = "2026-09-26"
# document dates read from each PDF's metadata (pdfinfo CreationDate); the lists print no date themselves
DOC_DATES = {
    "desc-scrtp-2026-2030": ("2026-04-28", "PDF creation date (pdfinfo), 2026-04-28"),
    "desc-scrtp-2025-2029": ("2025-03-03", "PDF creation date (pdfinfo), 2025-03-03"),
    "desc-scrtp-2024-2028": ("2024-03-05", "PDF creation date (pdfinfo), 2024-03-05"),
    "gpc-irp-2025-vol3": ("2025-01-18", "PDF creation date (pdfinfo), 2025-01-18; the plan is a snapshot as of December 2024"),
    "sertp-2025-plan": ("2025-11-26", "Cover dated 'November 26, 2025'; SERTP home page news item dated November 26th, 2025 announces the final 2025 plan. Retrieved 2026-09-26 (257 pp.)."),
    "desc-jasper-okatie-sherwood-page": (None, "No publication date on the page; its timeline is headed '(Anticipated – Subject to Change)'. Retrieved 2026-09-26."),
}

SERTP = "sertp-2025-plan"
# SERTP 2025 (Nov 2025) in-service years, newer than the Ten-Year Plan's December 2024 Need Dates: TEAMS → (page, excerpt, year)
SERTP_IN_SERVICE = {
    "20065": (111, "In-Service Year: Project Name: 2028 SAV: GOSHEN (SAV) – MCINTOSH 115 KV TRANSMISSION LINE, REBUILD", 2028),
    "20989": (111, "In-Service Year: Project Name: 2028 SAV: RICE HOPE, NEW 230/115 KV AUTOTRANSFORMER, INSTALL", 2028),
}
# owner project pages that date field work the SCRTP list leaves undated: DESC project ID → page, start, excerpts, note
DESC_PAGE_WINDOWS = {
    "06367 D - G": {
        "sourceId": "desc-jasper-okatie-sherwood-page",
        "start": {"earliest": "2025-01-01", "latest": "2025-03-31", "precision": "quarter"},
        "excerpts": [
            ("The first 230 kV line begins at the Jasper Generating Plant and ends at the Okatie substation.", "the page covers the Jasper–Okatie 230 kV line"),
            ("Timeline (Anticipated – Subject to Change)", "the page's timeline is anticipated and subject to change"),
            ("Q1 2025 Tree clearing and construction of transmission lines and substation begin", "construction start Q1 2025"),
        ],
        "note": "Dominion project page: tree clearing and construction begin Q1 2025 (its timeline is marked 'Anticipated – Subject to Change'). "
                "The page gives no end, so the SCRTP planned in-service date bounds the window; the field work within is not dated.",
    },
}
MINOR_SHARE = 0.05


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
    t = re.sub(r"\bKv\b", "kV", " ".join(out))
    return re.sub(r"\b(Mc)([a-z])", lambda m: m.group(1) + m.group(2).upper(), t)


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
    """Geocodes by key; a key repeated across batches (duplicate source IDs) keeps every candidate."""
    out = {}
    for f in sorted((RB / "geo").glob("*.json")):
        for p in json.load(open(f)).get("projects", []):
            out.setdefault(p["key"], []).append(p)
    return out


def norm_id(pid):
    """Editions write the same ID differently ("06076 A" vs "06076A")."""
    return re.sub(r"\s+", "", pid).upper()


def words(s):
    return set(re.findall(r"[a-z]{3,}", s.lower())) - {"rebuild", "line", "construct", "substation", "tie", "sub", "and", "the"}


def mentions(name, text):
    """Every distinctive word of a place name ("Deerfield Switching Station (new)" → deerfield) occurs in the text."""
    core = words(re.sub(r"\s*\(.*?\)", "", name)) - {"switching", "station", "new"}
    return bool(core) and core <= words(text)


def page_ev(source_id, excerpt, supports):
    """Evidence from a cached web page (no pages), checked verbatim like ev()."""
    excerpt = " ".join(excerpt.split())
    text = " ".join(f.read_text(errors="replace") for f in (CACHE / "text" / source_id).glob("*.txt"))
    return {"sourceId": source_id, "exactExcerpt": excerpt, "supports": supports, "verifiedByScript": normalize(excerpt) in normalize(text)}


def sentence_ev(source_id, page, text, test, supports):
    """The first sentence of the text that passes test(), as verified evidence (at most 40 words), or None."""
    for s in re.split(r"(?<=[.;])\s+", " ".join((text or "").split())):
        ws = s.split(" ")
        for frag in ([s] if len(ws) <= 40 else [" ".join(ws[:40]), " ".join(ws[-40:])]):
            if test(frag):
                e = ev(source_id, page, frag, supports)
                if e["verifiedByScript"]:
                    return e
    return None


def kv_values(text):
    """Every voltage in a text, including grouped ones: '230/115KV', '230-115 kV', '115 – 12kV'."""
    out = []
    for m in re.finditer(r"((?:\d{2,3}\s*[-/–]\s*)*\d{2,3})\s*-?\s*kV", text or "", re.I):
        out += [int(x) for x in re.findall(r"\d{2,3}", m.group(1))]
    return out


def voltage_fact(title, title_ev, source_id, page, description):
    """Voltage from the title; when the scope text names only other voltages (or the title none), the scope wins."""
    t, d = kv_values(title), kv_values(description)
    if d and not set(t) & set(d):
        kv = max(d)
        de = sentence_ev(source_id, page, description, lambda s: kv in kv_values(s), "voltage stated in the project scope")
        if de:
            note = f"Voltage is taken from the project description ({kv} kV); the title says {max(t)} kV." if t else None
            return {"key": "voltageKv", "label": "Voltage", "value": f"{kv} kV", "evidence": [de]}, note
    if t:
        return {"key": "voltageKv", "label": "Voltage", "value": f"{max(t)} kV", "evidence": [title_ev]}, None
    return None, None


def place_evidence(name, title, title_ev, scope):
    """The title when it names the place; otherwise a verified scope sentence that does (e.g. 'Construct Deerfield Switching Station …')."""
    if mentions(name, title) or not scope:
        return [title_ev]
    source_id, page, text = scope
    e = sentence_ev(source_id, page, text, lambda s: mentions(name, s), "terminal named in the project scope")
    return [e] if e else [title_ev]


def places_for(key, geo, title_ev, title="", strict=False, scope=None):
    cands = geo.get(key) or []
    # duplicate IDs return several geocodes under one key: take the one whose terminal names appear in THIS title
    if strict or len(cands) > 1:
        g = next((c for c in cands if any(words(e.get("name", "")) & words(title) for e in c.get("endpoints", []))), None)
    else:
        g = cands[0] if cands else None
    if not g:
        return [], ["Endpoints not yet geocoded."]
    places, caveats = [], []
    # otherPlaces: facilities the project touches but does not end at (role "context", never a terminal)
    listed = [(e, f"ep{i + 1}") for i, e in enumerate(g.get("endpoints", []))] + [(e, f"ctx{i + 1}") for i, e in enumerate(g.get("otherPlaces", []))]
    for e, tag in listed:
        if e.get("precision") == "unknown" or e.get("lat") is None:
            caveats.append(f"Terminal “{e['name']}” could not be located: {e.get('validation', '')}".strip())
            continue
        places.append({
            "id": f"{slug(key)}-{tag}", "label": e.get("label") or e["name"], "kind": "substation", "precision": e["precision"],
            "lat": e["lat"], "lon": e["lon"], "uncertaintyMeters": e.get("uncertaintyMeters") or (800 if e["precision"] == "named-facility" else 6000),
            "coordinateSource": e["coordinateSource"], "evidence": place_evidence(e["name"], title, title_ev, scope), "role": e.get("role", "endpoint"),
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
    earlier = {sid: {norm_id(r["projectId"]): r for r in parsed["desc"][sid]} for sid in EARLIER}
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
        qualified = f"desc:{pid}@p{r['page']}"
        places, caveats = places_for(qualified if qualified in geo else key, geo, title_ev, r["title"], strict=pid in dup_ids and qualified not in geo,
                                     scope=(CURRENT, r["page"], r["description"]))
        if len(r.get("phaseDates") or []) > 1:
            caveats.append(f"Phased in-service dates: {r['inServiceRaw']}. The last phase is used as the project's in-service date.")

        status_raw = r["status"]
        status_val = "construction" if status_raw.lower().startswith("in progress") else "proposed" if status_raw.lower().startswith("planned") else "unknown"

        claims = []
        if r["inService"]:
            date, fixed = iso_fix(r["inService"])
            claims.append({"claimSourceId": CURRENT, "label": "planned in-service", "date": date, "evidence": [E["inService"]], "current": True})
            if fixed:
                caveats.append(f"The source gives an impossible date ({r['inServiceRaw']}); shown at month precision.")
        for sid in EARLIER:
            old = earlier[sid].get(norm_id(pid))
            if old and pid in dup_ids and not same_project(old["title"], r["title"]):
                old = None
            if old and old["inService"] and old["inService"] != r["inService"]:
                d, _ = iso_fix(old["inService"])
                claims.append({"claimSourceId": sid, "label": f"planned in-service ({LIST_LABEL[sid]})", "date": d, "evidence": [old["evidence"]["inService"]], "current": False})
                if old["title"] != r["title"]:
                    caveats.append(f"Earlier {LIST_LABEL[sid]} named this project “{old['title']}”.")

        windows = []
        pw = DESC_PAGE_WINDOWS.get(pid)
        if pw and r["inService"]:
            pe = [page_ev(pw["sourceId"], x, why) for x, why in pw["excerpts"]]
            windows.append({
                "claimSourceId": pw["sourceId"], "phase": "general-construction", "start": pw["start"], "end": iso_fix(r["inService"])[0],
                "continuous": True, "boundsOnly": True, "evidence": [x for x in pe if x["verifiedByScript"]] + [E["inService"]], "note": pw["note"],
            })
        # coarse budget-year window; a year under 5% of the total is preconstruction spending and never starts it
        def window_costs(costs, skipped_years):
            """Years that set the window first; skipped (preconstruction) years last, labelled as such."""
            ok = [x for x in costs if x["verifiedByScript"]]
            pre = {f"budgeted spending in {y}" for y in skipped_years}
            return [x for x in ok if x["supports"] not in pre] + [
                {**x, "supports": x["supports"] + " (under 5% of the total: treated as preconstruction)"} for x in ok if x["supports"] in pre]

        total = r["costs"].get("Total") or 0

        def minor(v):
            return v < MINOR_SHARE * total

        years = sorted(int(y) for y, v in r["costs"].items() if y.isdigit() and v > 0)
        if years and r["inService"]:
            first = next((y for y in years if not minor(r["costs"][str(y)])), years[0])
            skipped = [f"{y}: ${r['costs'][str(y)]:,}" for y in years if y < first]
            prev = r["costs"].get("Previous", 0)
            if 0 < prev and minor(prev):
                skipped.insert(0, f"before 2026: ${prev:,}")
            started_before = prev > 0 and not minor(prev)
            start = {"earliest": f"{first - 3 if started_before else first}-01-01", "latest": f"{first}-12-31", "precision": "year"}
            end_iso = iso_fix(r["inService"])[0]["latest"]
            last_spend = f"{years[-1]}-12-31"
            end_latest = max(end_iso, last_spend)
            end = {"earliest": min(iso_fix(r["inService"])[0]["earliest"], end_latest), "latest": end_latest, "precision": "day" if end_latest == end_iso else "year"}
            if start["earliest"] <= end["latest"]:
                windows.append({
                    "claimSourceId": CURRENT, "phase": "unknown", "start": start, "end": end, "continuous": False,
                    "evidence": window_costs(E["costs"], [y for y in years if y < first]) + [E["inService"]],
                    "note": "Coarse budget-year window: first budgeted spending year → planned in-service date. DESC publishes yearly spending, not construction dates"
                            + ("; spending also occurred before 2026" if started_before else "")
                            + (f"; spending under 5% of the total ({', '.join(skipped)}) is treated as preconstruction and does not start the window" if skipped else "")
                            + ".",
                })

        facts = []
        tot = [x for x in E["costs"] if "total" in x["supports"]]
        if r["costs"].get("Total") and tot:
            facts.append({"key": "costUsd", "label": "Estimated project cost", "value": f"${r['costs']['Total']:,}", "evidence": tot})
        me = miles_ev(CURRENT, r["page"], r["description"])
        if r["miles"] and me:
            facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{r['miles']:g} mi", "evidence": [me]})
        vf, vc = voltage_fact(r["title"], title_ev, CURRENT, r["page"], r["description"])
        if vf:
            facts.append(vf)
        if vc:
            caveats.append(vc)

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
        places, caveats = places_for(key, geo, E["title"], r["title"], scope=(r["sourceId"], r["page"], r["description"]))
        if r["sponsor"] == "SAV":
            caveats.append("Listed with project sponsor “SAV” (Georgia Power's Savannah area) in the Ten-Year Plan summary table.")
        windows, claims = [], []
        if r["start"] and r["need"] and r["start"] > r["need"]:
            caveats.append(f"The plan lists a Start Date ({r['start']}) after the Need Date ({r['need']}); no project window is used.")
        elif r["start"] and r["need"]:
            windows.append({
                "claimSourceId": r["sourceId"], "phase": "unknown",
                "start": {"earliest": r["start"], "latest": r["start"], "precision": "day"},
                "end": {"earliest": r["need"], "latest": r["need"], "precision": "day"},
                "continuous": True, "boundsOnly": True, "evidence": [E["dates"]],
                "note": "Project window as published (Start Date → Need Date); the months of field work within it are not stated, so only the bounds are used.",
            })
        if r["need"]:
            claims.append({"claimSourceId": r["sourceId"], "label": "need date (in-service)", "date": {"earliest": r["need"], "latest": r["need"], "precision": "day"}, "evidence": [E["dates"]], "current": True})
        sertp = SERTP_IN_SERVICE.get(r["teams"])
        if sertp:
            # the regional plan's in-service year (Nov 2025) is newer than the Ten-Year Plan (Dec 2024): it becomes current,
            # the Need Date stays as version history, and the plan's window is re-bounded Start Date → that year
            page, excerpt, year = sertp
            se = ev(SERTP, page, excerpt, f"in-service year {year} (SERTP 2025)")
            yb = {"earliest": f"{year}-01-01", "latest": f"{year}-12-31", "precision": "year"}
            for c in claims:
                c.update(current=False, label="need date (2024 Ten-Year Plan)")
            claims.insert(0, {"claimSourceId": SERTP, "label": "in-service year (SERTP 2025)", "date": yb, "evidence": [se], "current": True})
            if windows:
                windows[0]["supersededBy"] = f"gpc-{r['teams']}:w2"
                windows.append({
                    "claimSourceId": SERTP, "phase": "unknown", "start": windows[0]["start"], "end": yb,
                    "continuous": True, "boundsOnly": True, "evidence": [E["dates"], se],
                    "note": f"Bounds: the Ten-Year Plan's Start Date → the SERTP 2025 in-service year ({year}), which replaces the plan's Need Date; the months of field work within it are not stated.",
                })
            caveats.append(f"SERTP 2025 (November 2025) gives an in-service year of {year}; the Ten-Year Plan (a December 2024 snapshot) gives a Need Date of {r['need'][5:7]}/{r['need'][8:]}/{r['need'][:4]}. The newer year is used; the Need Date is kept as version history.")
        facts = []
        me = miles_ev(r["sourceId"], r["page"], r["description"]) if r["description"] else None
        if r["miles"] and me:
            facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{r['miles']:g} mi", "evidence": [me]})
        vf, vc = voltage_fact(r["title"], E["title"], r["sourceId"], r["page"], r["description"])
        if vf:
            facts.append(vf)
        if vc:
            caveats.append(vc)
        if E.get("costRedacted") and E["costRedacted"]["verifiedByScript"]:
            facts.append({"key": "costUsd", "label": "Estimated cost", "value": "Redacted in the public disclosure", "evidence": [E["costRedacted"]]})
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


def check_batches(geo):
    """Every key sent for geocoding must come back; a truncated batch is reported, never silently accepted."""
    missing = []
    returned = set(geo)
    for b in json.load(open(RB / "batches.json")):
        for x in b["items"]:
            key = x["key"]
            if key not in returned and not any(k.startswith(key + "@") for k in returned):
                missing.append((b["id"], key))
    if missing:
        print(f"WARNING: {len(missing)} projects were sent for geocoding but not returned:", file=sys.stderr)
        for bid, key in missing:
            print(f"  {bid}: {key}", file=sys.stderr)


def main():
    parsed = json.load(open(RB / "parsed.json"))
    geo = load_geo()
    check_batches(geo)
    OUT.mkdir(parents=True, exist_ok=True)
    src = []
    for sid in [CURRENT, *EARLIER, "gpc-irp-2025-vol3", SERTP, *{w["sourceId"] for w in DESC_PAGE_WINDOWS.values()}]:
        m = json.load(open(ROOT / "data" / "sources" / ".cache" / "meta" / f"{sid}.json"))
        src.append({"id": sid, "title": m["title"], "publisher": m["publisher"], "url": m["url"], "sourceType": m["sourceType"],
                    "publishedAt": DOC_DATES.get(sid, (None, None))[0] or m.get("publishedAt"), "documentDateEvidence": DOC_DATES.get(sid, (None, None))[1], "cached": True})
    d = desc_clusters(parsed, geo)
    g = gpc_clusters(parsed, geo)
    d["sources"] = [s for s in src if s["id"].startswith("desc")]
    g["sources"] = [s for s in src if s["id"].startswith("gpc") or s["id"] == SERTP]
    json.dump(d, open(OUT / "sc-ga-desc.json", "w"), indent=1)
    json.dump(g, open(OUT / "sc-ga-gpc.json", "w"), indent=1)
    located = lambda ps: sum(1 for p in ps if p["places"])
    print(f"DESC {len(d['projects'])} projects ({located(d['projects'])} located) · GPC {len(g['projects'])} ({located(g['projects'])} located) · geo keys {len(geo)}")


if __name__ == "__main__":
    main()
