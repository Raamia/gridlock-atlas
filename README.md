# GridLock Atlas

**Compare public utility construction plans. Flag where they meet in place or time. Show the evidence.**

GridLock Atlas is our ShellHacks 2026 entry for the **Sperry Tech GridLock Challenge**. It ingests the public future-construction plans of neighboring power utilities, finds project pairs whose closest project points sit within 25 miles (the primary signal), weighs their timing (the secondary signal), and ranks the coordination opportunities. Every fact on screen links to a short verbatim excerpt from a public document, with its page.

> A match is a **review lead**, not a finding that crews or equipment can be shared. Absence of a coordination statement is shown as *unknown*, never as "uncoordinated."

**At a glance** (snapshot of 26 September 2026, engine 1.3.0):

- **Closest points, with provenance.** The engine compares official routes, estimated digitized/terminal segments, and located work sites. It flags 149 of 7,929 candidate pairs (1.9%); the legacy center baseline finds 111, while a "close *or* same time" rule would flag 4,631 (58.4%).
- **Both signals, stated honestly.** 10 of the top 12 Savannah River leads have a confirmed place and overlapping published schedules, including Sperry's own OVL_3 pair (#1, 18 months of overlap); the app always says field-work dates are not published.
- **Sperry's worked example reproduced exactly** (6/6 overlap rows, 10/10 project rows, no extra pairs), then replayed on today's plans.
- **Every fact cited:** 1,786 verbatim excerpts from 103 public sources, each re-found in its cached source by script. GPT-5.5 re-read all 283 plan pages as a cross-check: 2,578 of 2,579 of its quotes are verbatim.

![A selected Savannah River lead with its mapped projects, closest approach, evidence, and timeline](docs/screenshots/top-lead.jpg)

| Where plans meet (Savannah River) | Known coordination (Wisconsin) |
| --- | --- |
| ![Amber links mark every DESC × Georgia Power pair within 25 miles](docs/screenshots/overlaps.jpg) | ![Dairyland Alma–Blair and Xcel WWTC at Tremval North](docs/screenshots/known-coordination.jpg) |
| **Cited review brief** | **Rough impact estimate** |
| ![Brief with numbered, verbatim citations](docs/screenshots/brief.jpg) | ![Sourced, editable impact scenario](docs/screenshots/impact.jpg) |

## What's in the box

| | |
| --- | --- |
| **Interactive map** (Mapbox GL) | Both utilities' planned projects, colored by utility; amber links mark every flagged pair; routes only where a source maps them (dashed = schematic); locality halos for approximate places; 3D terrain or flat reading; offline fallback with bundled Census boundaries |
| **Ranked coordination queue** | Needs review · Known coordination · Source conflicts · Possible; explainable priority (place first, then timing, then evidence completeness); adjustable review radius; CSV exports of the closest-point overlap table and a legacy-compatible project table. Exports include tier, geometry basis, estimate status, and legacy center distance. |
| **Evidence inspector** | Where they meet (closest-point distance, tier, uncertainty, geometry provenance, and legacy center readout), when they build, documented coordination, **impact channels**, preserved source disagreements, and the source list |
| **Timeline** | Published windows per source with fuzzy edges for coarse dates, completion claims, shared window or in-service gap |
| **Cited review brief** | One planner-ready question with numbered citations; copy as Markdown, download, or print to PDF |
| **Method & audit** | Matching rules with live counts for Sperry's 25-mile rule, a live reproduction of both tables of the sponsor's worked example, **Sperry's six rows in today's plans**, the third export (every flagged pair with `sponsor_rule` and `beyond_rule_reason`), the guide's three-step location workflow with our counts, a one-name-one-location audit, cited context (FERC Order 1920, SCRTP → SERTP, the newest-source check, CEII), live corpus checks, the **evaluation** (baselines, negative controls, extraction agreement, from `npm run eval`), exclusions, reviewer exports, extraction runs, open research questions |
| **Reviewer mode** | Label pairs (worth review / already coordinated / not useful / insufficient evidence) with a review timer; mark excerpts human-checked; export CSV and `review-log.json` |
| **Guided demo** | Eight-step walkthrough of the three-minute story |

