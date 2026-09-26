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
- Newer dated statements (SERTP 2025/2026 in-service years, SC PSC docket letters, the Dominion project page's
  construction start, a Georgia EPD permit window) are added beside the plan's own dates; older dates are kept, never
  overwritten.
- Each project also gets one "scheduled" window: published implementation start → current in-service (GPC Start Date,
  DESC first evidenced spending). It is a schedule, not field-work dates, and the engine evaluates it separately.
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
LIST_FIRST_YEAR = 2026  # the current list itemizes 2026–2030; its 'Previous' column is everything before 2026
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
    "sertp-2026-prelim-plan": ("2026-06-12", "Every page footer is dated '06/12/2026'; the public (Non-CEII) report from the SERTP reference library (its page headers repeat a '(CEII)' template label). Retrieved 2026-09-26 (115 pp.)."),
    "scpsc-2023-115-e-application": ("2023-03-31", "Filed March 31, 2023; stamped 'ACCEPTED FOR PROCESSING - 2023 April 3'. SC PSC Docket 2023-115-E."),
    "scpsc-2023-115-e-order-2023-649": ("2023-09-07", "Order No. 2023-649, dated September 7, 2023. SC PSC Docket 2023-115-E."),
    "scpsc-2023-115-e-letter-2024-05": ("2024-05-15", "DESC letter dated May 15, 2024. SC PSC Docket 2023-115-E."),
    "scpsc-2023-115-e-letter-2025-03": ("2025-03-07", "Electronically filed March 7, 2025; no later schedule letter was found in the docket (searched 2026-09-26). SC PSC Docket 2023-115-E."),
    "ga-epd-noi-big-ogeechee-little-ogeechee": ("2026-01-05", "Georgia EPD GEOS NPDES infrastructure Notice of Intent, initial notification submitted 2026-01-05. Retrieved 2026-09-26."),
}

SERTP = "sertp-2025-plan"
# SERTP 2025 (Nov 2025) in-service years, newer than the Ten-Year Plan's December 2024 Need Dates: TEAMS → (page, excerpt, year)
SERTP_IN_SERVICE = {
    "20065": (111, "In-Service Year: Project Name: 2028 SAV: GOSHEN (SAV) – MCINTOSH 115 KV TRANSMISSION LINE, REBUILD", 2028),
    "20989": (111, "In-Service Year: Project Name: 2028 SAV: RICE HOPE, NEW 230/115 KV AUTOTRANSFORMER, INSTALL", 2028),
    "20407": (130, "In-Service Year: 2029 Project Name: SAV: BOULEVARD – MAGNOLIA – TRUMAN PARKWAY 115 KV TRANSMISSION LINES, REBUILD", 2029),
    "20784": (131, "In-Service Year: Project Name: 2029 SAV: COLEMAN – MELDRIM 115 KV TRANSMISSION LINE, REBUILD", 2029),
    "20787": (131, "In-Service Year: Project Name: 2029 SAV: LITTLE OGEECHEE 230/115 KV, BANK REPLACEMENT", 2029),
}
# SERTP entries whose scope differs from the Ten-Year Plan's: TEAMS → (page, excerpt, caveat)
SERTP_SCOPE_NOTE = {
    "20784": (131, "Rebuild the Coleman – Meldrim 115 kV transmission line from Four Lakes – Structure 76A, approximately 8.1 miles",
              "SERTP 2025 describes a longer rebuild (Four Lakes – Structure 76A, approximately 8.1 miles) than the Ten-Year Plan's 3-mile "
              "Four Lakes – Meldrim section; its 2029 in-service year is used as the newer statement, but the two may not describe identical work."),
}
SERTP26 = "sertp-2026-prelim-plan"
SERTP_NAME = {SERTP: "SERTP 2025", SERTP26: "SERTP 2026 preliminary"}
SERTP_WHEN = {SERTP: "November 2025", SERTP26: "June 2026"}
# SERTP 2026 Preliminary Expansion Plan (06/12/2026), the newest Georgia Power statement: TEAMS → (page, excerpt, year)
SERTP26_IN_SERVICE = {
    "20065": (53, "In-Service Year: Project Name: 2028 SOCO: SAV: GOSHEN (SAV) - MCINTOSH 115 KV LINE REBUILD", 2028),
    "20989": (53, "In-Service Year: 2028 Project Name: SOCO: SAV: RICE HOPE NEW AUTO TRANSFORMER 230/115 KV", 2028),
    "20785": (39, "In-Service Year: Project Name: 2027 SOCO: SAV: GOSHEN (SAV) - KRAFT 115 KV LINE PARTIAL REBUILD - PHASE 1", 2027),
    "20783": (52, "In-Service Year: 2028 Project Name: SOCO: SAV: COLEMAN - DEAN FOREST 115 KV LINE REBUILD", 2028),
    "20407": (69, "In-Service Year: 2029 Project Name: SOCO: SAV: BOULEVARD - MAGNOLIA - TRUMAN PARKWAY 115 KV REBUILDS", 2029),
    "21006": (69, "In-Service Year: 2029 Project Name: SOCO: SAV: BOULEVARD - MAGNOLIA - TRUMAN PARKWAY 115 KV REBUILDS", 2029),
    "20784": (69, "In-Service Year: 2029 Project Name: SOCO: SAV: COLEMAN - MELDRIM 115 KV LINE REBUILD", 2029),
    "21023": (70, "In-Service Year: Project Name: 2029 SOCO: SAV: DEAN FOREST - LITTLE OGEECHEE 230 KV REBUILD", 2029),
    "20787": (70, "In-Service Year: 2029 Project Name: SOCO: SAV: LITTLE OGEECHEE 230/115 KV BANK REPLACEMENT", 2029),
    "20796": (95, "In-Service Year: 2033 Project Name: SOCO: SAV: MELDRIM 230/115 KV BANK D REPLACEMENT", 2033),
    "21116": (77, "In-Service Year: 2030 Project Name: Description: MEAG: GOSHEN AREA STRATEGIC SOLUTION", 2030),
}
# Georgia Power's own definition of its dates: the Start Date is the "schedule for implementation"
GPC_START_DEF = ("gpc-irp-2025-vol3", 174, "The following information is included for each project: 1) project justification, 2) schedule for implementation (start date), and 3) expected required in-service date.",
                 "the Ten-Year Plan's Start Date is its 'schedule for implementation'")
