#!/usr/bin/env python3
"""Deterministically parse the Region B planning documents into project records.

Inputs (cached by fetch_source.py):
  desc-scrtp-2026-2030 / -2025-2029 / -2024-2028   DESC "Planned Transmission Projects $2M and above"
  gpc-irp-2025-vol3                                 Georgia Power 2025 IRP Vol. 3 (2024 GA ITS Ten-Year Plan)

Output: data/region-b/parsed.json — one record per project per document version, each field
with a short verbatim excerpt and its PDF page, ready for geocoding and review.
"""
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from textnorm import normalize  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "sources" / ".cache"
OUT = ROOT / "data" / "region-b"


def page_text(source_id: str, page: int) -> str:
    return (CACHE / "text" / source_id / f"p{page:04d}.txt").read_text(errors="replace")


def layout_text(source_id: str, page: int) -> str:
    pdf = CACHE / "raw" / f"{source_id}.pdf"
    return subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                          capture_output=True, text=True).stdout


def verified(source_id: str, page: int, excerpt: str) -> bool:
    return normalize(excerpt) in normalize(page_text(source_id, page))


def ev(source_id, page, excerpt, supports):
    excerpt = " ".join(excerpt.split())
    return {"sourceId": source_id, "page": page, "exactExcerpt": excerpt, "supports": supports,
            "verifiedByScript": verified(source_id, page, excerpt)}


def first_words(text: str, n: int = 40) -> str:
    words = " ".join(text.split()).split(" ")
    if len(words) <= n:
        return " ".join(words)
    cut = " ".join(words[:n])
    # prefer ending on a sentence boundary
    m = re.match(r"(.+?\.)\s", cut + " ")
    return m.group(1) if m and len(m.group(1).split()) >= 8 else cut


def mdy(s: str):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", s.strip())
    if not m:
        return None
    mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    return f"{y:04d}-{mo:02d}-{d:02d}"


# ------------------------------------ DESC ------------------------------------

DESC_LISTS = ["desc-scrtp-2026-2030", "desc-scrtp-2025-2029", "desc-scrtp-2024-2028"]
SECTION = ["Project ID", "Project Description", "Project Need", "Project Status", "Planned In-Service Date", "Estimated Project Cost"]


