# Atlas

**Compare public utility construction plans. Flag where they meet in place or time. Show the evidence.**

*Sperry Tech GridLock Challenge · ShellHacks 2026*

## Inspiration

Utilities plan new lines and substations years ahead, but each publishes its plan in its own document. Dominion Energy South Carolina files an SCRTP project list. Georgia Power files a ten-year plan inside its IRP. Nobody puts the two on one map. Along the Savannah River, where the two meet, that means two rebuilds a few miles apart can be planned for the same years without anyone flagging it.

FERC Order No. 1920 (effective August 12, 2024) pushes utilities toward coordinated long-term regional planning. Among the benefits planning must measure, it lists "(1) avoided or deferred reliability transmission facilities and aging infrastructure replacement" and "(5) reduced congestion due to transmission outages" (89 FR 49280, p. 117). Sperry's challenge is a hackathon-sized version of that problem. We wanted a tool a transmission planner could trust, so we set one rule: every fact on screen must come from a public document, with a verbatim quote and a page number.

## What it does

Atlas puts two utilities' public plans on one interactive map. It measures the closest points between every cross-utility pair of project geometries, flags those **under 25 miles**, weighs their published timing, and ranks the results as review leads.

- **Compare.** Across all regions the engine measures 7,929 pairs and flags 149 (1.9%). The legacy starter-workbook center baseline finds 111 pairs; the live queue instead follows the challenge's closest-point rule. A naive “close *or* same time” rule would flag 4,631 pairs.
- **Rank.** The queue has four tabs: *Needs review*, *Known coordination*, *Source conflicts* and *Possible*. The ordering is explainable: closest approach first, then time, then evidence completeness. The top needs-review lead is the Jasper–Okatie #2 line and Georgia Power's Goshen–McIntosh rebuild, with a 4.25-mile closest approach.
- **Time, stated honestly.** Georgia Power defines its Start Date as the "schedule for implementation". When two published schedules certainly overlap for at least 30 days, time is confirmed *on a schedule basis*, and the app always adds that field-work dates are not published. 10 of the top 12 Savannah River leads meet both signals. Sperry's own OVL_3 pair overlaps for 18 months and is #1 in our queue.
- **Inspect.** For each pair the app shows its closest distance, coordination tier, geometry basis and uncertainty, plus a secondary legacy center readout, timing, documented coordination, and source disagreements.
- **Estimate impact (bonus).** Each pair gets separate cited channels, each labeled *stated*, *conditional* or *context* and never added together: shared new right-of-way, a shared terminal station, staging both jobs together, a shared spare transformer, outage coordination, and capital in scope.
  - Top lead: staging both jobs together is worth up to ≈ $100K; 0 acres of new corridor are needed.
  - Tremval North, Wisconsin, where the PSC states that Dairyland's line ends at Xcel's new station: one 345 kV terminal instead of two ≈ $9.0M–$12.4M.
- **Export.** Download Sperry's two tables as CSV: the overlap table and the project table, with centers, `overlap_count` and `overlap_1…n`. A third file lists every flagged pair with the reason it is inside or outside the rule. The app also builds a one-question review brief with numbered citations.
- **Audit.** The Method drawer re-runs Sperry's worked example live and replays Sperry's six example rows on today's plans. It also shows the newest-source check and our evaluation numbers.

## How we built it

- **Sources.** We use 103 public documents: DESC's SCRTP lists (2026–2030 current, two older editions as history), Georgia Power's 2025 IRP Ten-Year Plan (public disclosure), SERTP's 2025 plan and June 2026 preliminary plan, an SC PSC siting docket, a Georgia EPD stormwater permit notice, Wisconsin PSC decisions, MISO cost guides, FERC Order 1920 and NERC IRO-017-1. Each document is fetched, SHA-256-hashed and cached. The app reads only a frozen snapshot, so the demo works offline.
- **Parsing.** Python with poppler's `pdftotext` parses DESC's list (one project per page) and Georgia Power's plan (summary table plus project pages) deterministically. Terminals are geocoded against OpenStreetMap power features (Overpass) and Nominatim, then checked against each plan's wording. Unconfirmed matches are labeled lower-confidence.
- **Provenance.** 1,786 excerpts are each re-found verbatim in their cached source when the snapshot is built and again by `npm run audit`.
- **Engine.** Deterministic TypeScript. It computes point-to-point, point-to-line, and line-to-line closest approaches, detects crossings, retains uncertainty bounds, uses source-stated shared facilities, and compares construction schedules. Official routes, digitized routes, terminal estimates, and work-site points remain distinguishable. No model output enters matching.
- **App.** Next.js 16, React 19, Tailwind CSS 4, Mapbox GL JS 3 with 3D terrain and an offline Census-boundary fallback, Turf, Zustand and Motion.
- **AI.** OpenAI **GPT-5.5** (structured outputs) independently re-read all 283 in-scope Region B plan pages as a cross-check. Its answers are scored against our parser and never become facts. AI research agents (Claude) located facts and exact quotes, and adversarial agents re-verified them. Every quote still has to pass the verbatim check.
- **Tests.** Vitest unit tests, including exact reproductions of both of Sperry's tables and invariants on the evaluation. Playwright UI tests cover phone and laptop layouts, keyboard paths, the offline map and all eight guided-demo steps. `npm run eval` computes baselines, negative controls, radius sweeps and ablations.

