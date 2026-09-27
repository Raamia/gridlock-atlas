# GridLock Atlas: Evidence-Grounded Matching of Public Utility Construction Plans

*GridLock Atlas team, ShellHacks 2026, Sperry Tech GridLock Challenge. Snapshot `snap-2026-09-26-339ecf7b` (26 September 2026), engine `gridlock-engine/1.3.0`. Every number below is produced by a command in Appendix A.*

## Abstract

Neighboring electric utilities publish future transmission work in separate documents, obscuring where their projects meet. GridLock Atlas ingests public plans, measures the closest points between cross-utility project geometries, weighs published timing, and ranks the result as review leads. Official routes, digitized routes, terminal-segment estimates, and work-site points retain distinct provenance. On a frozen snapshot of 103 public sources, the engine evaluates 7,929 candidate pairs and flags 149 (1.9%); a literal "close *or* at the same time" rule flags 4,631 (58.4%). The supplied center-based workbook remains a legacy benchmark and is reproduced exactly (6/6 overlap rows and 10/10 project rows), but its center metric does not control live flags. The engine keeps 10 of 13 documented interfaces; this relies on shared-facility statements from the same filings and is therefore reported as circular rather than as precision. GPT-5.5 independently re-read 283 plan pages: 2,578 of 2,579 quoted fields are verbatim, with 98.5% agreement where both systems return a value.

## 1. Introduction

The challenge asks for a tool that compares at least two utilities' public construction plans and flags overlap, and it fixes the rule: "Closer than 25 mi, we flag it. Farther, we ignore it." Geography is "the primary signal and timeline overlap as a strong secondary signal used together with it", and "Teams should expect most of the dataset to NOT overlap" (challenge statement, sponsor packet). The worked example is Dominion Energy South Carolina (DESC) and Georgia Power (GPC) along the Savannah River.

The policy context is FERC Order No. 1920 (89 FR 49280). "This final order is effective August 12, 2024." (p. 1). Among the benefits long-term regional planning must measure are "(1) avoided or deferred reliability transmission facilities and aging infrastructure replacement" and "(5) reduced congestion due to transmission outages" (p. 117). Each provider "must include in its in-kind replacement estimates the transmission facilities operating at and above 200 kV, or at and above a lower proposed threshold, that it owns and anticipates replacing" (p. 258). Finding where two utilities' plans already meet is a small, concrete piece of that coordination problem.

Contributions:

- **C1, provenance first.** A pipeline in which every displayed fact carries a verbatim excerpt and page from a cached public document, re-found by script at build time and again by the audit.
- **C2, geometry-aware matching.** Closest-point measurement across routes, estimated terminal segments, and work sites, with explicit provenance, uncertainty, and four operational distance tiers.
- **C3, evaluation without labels.** Exact reproduction of the sponsor's tables, baselines with denominators, negative controls, radius sweeps and ablations, all from `npm run eval`.
- **C4, a model cross-check that never becomes a fact.** A GPT-5.5 re-read of 283 plan pages, scored as agreement with the deterministic parser.
- **C5, cited impact channels.** Separate, labeled, never-summed scenarios for the bonus cost/impact estimate.

## 2. Data and provenance

| Region | Utilities | Projects | Main sources |
| --- | --- | --- | --- |
| Savannah River (SC–GA) | DESC, Georgia Power | 199 (DESC 54, GPC 145) | SCRTP *Planned Transmission Projects $2M and above* 2026–2030 (current; 2025–2029 and 2024–2028 kept as version history); 2024 GA ITS Ten-Year Plan in the 2025 IRP Technical Appendix Vol. 3 (public disclosure, Georgia PSC Docket 56002); SERTP 2025 regional plan and 2026 preliminary expansion plan (June 12, 2026); SC PSC Docket 2023-115-E; Dominion's Jasper–Okatie project page; a Georgia EPD stormwater permit notice |
| Upper Midwest | Dairyland, Xcel (NSPW, NSPM), ATC, Transource, and others | 18 | Wisconsin PSC decisions, MISO LRTP/BECI filings, utility project pages |
| Southern Plains | Xcel (SPS), Transource Oklahoma | 2 | Potter–Beckham filings |