## Data

Snapshot date **26 September 2026**. All sources are public; each is fetched, hashed (SHA-256) and cached, and the app only reads the frozen snapshot (`data/snapshot.json`), so the demo works if publisher sites or APIs are down.

**Region B — Savannah River (SC–GA), the sponsor's example pair**

- Dominion Energy South Carolina: SCRTP *Planned Transmission Projects $2M and above*, 2026–2030 (current), with the 2025–2029 and 2024–2028 editions kept as version history. Parsed deterministically, one project per page, with project ID, status, planned in-service date, yearly budget and scope.
- Georgia Power: 2025 IRP Technical Appendix Vol. 3 — the 2024 GA ITS Ten-Year Plan (public disclosure, Georgia PSC Docket 56002). Parsed from the summary table (zone, TEAMS number, sponsor) and each project page (Start Date, Need Date, scope, miles). GPC and Savannah-area (SAV) projects are included; GTC, MEAG and Dalton projects in the joint plan are out of scope.
- SERTP's 2025 regional plan (November 2025) and 2026 Preliminary Expansion Plan (June 12, 2026). Where SERTP gives a newer in-service year than the Ten-Year Plan, the newer year is current and older dates are kept as version history; where SERTP 2026 only repeats the Need Date's year, the more precise Need Date stays current (a generator check fails if a Savannah-area SERTP year is left unreconciled). SERTP 2026 adds five Savannah-area projects at McIntosh, West McIntosh and Meldrim. It files them under "SOCO" without naming the owner, so Georgia Power is labeled an inference. Where sources disagree (the conductor of the Goshen–McIntosh rebuild; whether Georgia Power's 21116 line is MEAG's), both sides are kept with their excerpts.
- Georgia Power project pages (Effingham County 500 kV, Callaway Road–Thomson 500 kV), and a Georgia EPD stormwater Notice of Intent for "Big Ogeechee to Little Ogeechee" (permit window 01/19/2026 → 06/30/2027, labeled permit-coverage dates, not a crew schedule; linking it to TEAMS 19966 is labeled an inference).
- DESC's Jasper–Okatie 230 kV #2 siting docket (SC PSC Docket 2023-115-E): commercial operation "December 1, 2026" (letter of March 7, 2025, p. 2), right-of-way widths (application pp. 2–3), and the construction estimate revised "from approximately $54 million to approximately $98 million" (letter, p. 2). Dominion's project page dates the start of construction (Q1 2025, "Anticipated – Subject to Change"); the same PSC letter says a Coastal Zone certification was still pending, so the app notes the start may have slipped.
- Terminals are geocoded against OpenStreetMap power features (Overpass) and Nominatim, then checked against each plan's own wording; unconfirmed matches are marked lower-confidence and cost ranking points.
- **Newest-source check** (the challenge asks for one). On 26 September 2026 the SCRTP home page linked one planned-facilities list, the 2026–2030 edition, so it is our current DESC source. DESC and Santee Cooper "are planning to join" SERTP, effective with DESC's Order 1920 compliance filing (SCRTP home page). A text search of SERTP's two June 2026 preliminary-plan documents (the 115-page report and the 174-page meeting presentation) finds no "Dominion"; the report names DESC only as a terminal of a Duke Energy Progress line ("SUMTER - DESC EASTOVER", p. 17). SERTP's September 2026 meeting still lists SCRTP as a neighboring region (p. 43). Our reading, stated as such in the app: SERTP has not taken over DESC's list yet.
- **CEII.** Only public editions are used. SERTP's regional plan is its non-CEII edition (p. 3). The Georgia Power file is the public-disclosure version from Georgia PSC Docket 56002. Its pages still carry a CEII banner, fields marked REDACTED stay redacted, and we store only short excerpts. A live check in the Method drawer counts stored excerpts that quote CEII-marked text: 0.
- The challenge packet's two plan PDFs (DESC 2024–2028 list, Georgia Power 2025 IRP Vol. 3) are byte-identical (SHA-256) to our cached copies.
- Context: FERC Order No. 1920 (Federal Register, 89 FR 49280): effective August 12, 2024 (p. 1). Each transmission provider must include in its in-kind replacement estimates the facilities it owns at or above 200 kV, or a lower proposed threshold, that it expects to replace (p. 258).