# preserved disagreements that are not dates: TEAMS → (field, description, [(value, [(source, page, excerpt, supports)])])
GPC_DISAGREEMENTS = {
    "20065": ("scope", "Conductor for the Goshen (SAV) – Georgia Pacific (Rincon) rebuild: the Ten-Year Plan names 795 ACSR Drake; both SERTP plans name 1351 ACSS. Kept side by side; the scope used for matching is unchanged.", [
        ("100C 795 ACSR Drake", [("gpc-irp-2025-vol3", 314, "Goshen (Sav) - McIntosh 115kV line using 100C 795 ACSR Drake conductor.", "Ten-Year Plan conductor")]),
        ("200°C 1351 ACSS", [(SERTP26, 53, "of the Goshen (Sav) - McIntosh 115 kV line using 200°C 1351 ACSS conductor.", "SERTP 2026 conductor"),
                             (SERTP, 111, "of the Goshen (Sav) - McIntosh 115 kV transmission line using 200°C 1351 ACSS conductor.", "SERTP 2025 conductor")]),
    ]),
    "21116": ("owner", "Owner: the Ten-Year Plan lists Georgia Power (GPC) as sponsor; SERTP 2026 titles the project 'MEAG:' and assigns the new 230 kV line to MEAG and the switching station to GPC. Kept under Georgia Power here; the line may be MEAG's.", [
        ("Georgia Power (sponsor GPC, Ten-Year Plan)", [("gpc-irp-2025-vol3", 382, "GOSHEN AREA STRATEGIC SOLUTION Teams # 21116", "Ten-Year Plan project page, without the 'MEAG:' prefix the plan gives MEAG projects; its summary table lists sponsor GPC"),
                                                         ("gpc-irp-2025-vol3", 189, "MEAG: PIO NONO 230/115KV AREA SOLUTION", "the Ten-Year Plan prefixes MEAG-sponsored projects 'MEAG:'")]),
        ("MEAG (new line) and GPC (switching station)", [(SERTP26, 77, "In-Service Year: 2030 Project Name: Description: MEAG: GOSHEN AREA STRATEGIC SOLUTION GPC: Construct a 230 kV switching station on the Waynesboro - Wilson 230 kV line. MEAG: Build a new 230 kV line between the switching station and Goshen", "SERTP 2026 splits the work between GPC and MEAG")]),
    ]),
}
# SERTP 2026 entries that add to a Ten-Year Plan project without changing its dates: TEAMS → [(fact label, value, page, excerpt, caveat)]
SERTP26_NOTES = {
    "20785": [("SERTP 2026 Phase 2 in-service year", "2031 (3.04 mi, Goshen – Rice Hope)", 91,
               "In-Service Year: 2031 Project Name: SOCO: SAV: GOSHEN (SAV) - KRAFT 115 KV LINE PARTIAL REBUILD (PHASE 2) Description: Rebuild 3.04 miles of Goshen - Kraft 115 kV line from Goshen - Rice Hope",
               "SERTP 2026 splits the Goshen – Kraft rebuild: Phase 1 (about 3.48 miles) in 2027, which matches the Ten-Year Plan's 06/01/2027 Need Date, "
               "and Phase 2 (3.04 miles, Goshen – Rice Hope) in 2031. Phase 2 is kept as a note and is not used for matching.")],
}
# new Savannah-area Southern Company projects first listed in SERTP 2026 (none has a Ten-Year Plan page or a published start date)
SERTP26_NEW = [
    {"id": "sertp26-mcintosh-relays", "page": 50, "year": 2028, "name": "SOCO: MCINTOSH 230 KV BREAKER CONTROL RELAY UPGRADES",
     "yearExcerpt": "In-Service Year: 2028 Project Name: SOCO: MCINTOSH 230 KV BREAKER CONTROL RELAY UPGRADES",
     "scope": "Replace existing (20) 230 kV breaker control relays with (20) high speed breaker control relays at McIntosh 230 kV breaker and a half bus.",
     "need": "Protection analysis identified the project modifications are required due to the interconnection of the Proposed Generating Facility."},
    {"id": "sertp26-west-mcintosh-breakers", "page": 54, "year": 2028, "name": "SOCO: WEST MCINTOSH REPLACEMENT OF 230 KV LOW SIDE BREAKERS",
     "yearExcerpt": "In-Service Year: 2028 Project Name: SOCO: WEST MCINTOSH REPLACEMENT OF 230 KV LOW SIDE BREAKERS",
     "scope": "Replace (2) 230 kV LS breakers at West Mcintosh with new with higher rated breakers.",
     "need": "Protection analysis identified the project modifications are required due to the interconnection of the proposed generating facility."},
    {"id": "sertp26-calvert-west-mcintosh", "page": 62, "year": 2029, "name": "SOCO: CALVERT - WEST MCINTOSH 230 KV RECONDUCTOR",
     "yearExcerpt": "In-Service Year: 2029 Project Name: SOCO: CALVERT - WEST MCINTOSH 230 KV RECONDUCTOR",
     "scope": "Reconductor 12 miles of the Calvert - West McIntosh 230 kV line from 1351 54/19 ACSR at 100°C to Katmai ACCS C7 at 180°C advanced conductor.",
     "need": "The Calvert – West McIntosh 230 kV transmission line overloads under contingency.", "miles": 12},
    {"id": "sertp26-west-mcintosh-autobank", "page": 72, "year": 2029, "name": "SOCO: WEST MCINTOSH AUTOBANK 115 KV SWITCH UPGRADES",
     "yearExcerpt": "In-Service Year: Project Name: 2029 SOCO: WEST MCINTOSH AUTOBANK 115 KV SWITCH UPGRADES",
     "scope": "Upgrade three 115 kV 2000A switches to 3000A.", "need": "Equipment reaches full rating under contingency."},
    {"id": "sertp26-meldrim-auto", "page": 102, "year": 2035, "name": "SOCO: SAV: MELDRIM NEW 230/115 KV AUTOTRANSFORMER",
     "yearExcerpt": "In-Service Year: Project Name: 2035 SOCO: SAV: MELDRIM NEW 230/115 KV AUTOTRANSFORMER",
     "scope": "Install a second 230/115 kV auto transformer at Meldrim with associated station equipment.",
     "need": "The Meldrim 230/115 kV auto transformer overloads under contingency."},
]
# SC PSC Docket 2023-115-E certificates both Okatie lines (Jasper – Okatie #2, Okatie – Riverport) and the Riverport substation
PSC_DOCKET = "SC PSC Docket 2023-115-E"
PSC_CLAIMS = [  # (source, page, excerpt, date, label, current) — newest first
    ("scpsc-2023-115-e-letter-2025-03", 2, "DESC now estimates the commercial operation date for the facilities to be December 1, 2026.", "2026-12-01",
     "commercial operation (SC PSC letter of Mar 2025)", True),
    ("scpsc-2023-115-e-letter-2024-05", 1, "DESC now anticipates the facilities entering commercial operation by May 31, 2026.", "2026-05-31",
     "commercial operation (SC PSC letter of May 2024)", False),
    ("scpsc-2023-115-e-order-2023-649", 23, "any delays in the planned commercial operation date of May 31, 2025.", "2025-05-31",
     "planned commercial operation (SC PSC Order No. 2023-649 of Sep 2023)", False),
]
PSC_COST = ("scpsc-2023-115-e-letter-2025-03", 2, "DESC has revised its initial construction estimate from approximately $54 million to approximately $98 million.")
PSC_PERMIT = ("scpsc-2023-115-e-letter-2025-03", 2, "review for the required South Carolina Coastal Zone Consistency Certification. DESC is hopeful that approval from the SCDES-BCM will be obtained soon.")
PSC_PROJECTS = {  # DESC project ID → line in the docket, its application row (page, excerpt), ROW width, length, extra cited facts
    "06367 D - G": {"line": "Jasper – Okatie 230 kV Line No. 2", "match": "matched by name (Jasper – Okatie 230 kV #2)", "width": 100, "miles": 6.6,
                    "row": (2, "Jasper- Okatie 230 kV Line No. 2 EXTENDING FROM: Jasper Substation in Jasper County, South Carolina TO: Okatie Substation in Jasper County, South Carolina ESTIMATED LENGTH: 6.6 MILES WIDTH OF RIGHT-OF-WAY: 100 FEET"),
                    "facts": [("Existing corridor (SC PSC order)", "runs mostly beside an existing DESC and Santee Cooper right-of-way", "scpsc-2023-115-e-order-2023-649", 16,
                               "most of the Jasper - Okatie 230 kV line No, 2 will run parallel and adjacent to an existing right-of-way containing multiple DESC and Santee Cooper transmission lines")]},
    "6367 D": {"line": "Okatie – Riverport 230 kV Line", "match": "matched by name (Okatie – Riverport 230 kV)", "width": 150, "miles": 12.4,
               "row": (3, "Okatie — Riverport 230 kV Line EXTENDING FROM: Okatie Substation in Jasper County, South Carolina TO: Proposed Riverport Substation in Jasper County ESTIMATED LENGTH: 12.4 MILES WIDTH OF RIGHT-OF-WAY: 150 FEET"),
               "facts": [("Structures (SC PSC application)", "double-circuit single poles from Okatie Substation to Hardeeville Tap", "scpsc-2023-115-e-application", 3,
                          "Single Pole (Double Circuit) Tangent and Angle Structures (from Okatie Substation to Hardeeville Tap)"),
                         ("Existing corridor (SC PSC order)", "about 3.1 miles inside an existing cleared DESC right-of-way", "scpsc-2023-115-e-order-2023-649", 16,
                          "approximately 3.1 miles of the Okatie - Riverport 230 kV line will be built within an existing cleared DESC right-of-way where the proposed line will parallel existing DESC and Santee Cooper transmission lines")],
               # the tap's earlier names: an identity inference, recorded but never merged
               "names": [("desc-scrtp-2024-2028", 22, "Riverport Tap: Construct Tap Project ID 06367 A - C, H", "2024–2028 list: 'Riverport Tap', ID 06367 A - C, H"),
                         ("desc-scrtp-2025-2029", 17, "Sherwood Tap: Construct Tap Project ID 06367 A - C, H", "2025–2029 list: 'Sherwood Tap', same ID"),
                         ("desc-jasper-okatie-sherwood-page", None, "The second 230 kV line will begin at the Okatie substation and end at the new Sherwood substation.", "Dominion page: the second line ends at the new Sherwood substation")]},
}
# state permit windows that date field work for a Ten-Year Plan project: TEAMS → window
PERMIT_WINDOWS = {
    "19966": {"sourceId": "ga-epd-noi-big-ogeechee-little-ogeechee", "start": "2026-01-19", "end": "2027-06-30",
              "excerpts": [("Facility Name: Big Ogeechee to Little Ogeechee", "facility named in the Georgia EPD Notice of Intent"),
                           ("Owner’s Name: Georgia Power", "owner named in the Notice of Intent"),
                           ("Start Date: 01/19/2026", "land-disturbance start date"),
                           ("Completion Date: ¨ Regulated by a certified Local Issuing Authority (LIA): 06/30/2027", "land-disturbance completion date (the PDF text layer splits this field)")],
              "link": (SERTP, 75, "construct new 230 kV transmission lines to Little Ogeechee substation", "SERTP 2025 includes new 230 kV lines to Little Ogeechee in this project's scope"),
              "note": "Georgia EPD stormwater Notice of Intent (submitted 2026-01-05) for 'Big Ogeechee to Little Ogeechee', owner Georgia Power: land-disturbance permit window "
                      "01/19/2026 → 06/30/2027. These are permit-coverage dates, not a crew schedule. Linking the NOI to TEAMS 19966 is an inference from SERTP 2025, "
                      "which lists new 230 kV lines to Little Ogeechee in this project's scope.",
              "sourceLabel": "Georgia EPD permit window (land disturbance)"},
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
                "The page gives no end, so the SCRTP planned in-service date bounds the window; the field work within is not dated. "
                "In its March 7, 2025 letter to the SC PSC, DESC said a required South Carolina Coastal Zone Consistency Certification was still pending, "
                "so the anticipated Q1 2025 start may have slipped; no source gives a later start.",
        "caveatEvidence": [(PSC_PERMIT, "in March 2025 a required state coastal-zone certification was still pending (caveat on the page's Q1 2025 start)")],
        "sourceLabel": "Dominion project page start → SCRTP planned in-service",
    },
}
MINOR_SHARE = 0.05
LIST_FIRST = {"desc-scrtp-2026-2030": 2026, "desc-scrtp-2025-2029": 2025, "desc-scrtp-2024-2028": 2024}


