# GridLock Atlas: three-minute pitch

A timed script for the live demo. It follows the app's **Guided demo** and ends in the **Method & audit** drawer. Every number below comes from snapshot `snap-2026-09-26-339ecf7b`, engine 1.3.0 and `data/eval/*.json`.

## Before you start

- `npm run dev` is running, the page is loaded on the **Savannah River** region, and no pair is open.
- The review radius is at its default, **25 mi**. The guided demo resets the run itself.
- No Mapbox token or no network? The map falls back to bundled Census boundaries automatically; the numbers do not change.
- Close other drawers. Keep `docs/screenshots/` open in a second tab in case you need the fallback.

## The script

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Map, before pressing **Guided demo** | "Neighboring utilities publish their transmission plans in separate documents: Dominion Energy South Carolina through SCRTP, Georgia Power inside its IRP. Nobody puts them on one map. GridLock Atlas does, and every fact on screen carries a verbatim quote and page from a public document." |
| 0:15–0:25 | Step 1 · *Two utilities, two separate plans* | "This is Sperry's example, the Savannah River: DESC in cyan, Georgia Power in violet, 199 projects from their current plans." |
| 0:25–0:50 | Step 2 · *Compare public plans* | "We measure the closest points between project routes and work sites, exactly as the challenge specifies. Official routes, terminal estimates, and site points stay labeled. Across all regions we flag 149 of 7,929 pairs, 1.9 percent; a naive 'close or same time' rule would flag 4,631." |
| 0:50–1:10 | Step 3 · *The top coordination opportunity* | "Number one: DESC's Jasper–Okatie #2 line and Georgia Power's Goshen–McIntosh rebuild. Their closest mapped points are 4.25 miles apart, in the site-logistics tier. The inspector shows exactly which geometry produced that number." |
| 1:10–1:35 | Step 4 · *When they build* | "Timing is secondary, and we never invent construction dates. Georgia Power defines its Start Date as the schedule for implementation; DESC publishes spending by year. This pair is your OVL_3 on today's plans, and its published schedules overlap for 18 months. Ten of our top twelve meet both signals, while every result still says field-work dates are not published." |
| 1:35–1:55 | Step 5 · *A rough, sourced impact estimate* | "The bonus estimate is split into cited channels that are never added up. No new corridor here: zero acres. Staging both jobs together: up to about 100 thousand dollars, conditional. Capital in scope: DESC's published 5.4 million, and a labeled proxy for Georgia Power's redacted cost. None of it is called a saving." |
| 1:55–2:15 | Step 6 · *Known coordination is kept separate* | "In Wisconsin, the PSC says Dairyland's line ends at Xcel's new Tremval North station. The centers are 37 miles apart, so the 25-mile rule alone misses it; it misses all 13 documented links between two utilities' projects. We keep 10 by reading the filings' own shared-facility statements, and file them as known coordination. One terminal instead of two: about 9 to 12 million dollars." |
| 2:15–2:25 | Step 7 · *Sources disagree — both are kept* | "When sources disagree, like Xcel's page and the PSC on completion, we keep both, side by side." |
| 2:25–2:35 | Step 8 · *Export a cited review brief* | "For any pair, one question a planner can act on, every fact numbered to its source." |
| 2:35–3:00 | Close the demo, open **Method & audit**, scroll to *Sponsor worked example* and *Evaluation* | "The Method drawer reproduces the starter workbook exactly as a legacy check, then applies closest-point geometry to today's plans. OVL_3 is now our number one. GPT-5.5 re-read all 283 plan pages as a cross-check: 2,578 of 2,579 quotes are verbatim. GridLock Atlas: public plans, one map, every claim cited." |

If you are running long, cut step 7 and the last sentence of step 6. If you have time left, add after step 3: "The plan page says the rebuild covers the section to Georgia Pacific, about 1.7 miles short of McIntosh."

## If the demo breaks

- **Map blank or slow:** keep talking; the offline fallback draws Census boundaries and the queue still works.
- **Engine error:** press **Retry** in the queue.
- **Guided demo stuck:** press `Esc`, open the first pair in *Needs review* by hand, then scroll the inspector's sections (*Where they meet*, *When they build*, *Rough impact estimate*).
- **Nothing works:** switch to `docs/screenshots/` and give the 30-second version.

## 30-second fallback

> "GridLock Atlas compares Dominion's and Georgia Power's public plans by closest approach. Across 7,929 candidate pairs it flags 149; a naive OR rule flags 4,631. The live result shows the coordination tier and whether the distance came from an official route, a terminal estimate, or work-site points. We still reproduce the starter workbook's legacy center table exactly. All 1,786 facts are quoted verbatim, and GPT-5.5 cross-checked 283 plan pages."

## Numbers to have ready (and where they come from)

| Claim | Value | Source |
| --- | --- | --- |
| DESC × Georgia Power pairs / under 25 mi | 7,830 / 111 (95 confirmed, 16 possible) | queue, Method drawer "Place first" |
| All regions: flagged / candidates | 149 / 7,929 (1.9%) | `data/eval/eval.json` `queue` |
| "Close OR same time" baseline | 4,631 (58.4%) | `eval.json` baseline B3 |
| Top lead / Sperry OVL_3 today | desc-06367-d-g × gpc-20065, #1, P94, 4.25-mi closest approach, BOTH, schedules overlap 18 months | inspector; `eval.json` `needsReviewTop10` |
| BOTH in the top 12 | 10 | Savannah River *Needs review* tab |
| Impact, top lead | 0 acres; staging up to ≈ $100K (2018 $); DESC $5.4M; Georgia Power proxy ≈ $8.1M–$11.4M | inspector, impact tab |
| Impact, Tremval North | one 345 kV terminal ≈ $9.0M–$12.4M, 1.5–2.2 acres (stated) | inspector, impact tab |
| Documented interfaces | center rule 0/13, engine 10/13 (circular: same filings) | `eval.json` `interfaces` |
| Worked example | 6/6 overlap rows, 10/10 project rows, 0 extra pairs up to 50 mi | Method drawer |
| Excerpts | 1,786 from 103 sources, all re-found verbatim; 0 human-checked | `npm run audit` |
| GPT-5.5 cross-check | 283 pages; 2,578/2,579 quotes verbatim; 98.5% agreement where both give a value | `data/eval/extraction-eval.json` |