The snapshot holds 219 projects from 19 utilities, 103 cited public sources and 1,786 excerpts. Each source is fetched, hashed (SHA-256) and cached; the app reads only the frozen snapshot, so it runs when publisher sites are down. DESC's list is parsed deterministically, one project per page. Georgia Power's plan is parsed from its summary table and project pages (GPC and Savannah-area projects; GTC, MEAG and Dalton projects are out of scope). Research beyond the two plans was agent-assisted and then re-verified: `scripts/build-snapshot.ts` and `npm run audit` re-find all 1,786 excerpts verbatim. None has been checked by a human yet; reviewer mode records that when it happens.

**Newest-source check.** The sponsor's glossary says DESC's list may move to SERTP and is "worth double-checking for a newer source". On 26 September 2026 the SCRTP home page linked one planned-facilities list, the 2026–2030 edition. It also says DESC and Santee Cooper "are planning to join the Southeastern Regional Transmission Planning (SERTP) process region, to become effective as of the effective date of Dominion Energy South Carolina's Order 1920 compliance filing." Neither SERTP 2026 document (the 115-page June 12 report and the 174-page June 24 meeting presentation) contains "Dominion" or "Santee"; in the report, DESC appears only as a terminal of a Duke Energy Progress line ("SUMTER - DESC EASTOVER", p. 17). SERTP's September 2026 meeting still lists SCRTP as a neighbor: "SERTP has now held interregional data exchange meetings with the following neighbors: – SCRTP and FRCC" (p. 43). Our reading, labeled as such in the app, is that SCRTP 2026–2030 is still DESC's current list. SERTP 2026 does update Georgia Power: newer in-service years become current (older dates stay as version history), and five new Savannah-area projects enter. SERTP files them under "SOCO" without naming the owner, so Georgia Power is a labeled *inference*.

**CEII.** Only public editions are used. SERTP's 2025 regional plan is its non-CEII edition ("as it does not include Critical Energy Infrastructure Information (CEII) materials", p. 3). Georgia Power's plan is the "PUBLIC DISCLOSURE" file, whose costs read "Estimated Cost – GPC REDACTED" (p. 314); they stay redacted. A live check finds 0 of 1,786 stored excerpts quoting CEII-marked text.

**Locations.** Terminals are matched to OpenStreetMap power features and Nominatim, as the sponsor's location guide suggests, then checked against the plan's wording. In the Savannah River region the located points include 252 named facilities confirmed, 27 named but lower-confidence and 49 town-level. Lower-confidence points cost ranking points, and a match that rests only on town-level locations is never better than "possible".

**Plan status.** Two projects that a source calls complete are archived as negative controls. Forty-eight plans whose planned in-service date has passed with no source confirming completion are kept and flagged, never silently dropped.

## 3. Method

**Place (primary).** Each project becomes a geometry with provenance. Published GIS routes are used directly. Routes digitized from official maps are measured but labeled approximate. Material line work without a route uses the straight segment between named terminals; only an interior projection is approximate, while an endpoint remains a located point. Substation and equipment work remains at scoped work-site points. The engine computes point-to-point, point-to-line, or line-to-line closest approach and detects crossings. Distance uncertainty yields `d_low = max(0, d − e_A − e_B)` and `d_high = d + e_A + e_B`; an inferred or digitized interior supports at most a *possible* match until its alignment is confirmed. Operational tiers are touching/crossing, under 1.6 km (shared land), under 8 km (site logistics), and under 40 km (crews/equipment). A source-stated shared facility is a zero-mile contact. The starter workbook's midpoint center remains a secondary readout solely for reproducibility.

**Time (secondary).** Construction windows are compared for every combination of sources and are confirmed when `max(S_latest) ≤ min(E_earliest)`. No window is invented from an in-service date: a start plus a need date is kept as bounds with the field work undated, and DESC's yearly budget gives only a coarse window, so both support at most "possible". Published *schedules* are compared separately: Georgia Power's Start Date, which its plan defines as the "schedule for implementation (start date)" (Ten-Year Plan p. 174), or DESC's first evidenced spending, through the current in-service date. When two schedules overlap for certain for at least 30 days, TIME is confirmed on a *schedule basis*. The app always adds "field-work dates are not published" and never calls this a construction overlap. A plan whose in-service date has passed caps TIME at "possible". The gap between in-service dates in days, the sponsor's secondary signal, informs ranking.

