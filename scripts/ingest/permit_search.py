#!/usr/bin/env python3
"""Search state land-disturbance filings for field-work dates behind the Savannah River leads.

  python3 scripts/ingest/permit_search.py [--since 01/01/2024] [--out data/permits/permit-search.json]

Two public sources, no login:
- Georgia EPD GEOS Public Inquiry Portal: every NPDES filing in Effingham and Chatham counties since --since
  (searched in 90-day slices, because the portal returns at most 500 results per search), plus name searches for the
  facilities in the top leads. Rows whose facility name looks like utility work are kept.
- SC DES coastal-zone land-disturbance boundaries (OCRM/CZC_Layers, layer LD_BOUND_CURRENT) in the Savannah River
  area: boundaries whose project name looks like utility work, with the date the boundary was filed.

A filing is evidence that land disturbance was permitted or requested, not a crew schedule. No filing found is not
evidence that no work is planned. The output is a research record; it does not enter the snapshot.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys

import requests
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[2]
GEOS = "https://geos.epd.georgia.gov/GA/GEOS/Public/Client/GA_GEOS/Public/Pages/PublicApplicationList.aspx"
GEOS_FIELD = "ctl00$ctl00$SimpleMainContent$MainContent$ucApplicationSubmitList$"
GEOS_COUNTIES = {"51": "Effingham", "25": "Chatham"}
GEOS_NAMES = ["Goshen", "McIntosh", "Rice Hope", "Kraft", "Georgia Pacific", "Rincon", "Meldrim", "Ogeechee"]
GEOS_CAP = 500
SC_LAYER = "https://gis.des.sc.gov/gisserver/rest/services/OCRM/CZC_Layers/MapServer/0/query"
SC_BBOX = (-81.5, 31.9, -80.6, 32.8)  # lon/lat box around the Savannah River region (Jasper and Beaufort counties)
UTILITY = re.compile(r"(?i)\d\s?kv\b|\bT/?L\b|\bGPC\b|georgia power|dominion|\bDESC\b|sce&g|substation|switching|transmission line|\btie\b")
NOT_UTILITY = re.compile(r"(?i)water|sewer|force main|gas main|feeder main|transmission main|\bGFM\b|lift station|pump station|freight|\d-inch|\d-in\b")
# SC boundaries named only "<facility> - <facility>" (e.g. "Okatie - Hardeeville") when a lead's facility is named
LEAD_LINE = re.compile(r"(?i)^(okatie|hardeeville|deerfield|riverport|sherwood|purrysburg|jasper|yemassee)\s*(-|–|to)\s*\w+\s*$")


def geos_form(soup):
    d = {}
    for i in soup.select("input[name]"):
        if i.get("type") not in ("submit", "button", "image", "checkbox"):
            d[i["name"]] = i.get("value", "")
    for sel in soup.select("select[name]"):
        o = sel.select_one("option[selected]") or sel.select_one("option")
        d[sel["name"]] = o.get("value", "") if o else ""
    return d


def geos_rows(soup):
    for tr in soup.select("tr"):
        if not tr.select_one("input[type=image][name$=btnEditRecord]"):
            continue
        text = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)) for td in tr.find_all("td", recursive=False)]
        m = re.search(r"\b(\d{5,7}) - (.+?) App Type: ?(.*)$", text[2]) if len(text) > 2 else None
        date = re.search(r"Submitted on: (\d\d/\d\d/\d{4})", " ".join(text))
        if m:
            yield {"submissionId": m.group(1), "facility": text[1], "form": m.group(2).strip(), "appType": m.group(3).strip(),
                   "submitted": dt.datetime.strptime(date.group(1), "%m/%d/%Y").date().isoformat() if date else None,
                   "status": text[4] if len(text) > 4 else ""}


def geos_search(county="", name="", start="", end=""):
    """All result pages of one GEOS search (NPDES program)."""
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (GridLock Atlas research)"
    d = geos_form(BeautifulSoup(s.get(GEOS, timeout=60).text, "html.parser"))
    d.update({GEOS_FIELD + "ddlSiteCounty": county, GEOS_FIELD + "txtFacilityName": name, GEOS_FIELD + "txtStartDate": start,
              GEOS_FIELD + "txtEndDate": end, GEOS_FIELD + "ddlProgram": "1", GEOS_FIELD + "btnSearch": "Search"})
    soup = BeautifulSoup(s.post(GEOS, data=d, timeout=120).text, "html.parser")
    out, page = {}, 1
    while True:
        for r in geos_rows(soup):
            out.setdefault(r["submissionId"], r)
        nxt = soup.find("a", href=re.compile(rf"Page\${page + 1}'"))
        if not nxt:
            return list(out.values())
        page += 1
        d = geos_form(soup)
        d["__EVENTTARGET"], d["__EVENTARGUMENT"] = re.search(r"__doPostBack\('([^']+)'", nxt["href"]).group(1), f"Page${page}"
        soup = BeautifulSoup(s.post(GEOS, data=d, timeout=120).text, "html.parser")


def slices(since, until, days=90):
    a = since
    while a <= until:
        b = min(a + dt.timedelta(days=days - 1), until)
        yield a, b
        a = b + dt.timedelta(days=1)


def utility(name):
    return bool(UTILITY.search(name)) and not NOT_UTILITY.search(name)


def georgia(since, until):
    searches, found = [], {}
    for code, county in GEOS_COUNTIES.items():
        for a, b in slices(since, until):
            rows = geos_search(county=code, start=a.strftime("%m/%d/%Y"), end=b.strftime("%m/%d/%Y"))
            searches.append({"county": county, "from": a.isoformat(), "to": b.isoformat(), "results": len(rows), "capped": len(rows) >= GEOS_CAP})
            print(f"GEOS {county} {a} → {b}: {len(rows)}", file=sys.stderr)
            for r in rows:
                if utility(r["facility"]):
                    found.setdefault(r["submissionId"], {**r, "county": county})
    for name in GEOS_NAMES:
        rows = geos_search(name=name)
        searches.append({"facilityName": name, "results": len(rows), "capped": len(rows) >= GEOS_CAP})
        print(f"GEOS name '{name}': {len(rows)}", file=sys.stderr)
        for r in rows:
            if utility(r["facility"]):
                found.setdefault(r["submissionId"], r)
    return searches, sorted(found.values(), key=lambda r: (r["submitted"] or "", r["submissionId"]), reverse=True)


def south_carolina():
    x0, y0, x1, y1 = SC_BBOX
    params = {"where": "1=1", "geometry": f"{x0},{y0},{x1},{y1}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
              "spatialRel": "esriSpatialRelIntersects", "outFields": "OBJECTID,DB_PROJECT,DB_DATE,POLY_AREA",
              "returnGeometry": "true", "outSR": 4326, "f": "json", "resultRecordCount": 2000}
    feats, offset = [], 0
    while True:
        r = requests.get(SC_LAYER, params={**params, "resultOffset": offset}, timeout=180).json()
        if "error" in r:
            raise SystemExit(f"SC DES query failed: {r['error']}")
        feats += r["features"]
        if not r.get("exceededTransferLimit"):
            break
        offset += len(r["features"])
    found = []
    for f in feats:
        a, name = f["attributes"], (f["attributes"]["DB_PROJECT"] or "").strip()
        if not (utility(name) or LEAD_LINE.match(name)):
            continue
        pts = [p for ring in (f.get("geometry") or {}).get("rings", []) for p in ring]
        found.append({"objectId": a["OBJECTID"], "project": name,
                      "boundaryFiled": dt.datetime.fromtimestamp(a["DB_DATE"] / 1000, dt.timezone.utc).date().isoformat() if a["DB_DATE"] else None,
                      "acres": round(a["POLY_AREA"] or 0, 1),
                      "center": [round(sum(p[1] for p in pts) / len(pts), 5), round(sum(p[0] for p in pts) / len(pts), 5)] if pts else None})
    print(f"SC DES boundaries in the region: {len(feats)}, utility-like: {len(found)}", file=sys.stderr)
    return len(feats), sorted(found, key=lambda r: r["boundaryFiled"] or "", reverse=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="01/01/2024")
    ap.add_argument("--out", default=str(ROOT / "data" / "permits" / "permit-search.json"))
    a = ap.parse_args()
    since = dt.datetime.strptime(a.since, "%m/%d/%Y").date()
    today = dt.date.today()
    ga_searches, ga = georgia(since, today)
    sc_total, sc = south_carolina()
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump({
        "retrievedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "Utility-like land-disturbance filings near the Savannah River leads. A filing is not a crew schedule; "
                "no filing found is not evidence that no work is planned. Not part of the snapshot.",
        "georgia": {"source": "Georgia EPD GEOS Public Inquiry Portal (NPDES)", "url": GEOS, "searches": ga_searches, "utilityFilings": ga},
        "southCarolina": {"source": "SC DES OCRM coastal-zone land-disturbance boundaries (LD_BOUND_CURRENT)", "url": SC_LAYER,
                          "bbox": SC_BBOX, "boundariesInRegion": sc_total, "utilityBoundaries": sc},
    }, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"{len(ga)} Georgia filings, {len(sc)} South Carolina boundaries → {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