def mdy(iso):
    return f"{iso[5:7]}/{iso[8:]}/{iso[:4]}"


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


def desc_schedule(r, pid, earlier, dup_ids, same_project):
    """Published schedule: first evidenced spending → planned in-service. The earliest list with a 'Previous' amount dates the start
    ("before 2024"); without one, the current list's first budgeted year. Never started from an in-service date alone."""
    if not r["inService"]:
        return None
    start = e = sid = None
    for list_id in ["desc-scrtp-2024-2028", "desc-scrtp-2025-2029", CURRENT]:
        rec = r if list_id == CURRENT else earlier[list_id].get(norm_id(pid))
        if not rec or (pid in dup_ids and not same_project(rec["title"], r["title"])) or not rec["costs"].get("Previous"):
            continue
        e = next((x for x in rec["evidence"]["costs"] if "'Previous' column" in x["supports"] and x["verifiedByScript"]), None)
        if e:
            y = LIST_FIRST[list_id] - 1
            start, sid, open_start = {"earliest": f"{y - 2}-01-01", "latest": f"{y}-12-31", "precision": "year"}, list_id, True
            break
    if not start:
        years = sorted(int(y) for y, v in r["costs"].items() if y.isdigit() and v > 0)
        e = next((x for x in r["evidence"]["costs"] if years and x["verifiedByScript"] and re.search(rf"(^|\s){years[0]}(\s|$)", x["exactExcerpt"])), None)
        if not e:
            return None
        start, sid, open_start = {"earliest": f"{years[0]}-01-01", "latest": f"{years[0]}-12-31", "precision": "year"}, CURRENT, False
    end = iso_fix(r["inService"])[0]
    if start["latest"] > end["latest"]:
        return None
    first = (f"spending before {LIST_FIRST[sid]} ('Previous' column, {LIST_LABEL[sid]}; the start year is not published)" if open_start
             else f"first budgeted year {start['latest'][:4]} ({LIST_LABEL[sid]})")
    return {
        "claimSourceId": sid, "phase": "scheduled", "start": start, "end": end, "continuous": True, **({"openStart": True} if open_start else {}),
        "evidence": [e, r["evidence"]["inService"]],
        "note": f"Published schedule: {first} → planned in-service {mdy(end['latest'])}. DESC publishes spending and an in-service date, "
                "not construction dates; the field work within this schedule is not dated.",
        "sourceLabel": f"SCRTP {LIST_LABEL[sid]} spending → 2026–2030 list planned in-service",
    }


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
            claims.append({"claimSourceId": CURRENT, "label": f"planned in-service ({LIST_LABEL[CURRENT]})", "date": date, "evidence": [E["inService"]], "current": True})
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
            ce = [ev(src, pg, x, why) for (src, pg, x), why in pw.get("caveatEvidence", [])]
            windows.append({
                "claimSourceId": pw["sourceId"], "phase": "general-construction", "start": pw["start"], "end": iso_fix(r["inService"])[0],
                "continuous": True, "boundsOnly": True, "evidence": [x for x in pe + ce if x["verifiedByScript"]] + [E["inService"]], "note": pw["note"],
                "sourceLabel": pw["sourceLabel"],
            })
        # coarse budget-year window; a year under 5% of the total is preconstruction spending and never starts it
        def window_costs(costs, skipped_years, prev_minor=False):
            """Years that set the window first; skipped (preconstruction) years and a minor 'Previous' cell last, labelled as such."""
            ok = [x for x in costs if x["verifiedByScript"]]
            pre = {f"budgeted spending in {y}" for y in skipped_years}
            # a combined "Previous 2026 $A $B" excerpt ends with its last year's label; a 'Previous'-only cell ends with the column name
            is_pre = lambda x: any(x["supports"].endswith(p) for p in pre) or (prev_minor and x["supports"].endswith("('Previous' column)"))  # noqa: E731
            return [x for x in ok if not is_pre(x)] + [
                {**x, "supports": x["supports"] + " (under 5% of the total: treated as preconstruction)"} for x in ok if is_pre(x)]

        total = r["costs"].get("Total") or 0

        def minor(v):
            return v < MINOR_SHARE * total

        years = sorted(int(y) for y, v in r["costs"].items() if y.isdigit() and v > 0)
        if years and r["inService"]:
            first = next((y for y in years if not minor(r["costs"][str(y)])), years[0])
            prev = r["costs"].get("Previous", 0)
            prev_minor = 0 < prev and minor(prev)
            started_before = prev > 0 and not minor(prev)
            # 'Previous' spending (5%+) means work began before the list's first itemized year, whatever 2026+ holds: the window
            # starts before 2026 and every itemized year falls inside it; the start year is not published, so 2026 - 3 is only a
            # floor for matching and the axis (openStart)
            pre_years = [] if started_before else [y for y in years if y < first]
            skipped = [f"{y}: ${r['costs'][str(y)]:,}" for y in pre_years]
            if prev_minor:
                skipped.insert(0, f"before {LIST_FIRST_YEAR}: ${prev:,}")
            start_year = LIST_FIRST_YEAR if started_before else first
            start = {"earliest": f"{start_year - 3 if started_before else start_year}-01-01", "latest": f"{start_year}-12-31", "precision": "year"}
            old24 = earlier["desc-scrtp-2024-2028"].get(norm_id(pid))
            before_2024 = started_before and old24 and (pid not in dup_ids or same_project(old24["title"], r["title"])) and old24["costs"].get("Previous", 0) > 0
            end_iso = iso_fix(r["inService"])[0]["latest"]
            last_spend = f"{years[-1]}-12-31"
            end_latest = max(end_iso, last_spend)
            end = {"earliest": min(iso_fix(r["inService"])[0]["earliest"], end_latest), "latest": end_latest, "precision": "day" if end_latest == end_iso else "year"}
            late = [y for y in years if y > int(end_iso[:4])]
            late_txt = ", ".join(f"{y}: ${r['costs'][str(y)]:,}" for y in late)
            if start["earliest"] <= end["latest"]:
                windows.append({
                    "claimSourceId": CURRENT, "phase": "unknown", "start": start, "end": end, "continuous": False,
                    **({"openStart": True} if started_before else {}),
                    "evidence": window_costs(E["costs"], pre_years, prev_minor) + [E["inService"]],
                    "note": "Coarse budget-year window: first budgeted spending year → planned in-service date (or the last budgeted spending year, if later). DESC publishes yearly spending, not construction dates"
                            + ("; spending also occurred before 2026 (the list gives only a 'Previous' column), so the start year is not published" if started_before else "")
                            + ("; the 2024–2028 list already shows spending before 2024" if before_2024 else "")
                            + (f"; spending under 5% of the total ({', '.join(skipped)}) is treated as preconstruction and does not start the window" if skipped else "")
                            + (f"; DESC also budgets spending after the planned in-service date ({late_txt}), so the window may run to the end of {late[-1]}" if late else "")
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

        psc = PSC_PROJECTS.get(pid)
        if psc:
            claims += [{"claimSourceId": src, "label": label, "date": {"earliest": d, "latest": d, "precision": "day"},
                        "evidence": [ev(src, pg, x, f"commercial operation date {mdy(d)} ({PSC_DOCKET})")], "current": cur}
                       for src, pg, x, d, label, cur in PSC_CLAIMS]
            pg, row = psc["row"]
            re_ = ev("scpsc-2023-115-e-application", pg, row, f"{psc['line']}: length and right-of-way width in DESC's certificate application")
            facts.append({"key": "rowWidthFt", "label": "Right-of-way width (SC PSC application)", "value": f"{psc['width']} ft", "evidence": [re_]})
            if not any(f["key"] == "lengthMiles" for f in facts):
                facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{psc['miles']:g} mi", "evidence": [re_]})
            facts.append({"key": "other", "label": "Construction estimate for the certificated facilities (SC PSC letter, Mar 2025)",
                          "value": "≈$98 million (revised from ≈$54 million)", "evidence": [ev(*PSC_COST, "DESC's revised construction estimate for both lines and the Riverport substation")]})
            for label, value, src, pg, x in psc["facts"]:
                facts.append({"key": "other", "label": label, "value": value, "evidence": [ev(src, pg, x, label)]})
            caveats.append(f"{PSC_DOCKET} certificates the {psc['line']} ({psc['match']}), together with the other Okatie line and the Riverport 230 kV substation. "
                           f"DESC's letters to the Commission move commercial operation from May 31, 2025 (Order No. 2023-649) to May 31, 2026 (May 2024 letter) "
                           f"to December 1, 2026 (March 2025 letter), the date the 2026–2030 list also gives; the earlier dates are kept as version history. "
                           f"The March 2025 letter says a required South Carolina Coastal Zone Consistency Certification was still pending and raises the construction "
                           f"estimate for the certificated facilities from about $54 million to about $98 million.")
            if psc.get("names"):
                facts.append({"key": "other", "label": "Earlier names of this tap (inference)", "value": "Riverport Tap → Sherwood Tap → Riverport 115kV Tap",
                              "evidence": [page_ev(src, x, why) if pg is None else ev(src, pg, x, why) for src, pg, x, why in psc["names"]]})
                caveats.append("Inference, not stated by one source: the 2024–2028 list's 'Riverport Tap' and the 2025–2029 list's 'Sherwood Tap' (both project ID "
                               "06367 A - C, H) and Dominion's page, whose second line ends 'at the new Sherwood substation', appear to describe this tap under "
                               "earlier names. The ID changed, so those list entries are not merged into this project.")
        sw = desc_schedule(r, pid, earlier, dup_ids, same_project)
        if sw:
            if psc:
                sw["evidence"].append(ev(*PSC_CLAIMS[0][:3], f"commercial operation date 12/01/2026 ({PSC_DOCKET})"))
            windows.append(sw)

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
        windows, claims, facts_extra = [], [], []
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
        # SERTP in-service years, newest first: the regional plans (Nov 2025, Jun 2026) are newer than the Ten-Year Plan (Dec 2024)
        sertp = [(sid, m[r["teams"]]) for sid, m in ((SERTP26, SERTP26_IN_SERVICE), (SERTP, SERTP_IN_SERVICE)) if r["teams"] in m]
        cur_end = claims[0]["date"] if claims else None
        cur_ev = []
        if sertp:
            newest, (page, excerpt, year) = sertp[0]
            yb = {"earliest": f"{year}-01-01", "latest": f"{year}-12-31", "precision": "year"}
            agrees = bool(r["need"]) and r["need"][:4] == str(year)
            for i, (sid, (pg, x, y)) in enumerate(sertp):
                claims.insert(i, {"claimSourceId": sid, "label": f"in-service year ({SERTP_NAME[sid]})", "date": {"earliest": f"{y}-01-01", "latest": f"{y}-12-31", "precision": "year"},
                                  "evidence": [ev(sid, pg, x, f"in-service year {y} ({SERTP_NAME[sid]})")], "current": i == 0})
            se = claims[0]["evidence"][0]
            if agrees:
                # the newest year restates the Need Date's year: the more precise Need Date stays current (the engine uses the most precise agreeing forecast)
                caveats.append(f"{SERTP_NAME[newest]} ({SERTP_WHEN[newest]}) lists this project with in-service year {year}, the year of the Ten-Year Plan's Need Date ({mdy(r['need'])}); the more precise Need Date is used.")
                cur_ev = [se]
            else:
                # the newest year becomes current, older dates stay as version history, and the plan's window is re-bounded Start Date → that year
                for c in claims[len(sertp):]:
                    c.update(current=False, label="need date (2024 Ten-Year Plan)")
                cur_end, cur_ev = yb, [se]
                if windows and windows[0]["start"]["earliest"] > yb["latest"]:
                    # Start Date after the newer in-service year: the two do not form a window (the plan's own window is outdated too)
                    windows.clear()
                    caveats.append(f"The Ten-Year Plan's Start Date ({mdy(r['start'])}) is after the {SERTP_NAME[newest]} in-service year ({year}); no project window is used.")
                elif windows:
                    windows[0]["supersededBy"] = f"gpc-{r['teams']}:w2"
                    windows.append({
                        "claimSourceId": newest, "phase": "unknown", "start": windows[0]["start"], "end": yb,
                        "continuous": True, "boundsOnly": True, "evidence": [E["dates"], se],
                        "note": f"Bounds: the Ten-Year Plan's Start Date → the {SERTP_NAME[newest]} in-service year ({year}), which replaces the plan's Need Date; the months of field work within it are not stated.",
                        "sourceLabel": f"Georgia Power Ten-Year Plan start → {SERTP_NAME[newest]} in-service year",
                    })
                older = "; ".join(f"{SERTP_NAME[sid]}: {y}" for sid, (_, _, y) in sertp[1:])
                caveats.append(f"{SERTP_NAME[newest]} ({SERTP_WHEN[newest]}) gives an in-service year of {year}{f' ({older})' if older else ''}; the Ten-Year Plan (a December 2024 snapshot) gives a Need Date of {mdy(r['need'])}. The newest year is used; older dates are kept as version history.")
            if r["teams"] in SERTP_SCOPE_NOTE:
                caveats.append(SERTP_SCOPE_NOTE[r["teams"]][2])
        if r["teams"] in GPC_DISAGREEMENTS:
            caveats.append(f"Source disagreement (preserved): {GPC_DISAGREEMENTS[r['teams']][1]}")
        for label, value, pg, x, note in SERTP26_NOTES.get(r["teams"], []):
            facts_extra.append({"key": "other", "label": label, "value": value, "evidence": [ev(SERTP26, pg, x, label)]})
            caveats.append(note)
        pw = PERMIT_WINDOWS.get(r["teams"])
        if pw:
            pe = [ev(pw["sourceId"], 1, x, why) for x, why in pw["excerpts"]] + [ev(*pw["link"])]
            windows.append({"claimSourceId": pw["sourceId"], "phase": "general-construction", "continuous": True, "note": pw["note"], "sourceLabel": pw["sourceLabel"],
                            "start": {"earliest": pw["start"], "latest": pw["start"], "precision": "day"}, "end": {"earliest": pw["end"], "latest": pw["end"], "precision": "day"},
                            "evidence": [x for x in pe if x["verifiedByScript"]]})
            caveats.append(pw["note"])
        # published schedule: Start Date ("schedule for implementation") → current in-service; appended last so construction window ids stay stable
        if r["start"] and cur_end and r["start"] <= cur_end["latest"]:
            windows.append({
                "claimSourceId": r["sourceId"], "phase": "scheduled", "continuous": True,
                "start": {"earliest": r["start"], "latest": r["start"], "precision": "day"}, "end": cur_end,
                "evidence": [E["dates"], ev(*GPC_START_DEF)] + cur_ev,
                "note": f"Published schedule: the Ten-Year Plan's Start Date ({mdy(r['start'])}), which the plan defines as its 'schedule for implementation', → the current "
                        f"in-service date. The start is as last published (2024 plan); the field work within this schedule is not dated.",
                "sourceLabel": "Georgia Power Ten-Year Plan start → current in-service",
            })
        facts = facts_extra
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
            **({"disagreements": [disagreement(*GPC_DISAGREEMENTS[r["teams"]])]} if r["teams"] in GPC_DISAGREEMENTS else {}),
        })
    projects += sertp26_projects(geo)
    return {"cluster": "sc-ga-gpc", "sources": [], "projects": projects, "relations": [], "unresolved": []}