**Status.** A sourced coordination claim naming the other project, or a shared initiative, files the pair under *Known coordination*. Otherwise a confirmed place is *Needs review*, and an uncertain one is *Possible*.

**Priority** is an explainable ordering, not a probability. Place gives up to 60 points: a stated shared facility 60, an implied one 50, otherwise 30 plus up to 30 for closeness (12 when place is only possible). Time gives up to 30: a construction overlap 30, a schedule overlap 28–30, a possible overlap 18–30 and an unknown overlap 0–15, both scaled by the in-service gap over a 1,460-day horizon. Evidence completeness gives up to 10. A lower-confidence location costs 5 and a passed planned date 15. Pairs kept only for a shared facility beyond the radius rank after every within-radius needs-review pair.

The engine is deterministic TypeScript (one run over the snapshot takes well under a second). No model output enters matching. The pipeline, as the app's Method drawer draws it: public URL → fetch + SHA-256 → page text → structured extraction (deterministic parser) → verbatim span check → snapshot → deterministic engine → map, queue, timeline and brief.

## 4. Interface

A Next.js app shows both utilities' projects on a Mapbox map, with amber links for flagged pairs and halos for approximate places. The ranked queue has four tabs (Needs review, Known, Conflicts, Possible) and an adjustable review radius. An evidence inspector covers where the projects meet, when they build, documented coordination, impact channels and preserved source disagreements. There is a timeline of published windows, a one-question review brief with numbered citations, and a Method & audit drawer with live checks. CSV exports reproduce the sponsor's two tables. The overlap table holds only pairs under 25 mi, closest first; the project table has centers, `overlap_count` and `overlap_1…n`. A third file lists every flagged pair with `sponsor_rule` and `beyond_rule_reason`. Reviewer mode records labels and human excerpt checks, and an eight-step guided demo tells the story. Playwright tests cover the UI, including an offline run with all Mapbox requests blocked.

## 5. Evaluation

**Universe.** U is exactly the engine's candidate set: pairs of eligible projects (217 of 219; the two archived projects are excluded) in the same region with no shared owner, **7,929 pairs**, of which 7,830 are DESC × Georgia Power. All rates below use U unless stated. There are no human labels, so no precision is reported: an unflagged pair is not a labeled negative.

### 5.1 Sponsor reproduction

