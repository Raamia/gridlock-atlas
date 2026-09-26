# GridLock Atlas: three-minute pitch

A timed script for the live demo. It follows the app's **Guided demo** (top bar, eight steps; `→` or **Next** advances) and ends in the **Method & audit** drawer. About 460 spoken words: speak at about 155 words a minute, and use the cuts below if you fall behind. Every number below comes from snapshot `snap-2026-09-26-339ecf7b`, engine 1.2.0 and `data/eval/*.json`.

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
| 0:25–0:50 | Step 2 · *Compare public plans* | "We apply your rule literally: project centers under 25 miles. Of 7,830 DESC–Georgia Power pairs, 111 qualify, and they are exactly the rows of your overlap table, closest first. We add 12 leads outside the rule, each with its reason. Across all regions we flag 133 of 7,929 pairs, 1.7 percent. A naive 'close *or* same time' rule would flag 58 percent." |
| 0:50–1:10 | Step 3 · *The top coordination opportunity* | "Number one: DESC's Okatie–McIntosh tie reactor and Georgia Power's Goshen–McIntosh rebuild. Centers 6.7 miles apart, both due in service in 2028. Each terminal shows where its coordinates came from and how confident we are." |
| 1:10–1:35 | Step 4 · *When they build* | "Timing is the secondary signal, and we never invent construction dates. Georgia Power defines its Start Date as the 'schedule for implementation'; DESC publishes spending by year. When two published schedules certainly overlap for at least 30 days, we confirm time and say field-work dates are not published. This pair overlaps by one day, so it stays 'possible'. Pair two is your own OVL_3: 18 months. Nine of our top twelve meet both signals." |
| 1:35–1:55 | Step 5 · *A rough, sourced impact estimate* | "The bonus estimate is split into cited channels that are never added up. No new corridor here: zero acres. Staging both jobs together: up to about 100 thousand dollars, conditional. Capital in scope: DESC's published 5.4 million, and a labeled proxy for Georgia Power's redacted cost. None of it is called a saving." |
| 1:55–2:15 | Step 6 · *Known coordination is kept separate* | "In Wisconsin, the PSC says Dairyland's line ends at Xcel's new Tremval North station. The centers are 37 miles apart, so the 25-mile rule alone misses it; it misses all 13 documented links between two utilities' projects. We keep 10 by reading the filings' own shared-facility statements, and file them as known coordination. One terminal instead of two: about 9 to 12 million dollars." |
| 2:15–2:25 | Step 7 · *Sources disagree — both are kept* | "When sources disagree, like Xcel's page and the PSC on completion, we keep both, side by side." |
| 2:25–2:35 | Step 8 · *Export a cited review brief* | "For any pair, one question a planner can act on, every fact numbered to its source." |
| 2:35–3:00 | Close the demo, open **Method & audit**, scroll to *Sponsor worked example* and *Evaluation* | "The Method drawer re-runs your worked example: 6 of 6 overlap rows and 10 of 10 project rows, exact, no extra pairs. It replays your six rows on today's plans: OVL_3 is our number two, and four rows involve DESC projects that are no longer listed, which we never call completed. GPT-5.5 re-read all 283 plan pages as a cross-check: 2,578 of 2,579 of its quotes are verbatim. GridLock Atlas: public plans, one map, every claim cited." |

If you are running long, cut step 7 and the last sentence of step 6. If you have time left, add after step 3: "The plan page says the rebuild covers the section to Georgia Pacific, about 1.7 miles short of McIntosh."

## If the demo breaks

- **Map blank or slow:** keep talking; the offline fallback draws Census boundaries and the queue still works.
- **Engine error:** press **Retry** in the queue.
- **Guided demo stuck:** press `Esc`, open the first pair in *Needs review* by hand, then scroll the inspector's sections (*Where they meet*, *When they build*, *Rough impact estimate*).
- **Nothing works:** switch to `docs/screenshots/` and give the 30-second version.

## 30-second fallback

> "GridLock Atlas compares Dominion's and Georgia Power's public plans with your rule: of 7,830 project pairs, 111 have centers under 25 miles. Our top lead is 6.7 miles apart, both due in 2028. Your OVL_3 pair is number two, with published schedules overlapping for 18 months. We reproduce your worked example exactly. All 1,786 facts are quoted verbatim with their page, and GPT-5.5 cross-checked 283 plan pages. It runs offline from a frozen snapshot."

## Numbers to have ready (and where they come from)

| Claim | Value | Source |
| --- | --- | --- |
| DESC × Georgia Power pairs / under 25 mi | 7,830 / 111 (95 confirmed, 16 possible) | queue, Method drawer "Place first" |
| All regions: flagged / candidates | 133 / 7,929 (1.7%) | `data/eval/eval.json` `queue` |
| "Close OR same time" baseline | 4,622 (58.3%) | `eval.json` baseline B3 |
| Top lead | desc-6888 × gpc-20065, P92, 6.71 mi, both 2028, TIME possible (1-day schedule overlap) | inspector; `eval.json` `needsReviewTop10` |
| Sperry's OVL_3 today | #2, P89, 8.13 mi, BOTH, schedules overlap 18 months (Jun 2025–Dec 2026) | inspector, Method drawer replay |
| BOTH in the top 12 | 9 | Savannah River *Needs review* tab |
| Impact, top lead | 0 acres; staging up to ≈ $100K (2018 $); DESC $5.4M; Georgia Power proxy ≈ $8.1M–$11.4M | inspector, impact tab |
| Impact, Tremval North | one 345 kV terminal ≈ $9.0M–$12.4M, 1.5–2.2 acres (stated) | inspector, impact tab |
| Documented interfaces | center rule 0/13, engine 10/13 (circular: same filings) | `eval.json` `interfaces` |
| Worked example | 6/6 overlap rows, 10/10 project rows, 0 extra pairs up to 50 mi | Method drawer |
| Excerpts | 1,786 from 103 sources, all re-found verbatim; 0 human-checked | `npm run audit` |
| GPT-5.5 cross-check | 283 pages; 2,578/2,579 quotes verbatim; 98.5% agreement where both give a value | `data/eval/extraction-eval.json` |