def disagreement(field, description, sides):
    return {"field": field, "description": description,
            "sides": [{"value": v, "evidence": [ev(src, pg, x, why) for src, pg, x, why in evs]} for v, evs in sides]}


def sertp26_projects(geo):
    """Savannah-area Southern Company projects first listed in SERTP 2026; the plan names the balancing authority (SOCO), not the owner."""
    out = []
    for n in SERTP26_NEW:
        pg = n["page"]
        name = n["name"]
        title_ev = ev(SERTP26, pg, name, "project name (SERTP 2026)")
        year_ev = ev(SERTP26, pg, n["yearExcerpt"], f"in-service year {n['year']} (SERTP 2026 preliminary)")
        baa_ev = ev(SERTP26, pg, "SOUTHERN Balancing Authority Area", "listed in the Southern balancing authority area")
        scope_ev = ev(SERTP26, pg, n["scope"], "project scope")
        places, caveats = places_for(f"sertp26:{n['id'][8:]}", geo, title_ev, name, scope=(SERTP26, pg, n["scope"]))
        title = title_case(re.sub(r"^SOCO:\s*", "", name))
        sav = "SAV:" in name
        caveats.insert(0, "SERTP 2026 lists this project under 'SOCO' in the Southern balancing authority area and does not name the owning company. "
                          + ("Georgia Power is inferred from the 'SAV' prefix, the sponsor code the Ten-Year Plan uses for Georgia Power's Savannah area."
                             if sav else "Georgia Power is inferred: OSM tags the McIntosh and West McIntosh substations as Georgia Power's (mapper-supplied), "
                                         "and the Ten-Year Plan's other McIntosh work (TEAMS 20277) is sponsored by Georgia Power's Savannah area (SAV)."))
        caveats.append("First listed here from the SERTP 2026 Preliminary Expansion Plan (June 12, 2026); the 2024 Ten-Year Plan has no project page for it. "
                       "No start date is published, so there is no schedule window; only the in-service year is compared.")
        facts = []
        vf, _ = voltage_fact(name, title_ev, SERTP26, pg, n["scope"])
        if vf:
            facts.append(vf)
        if n.get("miles"):
            facts.append({"key": "lengthMiles", "label": "Line length", "value": f"{n['miles']} mi", "evidence": [scope_ev]})
        out.append({
            "id": n["id"], "title": title, "shortTitle": short_title(title), "titleEvidence": [title_ev],
            "summary": f"{n['scope']} {n['need']}", "owners": [{"utilityId": "gpc", "name": "Georgia Power", "evidence": [title_ev, baa_ev]}],
            "status": {"value": "proposed", "label": "In the 2026 SERTP Preliminary Expansion Plan", "asOf": "2026-06-12", "evidence": [year_ev]},
            "states": ["GA"], "counties": [], "facts": facts, "places": places, "route": {"available": False, "precision": "none", "evidence": []},
            "constructionWindows": [], "knownCoordination": [], "caveats": caveats, "docketId": f"SERTP 2026 preliminary · p. {pg}", "region": "southeast",
            "completionClaims": [{"claimSourceId": SERTP26, "label": "in-service year (SERTP 2026 preliminary)",
                                  "date": {"earliest": f"{n['year']}-01-01", "latest": f"{n['year']}-12-31", "precision": "year"}, "evidence": [year_ev], "current": True}],
        })
    return out


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