The engine re-runs on the ten starter projects (the starter file's coordinates and dates) and must reproduce both tables.

| Row | Pair | Sponsor mi / days | Ours mi / days |
| --- | --- | --- | --- |
| OVL_1 | DESC_2 × GPC_1 | 4.09 / 3,074 | 4.09 / 3,074 |
| OVL_2 | DESC_3 × GPC_2 | 5.65 / 152 | 5.65 / 152 |
| OVL_3 | DESC_3 × GPC_3 | 7.55 / 517 | 7.55 / 517 |
| OVL_4 | DESC_1 × GPC_1 | 8.01 / 3,074 | 8.01 / 3,074 |
| OVL_5 | DESC_5 × GPC_2 | 14.34 / 365 | 14.34 / 365 |
| OVL_6 | DESC_5 × GPC_3 | 14.81 / 730 | 14.81 / 730 |

All 6 rows match (±0.01 mi, to the day), with 0 extra pairs at every radius from 5 to 50 mi. At 5 mi 1 row is found, at 10 mi 4, and from 15 mi all 6. The project sheet matches for 10/10 projects (center, `overlap_count`, `overlap_1…3` in order).

### 5.2 Selectivity and baselines (R = 25 mi)

| Id | Method | Flagged (of 7,929) | DESC × GPC (of 7,830) | Documented interfaces (of 13) |
| --- | --- | --- | --- | --- |
| B1 | same county + same in-service year | 12 (0.2%) | 8 | 4 |
| B1w | same county + overlapping window years | 22 (0.3%) | 12 | 8 |
| B2 | Sperry's rule alone: exact centers < 25 mi | 111 (1.4%) | 111 | 0 |
| B3 | close OR on a similar schedule (literal reading of "either … or") | 4,631 (58.4%) | 4,571 | 13 |
| B5 | B2 AND time possible or confirmed | 50 (0.6%) | 50 | 0 |
| B6 | same facility name in both plan texts | 24 (0.3%) | 15 | 8 |
| **B4** | **GridLock engine** | **149 (1.9%)** | **137** | **10** |

- **B2 ⊆ B4.** None of the 111 sponsor-rule pairs is missing from the engine's queue, at every radius from 5 to 100 mi. The engine adds 22 leads: 10 shared facilities, 6 county-level possibles and 6 where location uncertainty reaches inside the radius.
- **Why a county join fails here.** The Savannah River is the state line. Of the 111 DESC × GPC pairs under 25 mi, only 23 share a county, and in 90 the DESC project lies entirely in South Carolina counties. Across all 7,830 DESC × GPC pairs, 25 share any county.
- **Why a name join fails.** It needs no coordinates, but it joins different facilities that share a name (12 of its pairs are over 50 mi apart) and misses neighbors whose facilities have different names.
- **Why OR fails.** The time leg alone fires on 4,553 pairs, so the literal OR reading contradicts the sponsor's expectation that most pairs do not overlap. The same challenge text also makes geography primary, and the engine follows that reading.

Engine queue at 25 mi: 72 needs review, 8 known coordination, 69 possible. Badges: 61 GEO, 19 BOTH, 69 POSSIBLE. TIME is confirmed on 36 pairs, possible on 35, unknown on 29, and no-match on 49. The in-service gap is known for 135 of 149 pairs. By region: Savannah River 137, Upper Midwest 11, Southern Plains 1. All 149 flagged pairs have every cited excerpt verified.

### 5.3 Documented interfaces, and why the result is circular

"Documented interfaces" are relations that the snapshot's public filings state or imply: shared sites, interconnections, shared initiatives or known coordination. There are 22; 9 have a shared owner (internal by design), leaving **13 cross-utility pairs in U**: 9 physical, 2 joint, 2 portfolio. Three rest on an inferred relation, and **none is in the Savannah River region.** The engine keeps 10/13 (9/9 physical); the center rule alone keeps 0/13, because documented interfaces are long lines that meet end to end, so their centers are 25.8–122.3 mi apart. The three misses have no shared site. One is a same-initiative link (Xcel's Minnesota segments and Alma–Blair are both parts of MISO LRTP Project 4); our relation record notes, as a reading of the route descriptions, that those segments do not physically meet Alma–Blair. The other two are portfolio links: Grid Forward's planning analysis assumes Alma–Blair in service (application p. 47), and the PSC found Grid Forward beneficial "both individually and in conjunction with" the Western Wisconsin project (final decision p. 19).

This check is partly circular because the shared-site rule reads some of the same relations used as positives. The legacy center rule keeps 0/13, while ablation A3a (source-stated shared sites removed) and A3b (all shared-site logic removed) each retain 9/13 through closest-point geometry and other evidence. The full engine retains 10/13. The honest claim is narrow: closest-point geometry recovers most long lines that physically meet even when their centers are far apart, while one additional control depends on a sourced shared-facility statement. This is not an accuracy estimate.

### 5.4 Negative controls

| Control | Pairs | B3 (OR) | Engine |
| --- | --- | --- | --- |
| Pairs with a project a source calls complete (archived) | 14 | 1 | 0 |
| Pairs whose exact centers are > 50 mi apart | 7,674 | 4,414 | 5, all source-documented shared facilities |
| Cross-region pairs (for example Georgia × Wisconsin) | 3,614 | 1,837 on time alone | 0 |
| Pairs with a past-due plan (48 projects) | 2,942 | 1,391 | 30 flagged, every one marked past due; 0 TIME confirmed; 0 BOTH |

### 5.5 Radius sensitivity

