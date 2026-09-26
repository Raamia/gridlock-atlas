# GridLock Atlas

**Compare public utility construction plans. Flag where they meet in place or time. Show the evidence.**

GridLock Atlas is our ShellHacks 2026 entry for the **Sperry Tech GridLock Challenge**. It ingests the public future-construction plans of neighboring power utilities, finds project pairs that sit within 25 miles of each other (the sponsor's primary signal), weighs their timing (the secondary signal), and ranks the coordination opportunities. Every fact on screen links to a short verbatim excerpt from a public document, with its page.

> A match is a **review lead**, not a finding that crews or equipment can be shared. Absence of a coordination statement is shown as *unknown*, never as "uncoordinated."

## What's in the box

| | |
| --- | --- |
| **Interactive map** (Mapbox GL) | Both utilities' planned projects, colored by utility; amber links mark every flagged pair; routes only where a source maps them (dashed = schematic); locality halos for approximate places; 3D terrain or flat reading; offline fallback with bundled Census boundaries |
| **Ranked coordination queue** | Needs review · Known coordination · Source conflicts · Possible; explainable priority (place first, then timing, then evidence completeness); adjustable review radius |
| **Evidence inspector** | Where they meet (center-to-center distance with uncertainty, terminals and their geocode provenance), when they build (windows by source, in-service gap), documented coordination, **rough impact estimate**, preserved source disagreements, and the source list |
| **Timeline** | Published windows per source with fuzzy edges for coarse dates, completion claims, shared window or in-service gap |
| **Cited review brief** | One planner-ready question with numbered citations; copy as Markdown, download, or print to PDF |
| **Method & audit** | Matching rules, a live reproduction of the sponsor's worked overlap table, live corpus checks, exclusions, reviewer exports, extraction runs, open research questions |
| **Reviewer mode** | Label pairs (worth review / already coordinated / not useful / insufficient evidence) with a review timer; mark excerpts human-checked; export CSV and `review-log.json` |
| **Guided demo** | Eight-step walkthrough of the three-minute story |

## Data

Snapshot date **26 September 2026**. All sources are public; each is fetched, hashed (SHA-256) and cached, and the app only reads the frozen snapshot (`data/snapshot.json`), so the demo works if publisher sites or APIs are down.

**Region B — Savannah River (SC–GA), the sponsor's example pair**

- Dominion Energy South Carolina: SCRTP *Planned Transmission Projects $2M and above*, 2026–2030 (current), with the 2025–2029 and 2024–2028 editions kept as version history. Parsed deterministically, one project per page, with project ID, status, planned in-service date, yearly budget and scope.
- Georgia Power: 2025 IRP Technical Appendix Vol. 3 — the 2024 GA ITS Ten-Year Plan (public disclosure, Georgia PSC Docket 56002). Parsed from the summary table (zone, TEAMS number, sponsor) and each project page (Start Date, Need Date, scope, miles). GPC and Savannah-area (SAV) projects are included; GTC, MEAG and Dalton projects in the joint plan are out of scope.
- Georgia Power project pages (Effingham County 500 kV, Callaway Road–Thomson 500 kV) and the SERTP 2025 regional plan for context.
- Terminals are geocoded against OpenStreetMap power features (Overpass) and Nominatim, then checked against each plan's own wording; unconfirmed matches are marked lower-confidence and cost ranking points.

**Region A — Upper Midwest and Southern Plains** (featured *Known coordination* cases)

- Dairyland Alma–Blair 345 kV and Xcel/NSPW Western Wisconsin Transmission Connection: the Wisconsin PSC decision states Dairyland's line terminates at Tremval North, the substation approved for Xcel's project.
- Grid Forward Central Wisconsin (ATC and NSPW segments), MISO BECI, MN LRTP projects, and Potter–Beckham (Xcel/SPS Texas and Transource Oklahoma segments), plus completed projects as negative controls.

Research was agent-assisted: AI research agents located facts and exact quotes, adversarial fact-checking agents re-verified them, and **every excerpt is re-located verbatim by script** when the snapshot is built (`scripts/build-snapshot.ts`) and again by the audit (`npm run audit`). Excerpts are labeled "awaiting human check" until a person marks them in reviewer mode and the exported `review-log.json` is committed.

## Method (short)

1. **Place first.** Each project's center is the midpoint of its two named terminals (or its one located point) — exactly the sponsor's guide. A pair is flagged when centers are within the review radius (default 25 mi), with uncertainty bounds `d_low = max(0, d − e_A − e_B)`, `d_high = d + e_A + e_B` (confirmed when `d_high ≤ 25`, possible when only `d_low ≤ 25`). A source-stated shared facility, or terminals geocoded to the same substation, also confirm place. County-only evidence is at most "possible"; schematic routes are never measured.
2. **Then time.** Published construction windows are compared for every source combination (confirmed when `max(S_latest) ≤ min(E_earliest)`). Windows are never derived from in-service dates; where only in-service/need dates exist, their gap in days — the sponsor's secondary signal — informs ranking. DESC's yearly budget is kept as a coarse, "possible-only" window.
3. **Status.** Documented joint work or interface coordination → *Known coordination*. Otherwise within the radius → *Needs review*.
4. **Rank.** Explainable points: place (≤ 60), timing (≤ 30), evidence completeness (≤ 10), minus 5 for lower-confidence locations.

The engine reproduces the sponsor's starter overlap table exactly (six rows, ±0.01 mi and to the day, no extra pairs) — see `tests/engine.test.ts` and the Method drawer.

**Impact estimate (bonus).** For any flagged pair: acres of right-of-way one shared corridor would avoid encumbering twice (`miles × 5,280 × width ÷ 43,560`) and its value, plus one avoided crew mobilization. Defaults are cited (Georgia Transmission easement widths, USDA NASS 2026 land values, MISO transmission cost guide, an SC PSC order on co-building); every input is editable, and the result is labeled a scenario, not a saving.

## Run it

```bash
npm install
cp .env.example .env.local   # add NEXT_PUBLIC_MAPBOX_TOKEN (a public pk. token)
npm run dev                  # http://localhost:3000
```

Checks:

```bash
npm run check        # type-check, lint, unit tests, data audit
npm test             # engine tests incl. the sponsor's worked example
npm run audit        # every fact has evidence; every excerpt re-found in its source
```

Rebuilding data (optional — the snapshot is committed):

```bash
npm run sources:fetch -- --local-pdf "path/to/2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"
python3 scripts/ingest/parse_region_b.py
npm run snapshot:build
GEMINI_API_KEY=... npm run extract:gemini -- desc-scrtp-2026-2030 --page 41   # optional structured-extraction run
```

API: `GET /api/snapshot`, `GET /api/matches?threshold=25&utilityA=&utilityB=&region=&year=`, `GET /api/matches/:id`.

## Demo (three minutes)

1. **Two plans, one map** — Savannah River region: DESC in cyan, Georgia Power in violet.
2. **Compare public plans** — thousands of pairs measured; a few dozen within 25 miles light up in amber.
3. **Top opportunity** — open #1: centers apart, terminals and their provenance, published windows, in-service gap.
4. **Rough impact** — acres and one avoided mobilization, with cited, editable assumptions.
5. **Known coordination** — Upper Midwest: Dairyland × Xcel at Tremval North, filed as a known interface.
6. **Sources disagree** — Xcel's page vs the Wisconsin PSC on completion; DESC's in-service date across plan editions.
7. **Cited brief** — export a planner-ready question with numbered sources.

Or press **Guided demo** in the top bar.

## Limitations

- Public plans are incomplete and change; costs are redacted in the Georgia Power public disclosure.
- Most substations are geocoded from OpenStreetMap by name and checked against plan text; some are approximate or lower-confidence and are labeled so.
- DESC does not publish construction dates; its budget-year window is coarse by design.
- Coordination that is not published cannot be seen. "Needs review" means the reviewed sources are silent.
- Cost guides used by the impact estimate come partly from other regions (MISO) and are indicative only.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Mapbox GL JS 3 · Turf · Zustand · Motion · Vitest · Playwright (visual checks) · Python (source fetch, PDF parsing, geocoding helpers).

Map data © Mapbox © OpenStreetMap contributors. County and state boundaries: US Census Bureau cartographic boundary files.