SERTP_GENERIC = {"sav", "transmission", "line", "lines", "rebuild", "reconductor", "new", "install", "installation", "construct",
                 "replacement", "substation", "bank", "auto", "transformer", "autotransformer", "aka"}


def sertp_kind(title):
    t = title.upper()
    return "bank" if re.search(r"BANK|AUTO|TRANSFORMER", t) else "line" if re.search(r"\bLINES?\b|REBUILD|RECONDUCTOR", t) else "other"


def check_sertp(parsed, source_id=SERTP, mapping=SERTP_IN_SERVICE, notes=SERTP_SCOPE_NOTE):
    """Every SERTP Savannah-area entry whose Ten-Year Plan project states a different year must be in the edition's map.

    Entries are matched to TEAMS projects by place words (one set inside the other) and kind of work (line / bank / other);
    a project passes when any matching entry states its Need Date year (e.g. a split rebuild whose first part keeps the year)."""
    entries = []
    for f in sorted((CACHE / "text" / source_id).glob("p*.txt")):
        for blk in re.split(r"In-Service\s+Year:", f.read_text(errors="replace"))[1:]:
            y = re.search(r"\b(20\d\d)\b", blk)
            name = re.search(r"SAV\s*:(.+?)(?=\n\s*Description:)", blk, re.S)
            if y and name:
                entries.append((int(y.group(1)), " ".join(name.group(1).split())))
    place = lambda t: {w for w in re.findall(r"[a-z]{3,}", re.sub(r"^\w+\s*:", "", t.lower())) if w not in SERTP_GENERIC}  # noqa: E731
    problems = []
    for r in parsed["gpc"]:
        if r["sponsor"] not in ("GPC", "SAV") or not r["need"]:
            continue
        pw, kind = place(r["title"]), sertp_kind(r["title"])
        years = {y for y, t in entries if sertp_kind(t) == kind and pw and (pw <= place(t) or place(t) <= pw)}
        if years and int(r["need"][:4]) not in years and r["teams"] not in mapping:
            problems.append(f"TEAMS {r['teams']} ({r['title']}): Need Date {r['need']}, {SERTP_NAME[source_id]} year(s) {sorted(years)}")
    for teams, (page, excerpt, _) in {**mapping, **{k: (v[0], v[1], None) for k, v in notes.items()}}.items():
        if not ev(source_id, page, excerpt, "")["verifiedByScript"]:
            problems.append(f"TEAMS {teams}: {SERTP_NAME[source_id]} excerpt not found on p. {page}: {excerpt}")
    if problems:
        sys.exit(f"{SERTP_NAME[source_id]} in-service years not reconciled with the Ten-Year Plan (add them to its in-service map):\n  " + "\n  ".join(problems))