| R (mi) | 5 | 10 | 15 | 20 | **25** | 30 | 40 | 50 | 75 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Flagged | 40 | 64 | 84 | 118 | **149** | 175 | 215 | 283 | 578 | 1,209 |
| B2 (center rule) | 7 | 33 | 45 | 70 | **111** | 131 | 175 | 201 | 424 | 1,023 |
| Interfaces B4 / B2 (of 13) | 10 / 0 | 10 / 0 | 10 / 0 | 10 / 0 | **10 / 0** | 10 / 1 | 10 / 5 | 10 / 5 | 11 / 8 | 13 / 11 |
| Top lead's Savannah rank | – | 2 | 1 | 1 | **1** | 1 | 1 | 1 | 1 | 1 |
| 25-mi top 10 kept | 1 | 4 | 6 | 9 | **10** | 9 | 9 | 9 | 8 | 8 |

The top needs-review lead has a 4.25-mi closest approach and remains first from 10 to 100 mi. At 5 mi it ranks second because the tighter radius changes the queue. The legacy center baseline needs 100 mi and 1,023 pairs to keep 11 of the 13 interfaces.

### 5.6 Ablations (snapshot transforms; engine code unchanged)

| Variant | Flagged | NR / known / possible | BOTH | Interfaces | Top lead |
| --- | --- | --- | --- | --- | --- |
| A0 full engine | 149 | 72 / 8 / 69 | 19 | 10/13 | #1 |
| A1 no location uncertainty | 132 | 72 / 8 / 52 | 19 | 10/13 | #1 |
| A2 no town-level cap | 149 | 92 / 8 / 49 | 25 | 10/13 | #1 |
| A3a no source-stated shared sites | 148 | 71 / 7 / 70 | 19 | 9/13 | #1 |
| A3b no shared-site rule | 148 | 68 / 7 / 73 | 19 | 9/13 | #1 |
| A4 A1 + A2 + A3b | 131 | 100 / 7 / 24 | 28 | 9/13 | #1 |
| A5 no schedule basis | 149 | 72 / 8 / 69 | 0 | 10/13 | #1 |
| A6 drop past-due plans (engine 1.1 rule) | 119 | 52 / 8 / 59 | 19 | 10/13 | #1 |

Each safeguard has a visible job. Without location uncertainty, 8 flagged pairs disappear and 3 possible pairs are overclaimed as needs review. The town-level cap stops 9 pairs from being overclaimed (with it removed, 4 of them become BOTH). The shared-site rule accounts for every known-coordination case. The schedule basis supplies every BOTH badge. Keeping past-due plans restores 28 pairs, including Sperry's OVL_2. No safeguard moves the top lead. Not run, because each needs an engine code change: the priority weights, the 0.6-mi same-site tolerance, the 30-day schedule minimum, the 1,460-day horizon and the beyond-radius floor.

### 5.7 Extraction agreement (GPT-5.5)

`gpt-5.5-2026-04-23`, with prompt `gridlock-extract/1.1` frozen for the whole run, re-read all 283 in-scope Region B pages (145 DESC, 138 Georgia Power) with structured outputs. There were 0 errors, 230,200 input and 214,779 output tokens, and an estimated cost of ≈ $7.59 (an upper bound at the published $5/$30 per 1M tokens). The reference is our deterministic parse, not human labels, so these are agreement rates.

- **Verbatim quotes:** 2,578/2,579 returned fields quote text found on the page (95% Wilson CI 99.8–100%).
- **Agreement where both give a value:** exact 1,642/1,667 (98.5%, CI 97.8–99.0), lenient 1,659/1,667 (99.5%).
- **Recall when the parse has a value:** 1,659/1,756 (94.5%). Correct abstentions: 853/861.
- **Unsupported values:** no disagreeing or extra value came without a verbatim quote. The 8 values the parse lacks all quote the page.
- **A reported gap.** The model returns Georgia Power's Need Date as the in-service date on only 50 of 138 pages (50/50 exact). It leaves the field empty on 88, because the page says "Need Date" and the frozen prompt asks for an in-service date. We report this rather than change the prompt mid-run.
- **Redacted costs.** "Estimated Cost – GPC REDACTED" is on 138/138 GPC pages. The model answered REDACTED 63 times, left the field empty 75 times, and never gave a number.
- **Adjudication.** Each non-agreement was checked against the page by Claude, and these are not human labels: 88 prompt semantics, 12 both supported, 11 model supported, 9 formatting, 1 page inconsistent, 1 parse supported. The inconsistent page is DESC 6367 D, whose title says "Riverport 115kV Tap" while its description says 230 kV.

