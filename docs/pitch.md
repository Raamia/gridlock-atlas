# GridLock Atlas: three-minute pitch

A timed script for the live demo. It follows the app's **Guided demo** (the button at the top right; eight steps; `→` or **Next** advances, `←` goes back) and ends in **Method & audit** on *Proof at a glance*. About 465 spoken words: at about 155 words a minute that fills the whole 3:00 with no pauses, and the times in the table are those word counts at that pace. Plan on the cuts below (they bring it to about 2:50) unless you are ahead of the table. Every number below comes from snapshot `snap-2026-09-26-339ecf7b`, engine 1.2.0 and `data/eval/*.json`.

## Before you start

- Set the laptop to the projector's resolution first, then load the page. The layout is tuned for a 1280×720 projector as well as 1440×900 and 1920×1080 screens.
- `npm run dev` is running and the page shows the **SC–GA** (Savannah River) region with no pair open. The guided demo clears any earlier comparison, filter or radius itself and always runs at Sperry's 25 mi.
- Warm the Upper Midwest map tiles once: click **Midwest** in the region switcher, wait for the map to draw, then click **SC–GA** again. Step 6 flies there.
- Open a 3D close-up once: click **Compare public plans**, open row **#01**, press **3D close-up** on the map (or **3D** in the pair card's footer), then `Esc`, so its code and 3D models are loaded before you are on stage.
- Run steps 1–8 once end to end, then press **Finish**. Starting the demo again resets the run.
- After rehearsing, load the app's plain address again (no `?pair=` in the URL; a plain reload reopens the last pair). The page must open on *Two utilities. Two separate plans.* with no comparison run, as the first line of the script expects.
- No Mapbox token or no network? The map falls back to bundled Census boundaries automatically ("Basemap unavailable — showing bundled Census boundaries. All plan data is local."); the numbers do not change.
- Close Sources and Method & audit. Keep `docs/screenshots/` open in a second tab in case you need the fallback.

## The script

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:17 | The map and the Opportunities panel (*Two utilities. Two separate plans.*), before pressing **Guided demo** | "Neighboring utilities publish their transmission plans in separate documents: Dominion Energy South Carolina through SCRTP, Georgia Power inside its IRP. Nobody puts them on one map. GridLock Atlas does, and every fact on screen carries a verbatim quote and page from a public document." |
| 0:17–0:25 | Step 1 · *Two utilities, two separate plans* (card: "199 plans · DESC 54 · Georgia Power 145") | "This is Sperry's example, the Savannah River: DESC in cyan, Georgia Power in violet, 199 projects from their current plans." |
| 0:25–0:49 | Step 2 · *Compare public plans*: amber links draw in on the map, and the Opportunities panel headline reads **111 within Sperry's 25 miles**, "of 7,830 pairs checked · 123 pairs flagged · 12 more on uncertain locations" | "We apply your rule literally: project centers under 25 miles. Of 7,830 DESC–Georgia Power pairs, 111 qualify, and they are exactly the rows of your overlap table, closest first. We add 12 leads on uncertain locations, each with its reason. Across all regions we flag 133 of 7,929 pairs, 1.7 percent. A naive 'close *or* same time' rule would flag 58 percent." |
| 0:49–1:04 | Step 3 · *The top coordination opportunity*: row **#01** opens in the pair card: "Needs review · #01 of 95", tiles *Distance ≈6.7 mi* · *Timing 2028* · *Coordination Not found*, then *Question for the planners* | "Number one: DESC's Okatie–McIntosh tie reactor and Georgia Power's Goshen–McIntosh rebuild. Centers 6.7 miles apart, both due in service in 2028. No coordination is on record: the sources are silent, which never means 'uncoordinated'. Then the one question to ask." |
| 1:04–1:33 | Step 4 · *When they build*: the pair card jumps to *When they build*, the timeline dock shows the construction windows ("Possible overlap 2028 · year precision"), and row **#02** in the list is ringed (card: "Row #02 is Sperry's OVL_3 · schedules overlap 18 mo") | "Timing is the secondary signal, and we never invent construction dates. Georgia Power defines its Start Date as the 'schedule for implementation'; DESC publishes spending by year. When two published schedules certainly overlap for at least 30 days, we confirm time and say field-work dates are not published. This pair overlaps by one day, so it stays 'possible'. Row two is your own OVL_3: 18 months. Nine of our top twelve meet both signals." |
| 1:33–1:53 | Step 5 · *A rough, sourced impact estimate*: the pair card at *Rough impact estimate* ("illustrative · never summed"), with *Stage both jobs together* highlighted | "The bonus estimate is split into cited channels that are never added up. No new corridor here: zero acres. Staging both jobs together: up to about 100 thousand dollars, conditional. Capital in scope: DESC's published 5.4 million, and a labeled proxy for Georgia Power's redacted cost. None of it is called a saving." |
| 1:53–2:19 | Step 6 · *Known coordination is kept separate*: the map flies to the Upper Midwest; the pair card reads "Known coordination · #02 of 7" at *Coordination on record*; the map callout reads "Shared site stated in source · Tremval North 345 kV Substation"; the map's **3D close-up** button flashes a white ring | "In Wisconsin, the PSC says Dairyland's line ends at Xcel's new Tremval North station. The centers are 37 miles apart, so the 25-mile rule alone misses it; it misses all 13 documented links between two utilities' projects. We keep 10 by reading the filings' own shared-facility statements; this one is filed as known coordination. One terminal instead of two: about 9 to 12 million dollars." |
| 2:19–2:25 | Step 7 · *Sources disagree — both are kept*: the pair card at *Sources disagree*, "Q3 2029" and "2027–2028" side by side | "When sources disagree, like Xcel's page and the PSC on completion, we keep both, side by side." |
| 2:25–2:31 | Step 8 · *Export a cited review brief*: the brief opens (Copy Markdown · Download .md · Print / PDF) and the step card moves to the bottom left | "For any pair, one question a planner can act on, every fact numbered to its source." |
| 2:31–3:00 | On the step card, click **Sperry's worked example ✓ 6/6**: the demo ends and **Method & audit** opens on *Proof at a glance*. Then click *Sperry's six rows today* in its contents | "Method and audit re-runs your worked example: 6 of 6 overlap rows and 10 of 10 project rows, exact, no extra pairs. GPT-5.5 re-read all 283 plan pages as a cross-check: 2,578 of 2,579 of its quotes are verbatim. Your six rows on today's plans: OVL_3 is our number two, and four involve DESC projects that are no longer listed, which we never call completed. GridLock Atlas: public plans, one map, every claim cited." |