**Region A — Upper Midwest and Southern Plains** (featured *Known coordination* cases)

- Dairyland Alma–Blair 345 kV and Xcel/NSPW Western Wisconsin Transmission Connection: the Wisconsin PSC decision states Dairyland's line terminates at Tremval North, the substation approved for Xcel's project.
- Grid Forward Central Wisconsin (ATC and NSPW segments), MISO BECI, MN LRTP projects, and Potter–Beckham (Xcel/SPS Texas and Transource Oklahoma segments), plus completed projects as negative controls.

Research was agent-assisted: AI research agents located facts and exact quotes, adversarial fact-checking agents re-verified them, and **every excerpt is re-located verbatim by script** when the snapshot is built (`scripts/build-snapshot.ts`) and again by the audit (`npm run audit`). Excerpts are labeled "awaiting human check" until a person marks them in reviewer mode and the exported `review-log.json` is committed.

The snapshot holds 219 projects from 19 utilities, 103 cited public sources and 1,786 excerpts, all re-found verbatim; 0 are human-checked so far.

**Model cross-check.** OpenAI GPT-5.5 (`gpt-5.5-2026-04-23`, structured outputs, frozen prompt `gridlock-extract/1.1`) independently re-read **all 283 in-scope Region B plan pages** (145 DESC, 138 Georgia Power; `npm run extract:eval`, report in [`data/eval/extraction-eval.md`](data/eval/extraction-eval.md)). 2,578 of its 2,579 quoted fields are verbatim on the page. Where it and our deterministic parser both give a value they agree on 1,642 of 1,667 (98.5%, 95% CI 97.8–99.0). Every value that disagrees with the parser, or that the parser lacks, quotes the page verbatim, and it never returned a number for Georgia Power's redacted costs. One gap is reported, not fixed mid-run: it leaves Georgia Power's "Need Date" out of the in-service field on 88 of 138 pages. These are agreement rates with our parser, not accuracy. Model output never enters the snapshot or the engine. Separately, eight runs on the pages behind the top leads are shown in the Method drawer and re-checked by the audit (67 of 68 quoted fields verbatim; the one that was not, a cost figure, is rejected). The script also supports Gemini (`--provider gemini`); it was not run for this submission.

## Method (short)