def check_curated():
    """Every hand-curated excerpt (SERTP 2026 projects and notes, SC PSC docket, permit windows, disagreements) must be found verbatim."""
    items = [(SERTP26, n["page"], x) for n in SERTP26_NEW for x in (n["name"], n["yearExcerpt"], n["scope"])]
    items += [(SERTP26, pg, x) for notes in SERTP26_NOTES.values() for _, _, pg, x, _ in notes]
    items += [c[:3] for c in PSC_CLAIMS] + [PSC_COST, PSC_PERMIT, GPC_START_DEF[:3]]
    items += [("scpsc-2023-115-e-application", *d["row"]) for d in PSC_PROJECTS.values()]
    items += [(src, pg, x) for d in PSC_PROJECTS.values() for _, _, src, pg, x in d["facts"]]
    items += [(w["sourceId"], 1, x) for w in PERMIT_WINDOWS.values() for x, _ in w["excerpts"]] + [w["link"][:3] for w in PERMIT_WINDOWS.values()]
    items += [(src, pg, x) for _, _, sides in GPC_DISAGREEMENTS.values() for _, evs in sides for src, pg, x, _ in evs]
    bad = [f"{src} p.{pg}: {x}" for src, pg, x in items if not ev(src, pg, x, "")["verifiedByScript"]]
    if bad:
        sys.exit("Curated excerpts not found verbatim:\n  " + "\n  ".join(bad))


