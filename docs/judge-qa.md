# GridLock Atlas: likely judge questions

Short, honest answers for Sperry's utility engineers. Numbers are from snapshot `snap-2026-09-26-339ecf7b` (26 September 2026), engine 1.3.0, and `data/eval/*.json`. Page numbers refer to the cited source.

## Matching

**1. What does "confirmed" timing mean for the #1 lead?**
It means the two published planning schedules certainly overlap for at least 30 days, not that public sources disclose overlapping field-work dates. DESC's Jasper–Okatie #2 line has a current in-service date of December 1, 2026, while Georgia Power's Goshen–McIntosh rebuild schedule begins in June 2025; the evidenced schedules overlap for about 18 months. The app labels this a schedule basis and keeps the field-work caveat visible. We also searched state permit filings (`data/permits/`): no top lead has two public permit windows that can establish concurrent construction.

For comparison, the distinct DESC Okatie–McIntosh reactor project that previously ranked first lists in-service as "12/31/2028" (2026–2030 list, p. 41). Its timing remains only possible against Georgia Power's year-level 2028 date; it is no longer the top lead under closest-point ranking.

**2. Then what does a BOTH badge mean without field-work dates?**
A confirmed place, plus two *published schedules* that certainly overlap for at least 30 days. Georgia Power's plan defines its Start Date as the "schedule for implementation (start date)" (Ten-Year Plan, p. 174); for DESC we use the first year with evidenced spending. Each runs to the current in-service date. The app labels this a schedule basis and always says field-work dates are not published; it never calls it a construction overlap. All 19 BOTH badges at 25 mi rest on this basis. Without it (ablation A5) there are none. State permit filings are the closest public source of field-work dates, and we searched them for the projects behind the top 12 leads: Georgia Power has no filing since 2024, and DESC's only matches are the Okatie 230 kV substation boundaries of 2022 and 2023, which carry one date and no end. So no top lead has two permit windows to compare (`data/permits/README.md`).

**3. How do you measure distance for a line rather than a point?**
We compute the shortest point-to-point, point-to-line, or line-to-line distance and detect crossings. Official GIS routes are measured directly. Digitized routes and straight segments between named terminals are labeled estimates; equipment and substation work remains at its actual work sites. A source-stated shared facility is a zero-mile touching contact. The midpoint-center distance is shown only as a legacy benchmark.

**4. How is priority computed? Is 92 a probability?**
No, it is an explainable ordering. Place is worth up to 60 (a stated shared facility 60, otherwise 30 plus up to 30 for closeness), time up to 30, evidence completeness up to 10. A lower-confidence location loses 5 and a passed planned date loses 15. The #1 lead earns about 55 points for a 4.25-mi closest approach, about 29 for overlapping published schedules, and 10 because every cited excerpt is verified: 94.

**5. Why does Sperry's OVL_3 show a 4.25-mi closest approach and at least 396 days, not the starter file's 7.55 mi and 517 days?**
The distance definition and the sources both changed. The starter workbook measures project centers; the live app follows the challenge specification and measures the closest points on the available project geometries. Its legacy secondary readout is 8.13 mi center-to-center, while the closest named terminal pair is 4.25 mi apart. The dates moved too: DESC's in-service date went from "12/31/25" (2024–2028 list, p. 23) to "12/01/2026" (2026–2030 list, p. 12), and SERTP now gives Georgia Power 2028 instead of the 06/01/2027 Need Date. On the starter file's own coordinates, dates, and center rule, the engine still reproduces 7.55 mi and 517 days exactly.

The Georgia Power detail page describes "the Goshen (Savannah) - Georgia Pacific (Rincon) section, approximately 6.7 miles" (p. 314). That scoped line evidence is retained in the project record; the live distance still comes from the closest available work geometries rather than their midpoints.