def parse_desc(source_id: str):
    meta = json.loads((CACHE / "meta" / f"{source_id}.json").read_text())
    out = []
    for page in range(1, meta["pageCount"] + 1):
        raw = page_text(source_id, page)
        lines = [l.strip() for l in raw.splitlines()]
        if "Project ID" not in lines:
            continue
        try:
            i_budget = next(i for i, l in enumerate(lines) if l.startswith("5 Year Budget"))
        except StopIteration:
            continue
        i_id = lines.index("Project ID")
        title = " ".join(l for l in lines[i_budget + 1:i_id] if l)

        def block(name):
            i = lines.index(name)
            j = next((k for k in range(i + 1, len(lines)) if lines[k] in SECTION), len(lines))
            return " ".join(l for l in lines[i + 1:j] if l)

        pid = block("Project ID")
        desc = block("Project Description")
        need = block("Project Need")
        status = block("Project Status")
        isd_raw = block("Planned In-Service Date")
        # multi-phase projects list several dates ("10/1/2025 (phase 1) and 10/1/2026 (phase 2)"):
        # the last one is when the whole project is planned in service
        phase_dates = [mdy(d) for d in re.findall(r"\d{1,2}/\d{1,2}/\d{2,4}", isd_raw)]
        isd = phase_dates[-1] if phase_dates else None

        # yearly budget from the layout rendering (header row + value row)
        lay = layout_text(source_id, page)
        costs = {}
        cost_tokens = {}  # cells as printed: "$14,303648" keeps the PDF's own typo, so it can be found verbatim
        lay_lines = lay.splitlines()
        for k, l in enumerate(lay_lines):
            if "Previous" in l and "Total" in l:
                heads = l.split()
                for vl in lay_lines[k + 1:k + 4]:
                    # a cell may lack its "$" (e.g. " 25,000   $0 …"): accept bare numbers, keep column order
                    vals = re.findall(r"\$?\d[\d,]*", vl)
                    if len(vals) == len(heads):
                        costs = {h.rstrip("*"): int(v.replace("$", "").replace(",", "")) for h, v in zip(heads, vals)}
                        cost_tokens = {h.rstrip("*"): v for h, v in zip(heads, vals)}
                        break
                if not costs:
                    print(f"warn: {source_id} p.{page}: budget row not parsed", file=sys.stderr)
                break

        cost_ev = []
        for y, v in costs.items():
            if y.isdigit() and v > 0:
                e = ev(source_id, page, f"{y} ${v:,}", f"budgeted spending in {y}")
                if e["verifiedByScript"]:
                    cost_ev.append(e)
        # the text layer stacks the leading columns ("Previous\n2026\n$A\n$B"), so "2026 $B" alone is never found:
        # cite them together, as printed, whenever they carry the 'Previous' amount or an uncited year's amount
        cols = [h for h in cost_tokens if h == "Previous" or h.isdigit()]
        cited = {e["supports"] for e in cost_ev}
        for k in (2, 3):  # "Previous 2026 $A $B" or "Previous 2026 2027 $A $B $C"
            hs = cols[:k]
            yrs = [h for h in hs if h.isdigit()]
            if len(hs) < k or not yrs:
                break
            if not costs.get("Previous") and all(f"budgeted spending in {y}" in cited or not costs.get(y) for y in yrs):
                continue
            parts = ([f"spending before {yrs[0]} ('Previous' column)"] if costs.get("Previous") else []) + [f"budgeted spending in {y}" for y in yrs if costs.get(y)]
            e = ev(source_id, page, " ".join(hs) + " " + " ".join(cost_tokens[h] for h in hs), " and ".join(parts))
            if e["verifiedByScript"]:
                cost_ev.insert(0, e)  # the leading columns hold the window's start: cite them first
                break
        if costs.get("Previous") and not any("'Previous' column" in e["supports"] for e in cost_ev):
            # a scrambled text layer ("Previous 2026 … Total $A $0 … $total $B"): cite the whole table as printed
            n = len(cost_tokens)
            m = re.search(r"Previous(?: (?:\d{4}|Total\*?))+" + r"(?: \$?\d[\d,]*)" * n + r"(?!\S)", " ".join(raw.split()))
            if m:
                e = ev(source_id, page, m.group(0), f"the budget table: spending before {cols[1] if len(cols) > 1 else 'the first year'} ('Previous' column) and by year")
                if e["verifiedByScript"]:
                    cost_ev.insert(0, e)
        if costs.get("Total"):
            for txt in (f"Total ${costs['Total']:,}", f"Total* ${costs['Total']:,}", f"${costs['Total']:,}"):
                e = ev(source_id, page, txt, "total estimated project cost")
                if e["verifiedByScript"]:
                    cost_ev.append(e)
                    break

        if not costs:
            # some projects state cost in prose ("Estimated cost of $20,350,000 is to be financed by …")
            m = re.search(r"Estimated cost of \$([\d,]+)[^.]*\.", " ".join(raw.split()))
            if m:
                costs = {"Total": int(m.group(1).replace(",", ""))}
                e = ev(source_id, page, first_words(m.group(0), 30), "total estimated project cost (stated in prose)")
                if e["verifiedByScript"]:
                    cost_ev.append(e)
        miles = re.search(r"(?:approximately|approx\.?)\s+([\d.]+)\s*(?:-\s*)?miles?", desc, re.I) or re.search(r"([\d.]+)\s*(?:-\s*)?miles?", desc, re.I)
        out.append({
            "sourceId": source_id, "page": page, "projectId": pid, "title": title,
            "description": desc, "need": need, "status": status, "inService": isd, "inServiceRaw": isd_raw,
            "phaseDates": phase_dates,
            "costs": costs, "miles": float(miles.group(1)) if miles else None,
            "evidence": {
                "title": ev(source_id, page, title, "project name"),
                "projectId": ev(source_id, page, f"Project ID {pid}", "DESC project ID"),
                "description": ev(source_id, page, first_words(desc), "project scope"),
                "status": ev(source_id, page, f"Project Status {status}", "project status"),
                "inService": ev(source_id, page, f"Planned In-Service Date {isd_raw}", "planned in-service date"),
                "costs": cost_ev,
            },
        })
    return out


# ------------------------------------ GPC ------------------------------------

GPC = "gpc-irp-2025-vol3"
ROW_RE = re.compile(r"^\s*(\d{3})\s+(20\d{2})\s+(\d{5})\s+(.*?)\s{2,}(\d{1,2}/\d{1,2}/\d{4})\s+([A-Z]{2,5})\s")


