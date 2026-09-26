# Land-disturbance permit check (26 September 2026)

**Question.** No top Savannah River lead has published field-work dates. Before land is cleared, the work must be covered by a state stormwater permit. Georgia EPD requires a Notice of Intent (NOI); South Carolina DES records a land-disturbance boundary for work in the coastal zone, which includes Jasper County. Do those filings date the field work for the projects behind the top 12 leads?

**Answer.** Not for any pair. Georgia Power has no land-disturbance filing for any of its projects behind the top 12 leads. On DESC's side, the only matching filings are for the Okatie 230 kV substation (2022–2023). So no top lead has two permit windows that could be compared. Read the other way, as of 26 September 2026 no public filing shows that Georgia Power has started ground work on its side of any top lead.

A filing shows that land disturbance was permitted or requested. It is not a crew schedule. Finding no filing is not evidence that no work is planned: a Notice of Intent is due at least 14 days before construction begins. Nothing here enters the snapshot or the engine.

Reproduce with `python3 scripts/ingest/permit_search.py`, which writes [`permit-search.json`](permit-search.json).

## What was searched

| Source | Scope | Result |
| --- | --- | --- |
| [Georgia EPD GEOS Public Inquiry Portal](https://geos.epd.georgia.gov/GA/GEOS/Public/Client/GA_GEOS/Public/Pages/PublicApplicationList.aspx), NPDES program | Every filing in Effingham and Chatham counties submitted 1 Jan 2024 – 26 Sep 2026, in 90-day slices (the portal returns at most 500 results per search; no slice reached it). Plus facility-name searches of all years: Goshen, McIntosh, Rice Hope, Kraft, Georgia Pacific, Rincon, Meldrim, Ogeechee | 79 filings whose facility name looks like utility work |
| [SC DES OCRM land-disturbance boundaries](https://gis.des.sc.gov/gisserver/rest/services/OCRM/CZC_Layers/MapServer/0) (`LD_BOUND_CURRENT`, June 2019 onward) | Every boundary intersecting lon −81.5 to −80.6, lat 31.9 to 32.8 (Jasper, Beaufort and nearby counties) | 1,269 boundaries, 15 whose project name looks like utility work |

"Looks like utility work" is a name filter (kV, substation, switching, transmission line, GPC, Dominion/DESC, and similar), minus water, sewer and gas-main projects. The GEOS county field is blank on some older records, so the name searches cover those records.

## Projects behind the top 12 Savannah River leads

| Project | Filings found |
| --- | --- |
| Georgia Power 20065, Goshen (SAV) – McIntosh 115 kV rebuild (in #1, #2, #3, #8) | None since 2024. Earlier work nearby: "Georgia Pacific Substation" (NOI 12/18/2018, terminated 09/10/2020) and "Georgia Pacific Sawmill Transmission Line" (NOI 03/11/2019, terminated 04/07/2020) |
| Georgia Power 20989, Rice Hope new autotransformer (in #4, #7, #10, #12) | None. The "Rice Hope" results are subdivisions, storage and a lift station |
| Georgia Power 20785, Goshen (SAV) – Kraft 115 kV rebuild (in #6, #9, #11) | None since 2024. A record "GOSHEN - KRAFT 115kV" (submission 183238) is dated 09/27/2017, the same date as many other legacy records, so it most likely dates an older permit's migration into GEOS, not this rebuild |
| SERTP 2026, McIntosh 230 kV breaker control relay upgrades (in #5) | None, and none expected: relay work inside a substation |
| DESC 6888, Okatie – McIntosh 115 kV tie: series reactor and Deerfield switching station (in #1, #4, #5) | None. The "Deerfield" results are subdivisions, a road turn lane and a sand mine |
| DESC 0139 M-N, Okatie 230-115 kV substation and Jasper – Yemassee fold-in (in #3, #9, #10) | "Okatie 230kV Substation" (boundary dated 2022-12-20, 20.5 acres) and "Okatie 230kV Substation Expansion" (2023-06-16, 20.5 acres), 0.22 km and 0.15 km from our Okatie point. Neither names the owner. The dates show that site work was being permitted in 2022–2023. They are not a start or an end |
| DESC 06367 D-G, Jasper – Okatie 230 kV #2 (in #2, #6, #7) | No boundary named for the line. "Sherwood Substation" (2026-02-10, 4.0 acres): Dominion says the second line ends at the new Sherwood substation, which the SCRTP list carries as a separate record (06367 A-C, H). "Okatie - Hardeeville" (2023-06-16, 71.9 acres, about 4 km from Okatie) names no owner and no project |
| DESC 6367-D, Riverport 115 kV tap (in #8, #11, #12) | No boundary named for the tap. "Sherwood Substation" lies 1.3 km from the map-read Riverport substation point (lower-confidence). "Jasper-Riverport Transmission Line (Hardeeville-Riverport Segment)" (2025-02-28, 172.9 acres) names no owner; a water-utility filing uses almost the same name ("Jasper - Riverport Transmission Main"), so it is not linked to DESC |

The SC layer gives one date per boundary (`DB_DATE`) and does not say whether it is the filing, review or approval date. We call it the "boundary date".

## What this changes

- **The app is unchanged.** No window can be added without a start and an end on both sides of a pair.
- **For the demo.** "The two published schedules overlap by one day" can now be followed by "and as of 26 September 2026 Georgia Power has filed no land-disturbance permit for its side, so the window to coordinate the field work is still open."
- **Before judging,** re-run the script: a new Georgia Power NOI for Goshen–McIntosh or Rice Hope would give the first real field-work window for a top lead.