The step-card lines quoted above ("card: …") are the 1440×900 wording. On a 1280×720 projector the card shortens its key line: step 1 reads "DESC 54 · Georgia Power 145" and step 4 "#02 = OVL_3 · schedules overlap 18 mo".

Cuts (about 11 s): step 7's line and the last sentence of step 6. Only if you are ahead, add one or both after step 3:

- **3D close-up (+10 s).** Click **3D close-up** on the step card, drag the plinth once, press `Esc` (the demo stays on step 3). Say: "The same pair up close: centers and terminals placed to scale from the snapshot; the structures are symbolic, not survey geometry."
- **Georgia Pacific.** "The plan page says the rebuild covers the section to Georgia Pacific, about 1.7 miles short of McIntosh."

## If the demo breaks

- **Map blank or slow:** keep talking; the list, pair card and brief work without the map. If the basemap fails, the app switches to bundled Census boundaries by itself; you can also pick **Offline** (the crossed-out cloud) in the basemap buttons at the bottom right of the map; on a 1280×720 screen they are folded into the **Basemap options** button there.
- **3D stutters on the projector:** press **Flat map** (bottom right of the map). Every number and link stays the same; 3D is presentation only.
- **Engine error:** press **Retry** in the Opportunities panel (or **Retry** on the step card); the demo picks up the narration again.
- **Guided demo stuck, or something covers the pair:** press `Esc`; each press closes the top layer: the brief, Method & audit or Sources, the 3D close-up, the pair card, then the demo. Then open the first pair by hand: row **#01** under *Needs review*, and use the pair card's section buttons (*Where · When · Coordination · Impact · Disagree · Sources*). For steps 6–7, click **Midwest**, then the **Known** tab, and open #02 (*Alma-Blair 345 kV* × *Western Wisconsin (WWTC)*).
- **Nothing works:** switch to `docs/screenshots/` and give the 30-second version.

## 30-second fallback

> "GridLock Atlas compares Dominion's and Georgia Power's public plans with your rule: of 7,830 project pairs, 111 have centers under 25 miles. Our top lead is 6.7 miles apart, both due in 2028. Your OVL_3 pair is number two, with published schedules overlapping for 18 months. We reproduce your worked example exactly. All 1,786 facts are quoted verbatim with their page, and GPT-5.5 cross-checked 283 plan pages. It runs offline from a frozen snapshot."

## Numbers to have ready (and where they come from)

| Claim | Value | Source |
| --- | --- | --- |
| DESC × Georgia Power pairs / under 25 mi | 7,830 / 111 (95 confirmed, 16 possible) | Opportunities panel headline; Method & audit, *Matching rules* |
| All regions: flagged / candidates | 133 / 7,929 (1.7%) | `data/eval/eval.json` `queue`; Method & audit, *Evaluation* |
| "Close OR same time" baseline | 4,622 (58.3%) | `eval.json` baseline B3; Method & audit, *Evaluation* |
| Top lead | desc-6888 × gpc-20065, P92, 6.71 mi, both 2028, TIME possible (1-day schedule overlap) | pair card (priority under *Why #01?*); `eval.json` `needsReviewTop10` |
| Sperry's OVL_3 today | #2, P89, 8.13 mi, BOTH, schedules overlap 18 months (Jun 2025–Dec 2026) | row #02 (*Sperry OVL_3* chip), timeline dock, Method & audit, *Sperry's six rows today* |
| BOTH in the top 12 | 9 | *Needs review* rows #01–#12 with an amber pin and an amber calendar |
| Impact, top lead | 0 acres; staging up to ≈ $100K (2018 $); DESC $5.4M; Georgia Power proxy ≈ $8.1M–$11.4M | pair card, *Rough impact estimate* |
| Impact, Tremval North | one 345 kV terminal ≈ $9.0M–$12.4M, 1.5–2.2 acres (stated) | pair card, *Rough impact estimate* |
| Documented interfaces | center rule 0/13, engine 10/13 (circular: same filings) | `eval.json` `interfaces`; Method & audit, *Evaluation* |
| Worked example | 6/6 overlap rows, 10/10 project rows, 0 extra pairs up to 50 mi | Method & audit, *Proof at a glance* (the "up to 50 mi" sweep is in *Evaluation*) |
| Excerpts | 1,786 from 103 sources, all re-found verbatim; 0 human-checked | `npm run audit`; Source registry |
| GPT-5.5 cross-check | 283 pages; 2,578/2,579 quotes verbatim; 98.5% agreement where both give a value | `data/eval/extraction-eval.json`; Method & audit, *Proof at a glance* and *Evaluation* |