**6. What happened to OVL_1, OVL_2, OVL_4, OVL_5 and OVL_6?**
OVL_2 is in the queue at #13 (3.03-mi closest approach, 183 days), flagged because Georgia Power's planned date, June 1, 2026, has passed and no source confirms completion. OVL_1, OVL_4, OVL_5 and OVL_6 involve three DESC projects (6810 A, 6809 E, 6808 S) that no longer appear in the current list. The Method drawer shows the page where each was last listed and says "no longer listed", never "completed", because no source we reviewed says so.

**7. Why keep projects whose in-service date has passed?**
Because a passed date is not evidence of completion. 48 such projects stay in the queue, flagged "planned date passed; completion not confirmed", with TIME at most "possible" and 15 points off. None of the 30 flagged pairs involving them gets TIME confirmed or a BOTH badge. Dropping them, as our earlier engine did, loses 30 pairs, including Sperry's OVL_2. Projects that a source calls complete are archived, and 0 pairs involving them are flagged.

## Data and locations

**8. How do you know McIntosh is Georgia Power's?**
For the five projects that only SERTP 2026 lists, we don't know for certain, and the app says so. SERTP files them under "SOCO" in the Southern balancing authority area without naming the owner (for example p. 50). We infer Georgia Power because OpenStreetMap tags the McIntosh and West McIntosh substations as Georgia Power's (mapper-supplied), and the Ten-Year Plan's other McIntosh work (TEAMS 20277) is sponsored by Georgia Power's Savannah area. Each of those projects carries that caveat. We also never merge McIntosh and West McIntosh: they are different substations 0.46 mi apart.

**9. How accurate are the substation locations?**
Terminals are matched to OpenStreetMap power features and Nominatim, as Sperry's location guide suggests, then checked against the plan's wording. In the Savannah River region, the located points include 252 named facilities confirmed, 27 named but lower-confidence, and 49 town-level. Each point carries an uncertainty radius that becomes distance bounds. Lower-confidence points cost 5 ranking points, and a match based only on town-level locations is never better than "possible". An audit checks that each facility name resolves to one place. The one exception is Goshen: two different substations 86.9 mi apart, which are never treated as one site.

**10. How fresh is the data? Didn't DESC move to SERTP?**
Not yet, as far as the public record shows. On 26 September 2026 the SCRTP home page linked one planned-facilities list, the 2026–2030 edition, and said DESC and Santee Cooper "are planning to join" SERTP. Neither of SERTP's June 2026 plan documents contains "Dominion"; the report names DESC only as a terminal of a Duke Energy Progress line (p. 17). SERTP's September 2026 meeting still lists SCRTP as a neighbor (p. 43). That conclusion is labeled "our reading" in the app. We did use SERTP 2026 for Georgia Power: newer in-service years and five new projects.

**11. Did you use any CEII?**
No. We use only public editions: SERTP's plan is its non-CEII edition (p. 3), and Georgia Power's is the "PUBLIC DISCLOSURE" file from Georgia PSC Docket 56002, whose costs stay "REDACTED". We store only short excerpts, and the audit checks that none quotes CEII-marked text: 0 of 1,786 do.

**12. Georgia Power's costs are redacted. Where do your dollar figures come from?**
From labeled proxies, never from Georgia Power. Where a Georgia Power line has a published length, its capital is shown as miles × a cost range: ≈ $8.1M–$11.4M for the top lead's 6.7 miles, from DESC's own 115 kV rebuild example to MISO's 115 kV rebuild cost. Substation work gets no proxy and says "cost redacted". DESC's costs are its published figures, such as $5.4M for the top lead.

**13. Why MISO unit costs for the Southeast?**
They are the most detailed public, page-citable unit-cost tables we found. Every MISO row shows its dollar year and MISO's own caveat that its exploratory costs are not for planning decisions. The results are labeled *stated*, *conditional* or *context*, never summed, and never called savings. The honest reading is order of magnitude: staging two jobs together is worth up to about $100K; sharing a 345 kV terminal, about $9M–$12M.