## Challenges we ran into

- **Plans move.** DESC's Jasper–Okatie #2 in-service date moved from 12/31/25 to 5/31/2026 to 12/01/2026 across three list editions. Four of Sperry's six starter rows involve a DESC project that no longer appears in the current list. We show these as "no longer listed", with the page where each was last listed, never as "completed".
- **Dates that are not construction dates.** DESC publishes yearly spending. Georgia Power publishes a Start Date and a Need Date. No top Savannah pair has published field-work dates, so we added a separate, clearly labeled *schedule* basis instead of inventing construction windows.
- **The river is the state line.** A county join finds almost nothing: only 23 of the 111 DESC × Georgia Power pairs under 25 miles share a county.
- **Long lines meet end to end.** Documented interfaces, such as Tremval North in Wisconsin, have centers 25.8–122 miles apart. The center rule alone keeps 0 of 13, so we keep them only when the filings state or imply the shared facility, and we rank them after every pair inside the rule.
- **Redactions and CEII.** Georgia Power's public costs read "REDACTED". We use only public editions, store only short excerpts, and label any mileage-based cost proxy as a proxy.
- **Near-identical names.** McIntosh and West McIntosh are two substations 0.46 miles apart, and two different Georgia Power substations are both called Goshen. We never merge differently named facilities, and an audit checks that each name resolves to one location.

## Accomplishments that we're proud of

- **Sperry's worked example, reproduced exactly.** All 6 of 6 overlap rows match (±0.01 mi, to the day) with 0 extra pairs at any radius up to 50 miles, and 10 of 10 project rows match.
- **Selective, with the numbers to show it.** We flag 149 of 7,929 pairs. A literal "close *or* same time" rule would flag 4,631 (58.4%).
- **Every one of 1,786 excerpts is re-found verbatim.** The audit finds 0 quotes of CEII-marked text.
- **GPT-5.5 cross-check.** 2,578 of 2,579 of its quoted fields are verbatim on the page. Where it and our parser both give a value, they agree 98.5% of the time (95% CI 97.8–99.0). We also report where it falls short: it leaves Georgia Power's "Need Date" out on 88 of 138 pages.
- **Negative controls hold.** No flagged pair involves a completed project. No past-due plan gets a confirmed time overlap. Nothing over 50 miles is flagged without a shared facility that the sources state or imply.
- **One planner-ready question per pair,** with every fact numbered to its source.

## What we learned

- Honesty is a design problem. "Needs review" has to mean "the reviewed sources are silent", never "uncoordinated". A flag is a review lead, not proof that crews or equipment can be shared.
- Evaluation without labels still says a lot when every denominator is stated. It also means naming the circularity: our shared-facility rule reads the same filings that define the documented interfaces.
- Newest-source checks matter. SERTP's June 2026 plan changed Georgia Power in-service years and added five projects at McIntosh and Meldrim. It contains no DESC project, so our reading, labeled as such in the app, is that DESC's current list is still SCRTP's.

## What's next for Atlas

- Planner labels in the existing reviewer mode, which would turn our protocol into a real precision estimate.
- More utilities in the same region: Duke Energy's Carolinas plan (already cached; it lists DESC's Bush River tie), Santee Cooper, GTC and MEAG.
- Georgia EPD permit notices as a live source of Georgia Power field-work dates.
- Order 1920 compliance data, such as in-kind replacement estimates for facilities at or above 200 kV, as it is published.

## Built with

Next.js · React · TypeScript · Tailwind CSS · Mapbox GL JS · Turf · Zustand · Motion · Vitest · Playwright · Python · poppler (pdftotext) · OpenStreetMap (Overpass, Nominatim) · US Census cartographic boundaries · OpenAI GPT-5.5 API · Claude (research and review agents)

*Map data © Mapbox © OpenStreetMap contributors. All sources are public; no CEII is used.*