## 6. Case studies

**(a) The top Savannah River lead.** DESC's Jasper–Okatie 230 kV #2 and Georgia Power's Goshen–McIntosh rebuild have a 4.25-mi closest approach, placing them in the site-logistics tier. Both closest points are named terminals, so the distance does not depend on an inferred line interior. Their published schedules overlap for 18 months (June 2025–December 2026), while the interface clearly labels that field-work dates are not published.

**(b) A confirmed schedule overlap: Sperry's OVL_3 today.** The same pair is #1 in the queue (P94, 4.25-mi closest approach, BOTH). The app reads: "Published schedules overlap (start → in-service) for 18 months (Jun 2025–Dec 2026); field-work dates are not published." DESC's date moved from "12/31/25" to "5/31/2026" and then "12/01/2026" across three plan editions. The SC PSC docket agrees with the current date and records the estimate changing from approximately $54 million to approximately $98 million. Without the schedule basis (A5), no pair receives a BOTH badge.

**(c) Tremval North, known coordination.** The Wisconsin PSC's final decision states that Dairyland's 345 kV line would connect to the new Tremval North station approved for Xcel's WWTC. The project centers are about 37 mi apart, but the projects physically meet: closest approach is therefore a source-supported zero-mile contact, filed under Known coordination rather than presented as a new opportunity.

**(d) Sperry's example on today's plans.** OVL_3 is #1 in the queue (4.25-mi closest approach, at least 396 days on current dates). OVL_2 is #13 (3.03 mi, 183 days). It remains visible although Georgia Power's planned date has passed because no source confirms completion. Four other starter rows involve DESC projects absent from current lists; the app calls them "no longer listed", never "completed".

**(e) A third utility.** Duke Energy's Carolinas plan is cached and would add DESC's own ties. For example, the CTPC 2025–2035 plan lists "W220124 – Newberry 115 kV Line (Bush River-DESC), Upgrade" (p. 154), and DESC's list has "Rebuild the existing Saluda Hydro – Bush River #1 and #2 Tie Lines to SPDC 1272." (p. 15). Duke is **not** in this snapshot, and no number above includes it.

**Evidence retained from the earlier center-ranked lead.** Changing the ranking does not remove its source record. DESC calls it “Okatie – McIntosh 115kV Tie: Add Series Reactor” and gives “12/31/2028.” Georgia Power scopes its rebuild to the “Goshen (Savannah) - Georgia Pacific (Rincon) section, approximately 6.7 miles” and prints “Need Date 06/01/2027.” For the current OVL_3 side, the PSC states: “DESC now estimates the commercial operation date for the facilities to be December 1, 2026.” The Wisconsin control states that Dairyland connects “to the new 345 kV Tremval Nouth Substation that was approved in docket 5-CE-158.” These excerpts remain auditable even though closest-point ranking changes which pair appears first.

## 7. Impact channels (bonus)

The estimate is split into channels. Each has a formula, a cited unit cost with its dollar year, and one of three labels: *stated* (a source states the sharing), *conditional* (an upper bound that needs something no source shows) or *context* (scale, not a saving). Channels are never added together.

- **Top lead:**
  - *Shared new right-of-way:* 0 acres, because neither project needs a new corridor.
  - *Staging both jobs together:* up to ≈ $100K (conditional, 2018 $). That is the smaller of MISO's $262,660 new-site substation mobilization (MTEP18 guide p. 39) and its $100,000 115 kV line mobilization (p. 16). The avoided-mobilization idea comes from SCE&G testimony summarized in a joint proposed order filed in SC PSC Docket 2011-325-E: building two lines on the same structures "at the same time will avoid the need to mobilize construction crews twice" (p. 52). No source shows these two jobs share structures, crews or field dates, hence "up to".
  - *Planned outages:* not priced. Both lines are named for McIntosh, and NERC IRO-017-1 requires a process to "coordinate the resolution of identified outage conflicts" (p. 2).
  - *Capital in scope (not a saving):* DESC's published $5.4M and, because Georgia Power redacts its cost, a labeled mileage proxy of 6.7 mi × $1.2M–$1.7M/mi ≈ $8.1M–$11.4M.