## Evaluation and AI

**14. You have no labels. Why should we trust the ranking?**
We don't claim precision; we measure what can be measured without labels. The engine reproduces the starter workbook exactly as a legacy check, then applies the challenge's closest-point rule to live geometry. It flags 149 of 7,929 candidate pairs (1.9%), where a "close or same time" rule flags 4,631 (58.4%). Nothing a source calls complete is flagged and nothing is flagged across regions. Reviewer mode is built to collect planner labels, which would turn this into a real precision estimate.

**15. Isn't your 10 of 13 documented-interface result circular?**
Partly, which is why we call it a control-set recall check rather than an independent precision estimate. Some controls and the shared-facility rule come from the same filings. Removing all source-stated shared-site logic (ablation A3b) still retains 9 of 13 from closest-point geometry and other evidence; the full engine retains 10. None of the 13 is in the Savannah River region, so they do not validate the Savannah leads directly.

**16. What does the AI actually do?**
It never decides a match. Parsing and matching are deterministic. OpenAI GPT-5.5 independently re-read all 283 in-scope Savannah River plan pages as a cross-check: 2,578 of its 2,579 quoted fields are verbatim on the page, and where it and our parser both give a value they agree on 98.5% (1,642 of 1,667). We report its gap too: it leaves Georgia Power's "Need Date" out of the in-service field on 88 of 138 pages. Model output never enters the snapshot. Claude research agents found facts and quotes, and every quote must still be re-found verbatim by script before it can appear.

**17. Why not a simpler county or name join?**
We tried both as baselines. The Savannah River is the state line, so a county-plus-year join finds 8 DESC × Georgia Power pairs, against 111 under your 25-mile rule; only 23 of those 111 share a county. A facility-name join finds 24 pairs, but 12 of them are over 50 mi apart (different facilities with the same name) and it misses neighbors with different names.

## Scale and engineering

**18. How would this scale to every utility, and to Order 1920?**
The engine is generic: projects with located terminals, dated claims and sources, compared within a region. A full run over 7,929 pairs takes about 0.13 s on a laptop. The cost is ingestion: each plan format needs a parser and geocoding. SERTP's regional plan already lists projects for several balancing authority areas in one format (AECI, Duke Carolinas, Duke Progress East and West, LG&E/KU, Southern and TVA), so one parser there would cover many utilities. Order 1920 will add in-kind replacement estimates for facilities at or above 200 kV (p. 258), which fit the same model once published.

**19. What's hardcoded?**
The rules: the 25-mi default radius (adjustable in the app), the 0.6-mi same-site tolerance, the 30-day minimum schedule overlap, the 1,460-day ranking horizon, and the priority weights. The curated inputs: geocode decisions (`data/region-b/geo/`), researched Region A projects and relations (`data/research/`), the SERTP 2026 in-service years and five new projects (in `scripts/ingest/region_b_to_clusters.py`, each with its page), the cost table (`data/region-b/cost.json`) and Sperry's starter file. Every curated excerpt is re-found verbatim when the snapshot is built and again by `npm run audit`. Matches, ranks and queue counts are computed by the engine at runtime; the Method drawer's Evaluation section shows the committed `npm run eval` report and names the snapshot it was computed on.

**20. What would it take to use this for real?**
Planner labels in reviewer mode, to measure precision. Field-work dates, for example from Georgia EPD permit notices (we already use one, labeled "permit-coverage dates, not a crew schedule"). `scripts/ingest/permit_search.py` already sweeps Georgia EPD's and SC DES's public permit records near the leads; run on a schedule, it would flag the first land-disturbance filing for a lead's project. More utilities in the region (Duke's plan is cached but not ingested; Santee Cooper, GTC and MEAG). A scheduled refresh that flags when a new plan edition moves a date. It would stay a tool for review leads: it never contacts a utility and never claims that crews or equipment can be shared.