def main():
    parsed = json.load(open(RB / "parsed.json"))
    geo = load_geo()
    check_batches(geo)
    check_sertp(parsed)
    check_sertp(parsed, SERTP26, SERTP26_IN_SERVICE, {})
    check_curated()
    OUT.mkdir(parents=True, exist_ok=True)
    src = []
    psc = sorted({c[0] for c in PSC_CLAIMS} | {"scpsc-2023-115-e-application"})
    for sid in [CURRENT, *EARLIER, "gpc-irp-2025-vol3", SERTP, SERTP26, *psc, *{w["sourceId"] for w in PERMIT_WINDOWS.values()},
                *{w["sourceId"] for w in DESC_PAGE_WINDOWS.values()}]:
        m = json.load(open(ROOT / "data" / "sources" / ".cache" / "meta" / f"{sid}.json"))
        src.append({"id": sid, "title": m["title"], "publisher": m["publisher"], "url": m["url"], "sourceType": m["sourceType"],
                    "publishedAt": DOC_DATES.get(sid, (None, None))[0] or m.get("publishedAt"), "documentDateEvidence": DOC_DATES.get(sid, (None, None))[1], "cached": True})
    d = desc_clusters(parsed, geo)
    g = gpc_clusters(parsed, geo)
    d["sources"] = [s for s in src if s["id"].startswith(("desc", "scpsc"))]
    g["sources"] = [s for s in src if s["id"].startswith(("gpc", "sertp", "ga-epd"))]
    json.dump(d, open(OUT / "sc-ga-desc.json", "w"), indent=1)
    json.dump(g, open(OUT / "sc-ga-gpc.json", "w"), indent=1)
    located = lambda ps: sum(1 for p in ps if p["places"])
    print(f"DESC {len(d['projects'])} projects ({located(d['projects'])} located) · GPC {len(g['projects'])} ({located(g['projects'])} located) · geo keys {len(geo)}")


if __name__ == "__main__":
    main()