1. **Place first.** The live engine measures the **closest points** between project work geometries. Official GIS routes are measured directly; digitized routes and straight terminal segments are labeled estimates; equipment and substation work remains at its located work sites. A source-stated shared facility is a zero-mile contact. The tiers are touching/crossing, under 1.6 km (shared land), under 8 km (site logistics), and under 40 km (crews/equipment). Location uncertainty is retained as bounds. The starter workbook's midpoint-center formula is reproduced as a legacy benchmark and shown as a secondary readout, but it does not control live flags.
2. **Then time.** Construction windows are compared for every source combination (confirmed when `max(S_latest) ≤ min(E_earliest)`). No window is invented from an in-service date alone: a start plus a "by"/need date is kept as bounds with the field work undated, and DESC's yearly budget gives a coarse window (a budget year under 5% of the total counts as preconstruction and never starts it; when DESC reports earlier spending only as a "Previous" total, the start year is shown as not published, e.g. "before 2026 → 2026") — both support at most a "possible" overlap. Published *schedules* are compared separately: Georgia Power's Start Date (the Ten-Year Plan's "schedule for implementation", p. 174) or DESC's first evidenced spending, to the current in-service date. When two schedules certainly overlap for at least 30 days, TIME is confirmed on a schedule basis ("Published schedules overlap (start → in-service) for N months; field-work dates are not published"), never called a construction overlap; a construction-window result that confirms or rules out overlap takes precedence. If a plan's in-service date has passed without a source confirming completion, TIME is at most "possible". A "no later than" deadline is kept as a claim but is never used as an in-service forecast. The gap between in-service dates in days — the sponsor's secondary signal — informs ranking; missing windows stay "unknown".
3. **Status.** Documented joint work or interface coordination → *Known coordination*. Otherwise within the radius (or sharing a facility stated in, or implied by, the sources) → *Needs review*; an uncertain place → *Possible*. "Needs review" means the reviewed sources are silent, never "uncoordinated". Completed (a source says so), cancelled and duplicate records are archived. A plan whose in-service date has passed without a source confirming completion stays in the queue, flagged "planned date passed; completion not confirmed" (48 projects; this keeps Sperry's OVL_2 pair visible).
4. **Rank.** Explainable points, not a probability: place (≤ 60, based on shared facilities or closest approach), timing (≤ 30), evidence completeness (≤ 10); minus 5 for lower-confidence geometry and 15 for a passed planned date.

The engine reproduces both tables of the sponsor's starter file exactly: the overlap table (six rows, ±0.01 mi and to the day, no extra pairs) and the project table (centers from its midpoint formula, `overlap_count`, and `overlap_1…3` in order). See `tests/engine.test.ts`, `tests/sponsor.test.ts` and the Method drawer.

**Sperry's six rows in today's plans.** The Method drawer replays the starter file's six overlap rows on current data. Starter projects are matched to plan records by title and in-service date.

| Row | Today |
| --- | --- |
| OVL_3 (Jasper–Okatie 230 kV #2 × Goshen–McIntosh rebuild) | #1 in the Savannah River queue, 4.25-mi closest approach and ≥396 days apart on current plan dates |
| OVL_2 (Jasper–Okatie #2 × McIntosh–Purrysburg reactors) | In the queue, 3.03-mi closest approach and 183 days apart; kept although Georgia Power's planned date has passed because no source confirms completion |
| OVL_1, OVL_4 | DESC 6810 A and 6809 E were last listed in the 2024–2028 list (pp. 31, 14). A text search of the 2025–2029 and 2026–2030 lists finds neither Project ID. DESC's 6809 G, listed under the same corridor name (p. 15), is still listed and pairs with Georgia Power's Evans Primary–Thurmond Dam #5 rebuild in our queue |
| OVL_5, OVL_6 | DESC 6808 S (Okatie–Bluffton) was last listed in the 2025–2029 list (p. 8) and is not in the 2026–2030 list |

A project missing from a newer list is shown as "no longer listed", never as "completed": no source we reviewed says so.

**Location workflow (the guide's three steps).** (1) Find: terminal names are matched to OpenStreetMap power features and Nominatim. (2) Confirm against the plan's wording. In the Savannah River region, the located points include 252 named facilities confirmed, 27 named facilities lower-confidence and 49 town-level. Of the starter file's blank sub-points we located Hooks (lower-confidence) and Purrysburg; Ft Johnson is not located. (3) Measure: compute the shortest point-to-point, point-to-line, or line-to-line distance, detect crossings, and compare project schedules. The starter midpoint is retained only as a legacy readout. An audit checks that each facility name resolves to one location within the engine's 0.6-mile same-site tolerance. The one exception is Goshen: the plan names two different Georgia Power substations, "Goshen (Savannah)" (p. 314) and the Goshen on the "Goshen - Vogtle corridor" (p. 382), 87 mi apart, and they are never treated as one site. The starter file itself places McIntosh at two coordinates 0.41 mi apart; our snapshot uses one point for McIntosh everywhere.

**Impact estimate (bonus).** Each flagged pair gets separate cited channels: shared new right-of-way, a shared terminal station, staging both jobs together, a shared spare transformer, outage coordination, and capital in scope. Every row shows its formula, its unit cost with a verbatim excerpt and page, its dollar year, and a label: *stated* (a source states the sharing), *conditional* (an upper bound that needs something no source shows) or *context* (scale, not a saving). Rows are never added together, because they rest on different dollar years and different conditions.

- **Top Savannah River lead:** no new corridor is needed (0 acres). Staging both jobs together is worth *up to* ≈ $100K (the smaller of MISO's 2018 mobilization costs for a new-site substation, $262,660, and a 115 kV line, $100,000; conditional, since no source shows shared crews or aligned field dates). Both lines are named for McIntosh, so if their field work overlaps their planned outages belong in one coordinated plan (NERC IRO-017-1; not priced). Capital a joint review would cover, listed and not summed: DESC's published $5.4M, and Georgia Power's redacted rebuild as a labeled mileage proxy, 6.7 mi × $1.2M–$1.7M/mi ≈ $8.1M–$11.4M.
- **Tremval North (Wisconsin):** the PSC states Dairyland's line connects to the new Tremval North station approved for Xcel's project, so one 345 kV terminal instead of two is worth ≈ $9.0M–$12.4M and 1.5–2.2 acres (stated; MISO's new 4-position ring bus minus adding 1–2 positions, MTEP24 $ with contingency and AFUDC). The separate-station alternative is our assumption, and MISO says its exploratory costs are not for planning decisions.
- **Region portfolio:** each project counted once, in its highest-ranked pair. Savannah River: 8 disjoint pairs, a staging ceiling of $857,590 (2018 $), 0 acres of new shared right-of-way. An upper-bound scenario, never a saving.

The shared-corridor calculator stays below the channels: acres one shared corridor would avoid encumbering twice (`miles × 5,280 × width ÷ 43,560`) and their value, with cited defaults (Georgia Transmission easement widths, USDA NASS 2026 land values, the MISO cost guides, and a joint proposed order in an SC PSC docket on co-building) and every input editable. The shared length defaults to the shorter published length only when both projects build new lines that do not simply meet end to end; otherwise (equipment work, or a rebuild on existing right-of-way, as in the top lead) it defaults to 0 and says so. Right-of-way width and mobilization use the pair's own voltage class where a cited table publishes it, else the nearest lower published class.

## Evaluation

`npm run eval` writes [`data/eval/eval.md`](data/eval/eval.md) and `eval.json` (about 2 s); `tests/eval.test.ts` fails if the committed report is stale. There are no human labels, so we measure what can be measured honestly and state every denominator.

| Method (7,929 candidate pairs, 25 mi) | Flagged | DESC × GPC (of 7,830) | Documented interfaces (of 13) |
| --- | --- | --- | --- |
| Same county + same in-service year | 12 | 8 | 4 |
| Centers under 25 mi only (Sperry's rule) | 111 | 111 | 0 |
| Close OR on a similar schedule | 4,631 (58.4%) | 4,571 | 13 |
| Under 25 mi AND a similar schedule | 50 | 50 | 0 |
| Same facility name in both plans | 24 | 15 | 8 |
| **GridLock engine** | **133 (1.7%)** | **123** | **10 (physical links 9/9)** |

- **Sperry's worked example** is reproduced exactly: 6/6 overlap rows (±0.01 mi, to the day) with 0 extra pairs at every radius up to 50 mi, and 10/10 project-table rows.
- **Why not a county join:** the Savannah River is the state line. Only 23 of the 111 DESC × Georgia Power pairs under 25 mi share a county; in 90 the DESC project lies entirely in South Carolina counties.
- **Nothing inside the rule is dropped:** at every radius from 5 to 100 mi, every pair whose centers are within the radius is in the queue. At 25 mi the engine adds 22 leads beyond the rule (10 shared facilities, 6 county-level, 6 where location uncertainty reaches inside the radius), each with its reason.
- **Documented interfaces, stated as partly circular:** the 13 links between two utilities' projects that the filings state or imply (none in the Savannah River region) have centers 25.8–122 mi apart, so the legacy center rule keeps 0. The closest-point engine keeps 10; removing source-stated shared-site logic still keeps 9 from geometry and other evidence (ablation A3b). This is a control-set recall check, not an independent precision estimate.
- **Negative controls:** 0 flagged pairs involve a project a source calls complete (14 such pairs); 0 of the 30 flagged past-due pairs get TIME confirmed or a BOTH badge; 0 pairs over 50 mi are flagged without a shared facility; 0 pairs across regions.
- **Robustness:** the top lead is #1 from 10 to 100 mi and #2 at 5 mi. Ablations run on snapshot copies: the schedule basis supplies all 19 BOTH badges; keeping past-due plans restores 30 pairs, including OVL_2; location uncertainty adds 17 leads.
- **Extraction:** GPT-5.5 on 283 pages, 2,578/2,579 quotes verbatim, 98.5% agreement with the parser (see *Model cross-check* above).

## Run it

```bash
npm install
cp .env.example .env.local   # add NEXT_PUBLIC_MAPBOX_TOKEN (a public pk. token)
npm run dev                  # http://localhost:3000
```

Checks:

```bash
npm run check        # type-check, lint, unit tests, data audit
npm test             # unit tests, incl. exact reproductions of the sponsor's overlap and project tables
npm run audit        # every fact has evidence; every excerpt re-found verbatim in its cached source
npm run eval         # baselines, negative controls, radius sweep, ablations → data/eval/eval.{json,md}
npm run extract:eval -- score   # re-score the 283 stored GPT-5.5 runs (no API call) → data/eval/extraction-eval.{json,md}
npm run test:ui      # Playwright smoke tests in Chrome (starts the dev server if needed)
```

What the UI tests cover: comparing plans; the featured pair agreeing across queue, map, timeline and inspector; every evidence link being a public URL; brief export, copy and print (only the brief, paginated); keyboard paths (Escape, focus trap, no shortcuts behind modals or drawers); reduced motion; the offline fallback with all Mapbox requests blocked; both sponsor-format CSV exports (only pairs under 25 mi, closest first, OVL_n in order; every overlap row referenced by both of its projects); the review-radius slider (a slow reply never overwrites a newer radius); filters and their empty states; engine errors with Retry; reviewer mode and notes; basemap, 3D and region switching; deep links; all eight guided-demo steps (narration matches the screen, controls stay clear of the inspector and the brief); and phone and laptop viewports (camera, bottom sheet, no horizontal scroll). `node scripts/visual/shoot.mjs [baseUrl] [outDir]` captures screenshots of each view for visual review (`sizes.mjs` takes the same arguments).

The app also went through several rounds of adversarial review: engine correctness, honesty of claims, UI and accessibility, the data pipeline, phone and tablet layouts, the guided-demo narrative, and the exported brief and CSV. Each finding was independently re-verified before it was fixed. About 120 verified issues were fixed, most with regression tests.

Rebuilding data (optional — the snapshot is committed):

```bash
npm run sources:fetch -- --local gpc-irp-2025-vol3="path/to/2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"
python3 scripts/ingest/parse_region_b.py
npm run snapshot:build
npm run extract -- desc-scrtp-2026-2030 --page 41    # optional model extraction (OPENAI_API_KEY in .env.local)
python3 scripts/ingest/permit_search.py              # optional: land-disturbance filings near the leads → data/permits/permit-search.json
```

API: `GET /api/snapshot`, `GET /api/matches?threshold=25&utilityA=&utilityB=&region=&year=`, `GET /api/matches/:id`.

## Demo (three minutes)

The full timed script, with a 30-second fallback, is in [`docs/pitch.md`](docs/pitch.md); likely judge questions are answered in [`docs/judge-qa.md`](docs/judge-qa.md).

1. **Two plans, one map** — Savannah River region: DESC in cyan, Georgia Power in violet.
2. **Compare public plans** — 7,830 DESC × Georgia Power pairs measured with closest-point geometry. Across all regions, 149 of 7,929 pairs are flagged (1.9%); the legacy center baseline finds 111.
3. **Top opportunity** — open #1: DESC's Jasper–Okatie 230 kV #2 and Georgia Power's Goshen–McIntosh rebuild, with a 4.25-mi closest approach in the site-logistics tier. The inspector shows the geometry basis and the legacy center readout separately.
4. **When they build** — the pair's published schedules overlap for 18 months (Jun 2025–Dec 2026), so it is BOTH, and the app says field-work dates are not published. 10 of the top 12 Savannah River leads are BOTH.
5. **Rough impact** — separate cited channels, never summed: 0 acres of new corridor; staging both jobs together up to ≈ $100K; capital in scope listed as DESC's published $5.4M and a labeled proxy of ≈ $8.1M–$11.4M for Georgia Power's redacted rebuild; none of it is a saving.
6. **Known coordination** — Upper Midwest: Dairyland × Xcel at Tremval North, filed as a known interface; one 345 kV terminal instead of two ≈ $9.0M–$12.4M (stated).
7. **Sources disagree** — Xcel's page vs the Wisconsin PSC and NSPW's own Q2 2026 filing on completion; both kept side by side.
8. **Cited brief** — export a planner-ready question with numbered sources.
9. **Sperry's own example** — Method drawer: both starter tables reproduced exactly as a legacy check, then the six starter rows in today's plans (OVL_3 is #1 in our queue). Download the overlap and project tables from the queue footer.

Or press **Guided demo** in the top bar.

## Limitations

- No planner labels: no precision or effectiveness is claimed. The 13 documented interfaces used in the evaluation are few, all outside the Savannah River region, and read from the same filings as our shared-facility rule.
- Public plans are incomplete and change; costs are redacted in the Georgia Power public disclosure, so any Georgia Power cost shown is a labeled mileage proxy.
- No top Savannah River pair has published field-work dates. A confirmed TIME there is a *published-schedule* overlap (start → in-service), labeled as such; DESC's budget-year window is coarse by design. State permit filings did not fill the gap. On 26 September 2026, Georgia EPD had no land-disturbance filing for Georgia Power's side of any top-12 lead, and SC DES's only matching filings were the Okatie 230 kV substation boundaries of 2022–2023 ([`data/permits/`](data/permits/README.md)).
- Five SERTP 2026 projects are filed under "SOCO" with no named owner; Georgia Power is a labeled inference.
- Most substations are geocoded from OpenStreetMap by name and checked against plan text; some are approximate or lower-confidence and are labeled so.
- Coordination that is not published cannot be seen. "Needs review" means the reviewed sources are silent.
- A project missing from a newer DESC list is "no longer listed"; that is not evidence that it was completed. A plan past its in-service date is "completion not confirmed", never "completed".
- Cost guides used by the impact estimate come partly from another region (MISO) and other dollar years, and are indicative only.
- Two utilities in the sponsor's region. Duke, Santee Cooper, GTC and MEAG plans are not ingested, and the snapshot is frozen on 26 September 2026.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Mapbox GL JS 3 · Turf · Zustand · Motion · Vitest · Playwright · Python (source fetch, PDF parsing with poppler's `pdftotext`, geocoding helpers) · OpenAI GPT-5.5 (extraction cross-check only).

Write-ups: [`docs/paper.md`](docs/paper.md) (system and evaluation paper), [`docs/devpost.md`](docs/devpost.md) (submission text), [`docs/pitch.md`](docs/pitch.md) (timed demo script), [`docs/judge-qa.md`](docs/judge-qa.md) (likely questions).

Map data © Mapbox © OpenStreetMap contributors. County and state boundaries: US Census Bureau cartographic boundary files.