- **Tremval North:** one 345 kV terminal instead of two, ≈ $9.0M–$12.4M and 1.5–2.2 acres (stated; MTEP24 $, including MISO's contingency and AFUDC). That is MISO's new 4-position ring bus ($15.8M) minus adding 1–2 positions ($3.4M–$6.8M) (MISO cost guide p. 42). The separate-station alternative is our assumption, and MISO says its exploratory costs are not for planning decisions.
- **Savannah River portfolio:** 65 needs-review pairs whose windows are not ruled out. Taking disjoint pairs in rank order, each project counted once, gives 8 pairs, a staging ceiling of $857,590 (2018 $) and 0 acres of new shared right-of-way. The capital in scope is listed, not summed: DESC $145.2M published (9 projects), Georgia Power ≈ $97.1M–$134.6M by mileage proxy (11 lines, 71.8 mi), and 12 Georgia Power projects with no cost or proxy.

## 8. Limitations and ethics

- **No planner labels.** There is no precision or effectiveness claim. "Needs review" means the reviewed sources are silent; it never means uncoordinated, and a flag never means crews or equipment can be shared.
- **Few, circular positives.** There are 13 documented interfaces, each worth 7.7 points of recall, all outside the Savannah River region, and the engine reads the same filings (§5.3).
- **Coarse time.** DESC publishes budget years, not construction dates. Georgia Power publishes a Start Date (as last published in 2024) and a need or in-service date. A confirmed TIME is a *published-schedule* overlap; field-work dates are not published for any top Savannah River pair.
- **Owner inference.** SERTP 2026 files five new projects under "SOCO" without naming the owner, so Georgia Power is an inference and is labeled as one. For Georgia Power's project 21116, SERTP 2026 assigns the new 230 kV line to MEAG and the switching station to GPC (p. 77); we keep it under Georgia Power and say the line may be MEAG's.
- **Costs.** Georgia Power's costs are redacted, so proxies are labeled as such. MISO unit costs come from another region and other dollar years, and the impact rows are scenarios, not savings.
- **Frozen snapshot.** Plans move: four of the sponsor's six rows changed within two editions. The snapshot is dated 26 September 2026, and absence from a newer list is not evidence of completion.
- **Coverage.** Two utilities in the sponsor's region; Duke, Santee Cooper, GTC and MEAG are not ingested. Geocoding is by name, with 27 lower-confidence and 49 town-level Savannah points.
- **Model cross-check.** It measures agreement with our parser, not truth, and model values never enter the snapshot.
- **Public data only.** No CEII; only short excerpts are stored. The tool never contacts a utility.

## 9. Conclusion

A provenance-aware closest-point method turns 7,929 candidate pairs into 149 cited review leads, reproduces the sponsor's legacy workbook exactly, and says what it cannot know. The next step is planner labels in the existing reviewer mode, which would turn this protocol into a real precision estimate.

## Appendix A. Reproduce

```bash
npm install
npm run check                      # tsc, eslint, vitest (incl. sponsor tables, eval invariants, this paper's numbers and quotes), audit
npm run audit                      # 219 projects, 103 sources, 1786/1786 excerpts verbatim; 7929 pairs → 149
npm run eval                       # data/eval/eval.{json,md}: baselines, controls, sweep, ablations
npm run extract:eval -- score      # data/eval/extraction-eval.{json,md} from the 283 stored runs (no API call)
python3 scripts/ingest/find_excerpt.py <sourceId> --page <p> "<excerpt>"   # re-find any quote above
```

Versions: snapshot `snap-2026-09-26-339ecf7b` (26 September 2026), engine `gridlock-engine/1.3.0`, extraction prompt `gridlock-extract/1.1` (sha256 `9810cb893eca…`). County polygons for B1 come from the US Census `cb_2023_us_county_20m` file (hash recorded in `data/eval/counties.json`). Baseline definitions are in `scripts/evaluate.ts`.