def parse_gpc_summary():
    """Zone / year / TEAMS / name / need date / sponsor from the summary table pages."""
    rows = {}
    for page in range(170, 200):
        lay = layout_text(GPC, page)
        if "TEAMS" not in lay:
            continue
        lines = lay.splitlines()
        cur = None
        for l in lines:
            m = ROW_RE.match(l)
            if m:
                zone, year, teams, name, need, sponsor = m.groups()
                cur = {"zone": zone, "year": int(year), "teams": teams, "name": name.strip(), "need": mdy(need),
                       "sponsor": sponsor, "summaryPage": page}
                rows[teams] = cur
            elif cur and l.strip() and not re.search(r"Page \d+ of|Ten-Year Plan|CRITICAL|contents|policy|PUBLIC", l):
                # continuation of a wrapped project name sits in the name column
                frag = l.strip()
                if len(frag) < 60 and not frag.startswith("$"):
                    cur["name"] = (cur["name"] + " " + frag).strip()
            elif not l.strip():
                pass
    return rows


def parse_gpc_details():
    meta = json.loads((CACHE / "meta" / f"{GPC}.json").read_text())
    out = {}
    for page in range(1, meta["pageCount"] + 1):
        raw = page_text(GPC, page)
        m_t = re.search(r"Teams #\s*(\d+)", raw)
        m_d = re.search(r"Need Date\s+(\d{2}/\d{2}/\d{4})\s+Start Date\s+(\d{2}/\d{2}/\d{4})", raw)
        if not m_t or not m_d:
            continue
        lines = [l.strip() for l in raw.splitlines()]
        i_t = next(i for i, l in enumerate(lines) if l.startswith("Teams #"))
        title_lines = []
        for l in reversed(lines[:i_t]):
            if not l or l.endswith("employees.") or "CEII" in l:
                break
            title_lines.insert(0, l)
        title = " ".join(title_lines)
        desc_m = re.search(r"Description\s*\n(.*?)\n\s*Supporting Statement", raw, re.S)
        desc = " ".join(desc_m.group(1).split()) if desc_m else ""
        teams = m_t.group(1)
        miles = re.search(r"(?:approximately|approx\.?)\s+([\d.]+)\s*miles?", desc, re.I) or re.search(r"([\d.]+)\s*(?:-\s*)?miles?", desc, re.I)
        need_raw, start_raw = m_d.group(1), m_d.group(2)
        out[teams] = {
            "sourceId": GPC, "page": page, "teams": teams, "title": title, "description": desc,
            "need": mdy(need_raw), "start": mdy(start_raw), "miles": float(miles.group(1)) if miles else None,
            "evidence": {
                "title": ev(GPC, page, title, "project name"),
                "teams": ev(GPC, page, f"Teams # {teams}", "TEAMS project number"),
                "dates": ev(GPC, page, f"Need Date {need_raw} Start Date {start_raw}", "need (in-service) date and start date"),
                "description": ev(GPC, page, first_words(desc), "project scope") if desc else None,
                "costRedacted": ev(GPC, page, "Estimated Cost – GPC REDACTED", "cost is redacted in the public disclosure"),
            },
        }
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    desc = {sid: parse_desc(sid) for sid in DESC_LISTS}
    summary = parse_gpc_summary()
    details = parse_gpc_details()
    gpc = []
    for teams, d in details.items():
        s = summary.get(teams, {})
        gpc.append({**d, "zone": s.get("zone"), "sponsor": s.get("sponsor"), "summaryPage": s.get("summaryPage"),
                    "summaryName": s.get("name")})
    missing = sorted(set(summary) - set(details))
    json.dump({"desc": desc, "gpc": gpc, "gpcSummaryOnly": [summary[t] for t in missing]},
              open(OUT / "parsed.json", "w"), indent=1)
    for sid, rows in desc.items():
        bad = sum(1 for r in rows for k, e in r["evidence"].items() if k != "costs" and e and not e["verifiedByScript"])
        print(f"{sid}: {len(rows)} projects, {bad} unverified field excerpts")
    bad = sum(1 for r in gpc for k, e in r["evidence"].items() if e and not e["verifiedByScript"])
    sponsors = {}
    for r in gpc:
        sponsors[r["sponsor"]] = sponsors.get(r["sponsor"], 0) + 1
    print(f"gpc: {len(gpc)} detail records ({bad} unverified excerpts), {len(summary)} summary rows, "
          f"{len(missing)} summary-only; sponsors {sponsors}")


if __name__ == "__main__":
    main()
