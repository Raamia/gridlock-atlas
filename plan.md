# GridLock Atlas — full project specification

**Working name:** GridLock Atlas: The Shared Window  
**Version:** 1.0, 26 September 2026  
**Format:** Browser-based software project; no hardware  
**Primary target:** ShellHacks Sperry Tech GridLock Challenge  
**Research title:** *GridLock: Evidence-Grounded Spatiotemporal Matching of Public Utility Construction Plans*

## 1. Product in one sentence

GridLock Atlas compares public **future construction plans** from different power utilities, reveals geographic proximity **or** schedule overlap, and gives a planner a source-cited brief explaining whether a pair needs outreach, is already coordinated, or lacks enough evidence.

The visual centerpiece is a synchronized map and construction timeline. Selecting a candidate brings two public plans together in one view: where they work, when they work, why the match was flagged, and exactly which source supports each claim.

### The problem we are solving

Utilities publish plans in separate project pages, filings, reports, and PDFs. A person trying to find coordination opportunities must compare locations, schedules, route changes, and status across organizations and versions. The sponsor's [written challenge in the ShellHacks guide](https://app.notion.com/p/02a3bd49bed9836a81ca018f76cca02f) asks for a tool that compares at least **two utilities' public future construction plans** and flags overlap from **physical proximity or timing**. The sponsor video adds the motivation of shared resources and faster storm recovery; it does not provide live crew or restoration-job data. Therefore the product's primary data is planned construction, with any storm layer clearly marked as context.

### Core promise and limits

- **Promise:** “Here are two different utilities' projects that may deserve a coordination conversation, and here is the evidence.”
- **Not a promise:** “We know whether crews are currently available,” “we discovered uncoordinated work,” or “we measured dollars and days saved.” Public planning documents generally cannot establish those claims.
- A match is a **review lead**, not a finding that equipment or labor can be shared. Human planners decide feasibility.

## 2. Why this fits the challenge

| Sponsor requirement | Implemented behavior | Proof in demo |
| --- | --- | --- |
| Compare at least two utilities | Normalize source-backed projects from Dairyland Power Cooperative and Xcel Energy / Northern States Power Company-Wisconsin; add more as corpus grows | Show both original public pages and distinct utility identities |
| Use public future construction plans | Store public URL, publisher, document date, retrieval date, construction window, and status for every project | Click through to source excerpts |
| Flag projects that are geographically close **or** scheduled around the same time | Compute and badge `GEO`, `TIME`, or `BOTH`; do not require both | Toggle each flag type in queue |
| Make coordination actionable | Distinguish `Needs review`, `Known coordination`, `Source conflict`, and `Insufficient evidence`; export a cited review brief | Open a match, inspect evidence, export brief |

**Related tracks worth opting into only if actually implemented:** Microsoft “What's Missing?” fits an AI-powered, non-chat workflow where the user completes a real comparison. MLH Google Cloud “Best Use of Gemini API” fits if Gemini performs the source-to-structured-plan extraction that is visible in the product. Keep Sperry as the design center. Do not bolt on unrelated sponsor APIs.

## 3. Users and jobs

1. **Utility planner:** Find cross-utility construction pairs worth checking, then verify all supporting facts without hunting through documents.
2. **Regional coordinator:** See when multiple projects could compete for similar resources or share staging, while separating existing joint work from unknown status.
3. **Research reviewer:** Audit the source snapshot, matching decision, and uncertainty; label whether each candidate is worth planner review.
4. **Hackathon judge:** Understand the problem and inspect one real, honest case in under three minutes.

## 4. Source-backed demo corpus

The first demo must use real plans and retain the distinction between *match detected* and *new coordination opportunity*.

| Record | Public evidence | What may be shown | Caution |
| --- | --- | --- | --- |
| Dairyland, Alma–Blair transmission project | [Dairyland project page](https://dairylandpower.com/alma-blair-transmission-project), [2026 PSC final decision, PDF pp. 1 and 29–30](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/1515-CE-103%20Final%20Decision.pdf), and [earlier 2024 CPCN application, PDF viewer pp. 24–25 / printed pp. 4–5](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/Dairyland%20Alma-Blair%20CPCN%20Application_2024-07-01.pdf) | Approved South Route terminates at the switching station approved for Xcel's Western Wisconsin project; planned construction in 2026–27 | Use the 2026 decision for the current approved geography. The earlier application describes interface coordination; it does not prove shared crews or equipment. |
| Xcel, Western Wisconsin Transmission Connection | [Xcel project page](https://xcelenergytransmission.com/projects/western-wisconsin-transmission-connection/) and [Wisconsin PSC case page](https://psc.wi.gov/Pages/CommissionActions/CasePages/WesternWisconsin.aspx) | Planned construction in 2026–27; near the Dairyland project around Blair | Xcel's 2027–28 completion description and the PSC's Q3 2029 completion date conflict. Keep both; construction window and completion date are separate fields. |
| First `Needs review` lead to vet: Dairyland Alma–Blair vs ATC/NSPW Grid Forward Central Wisconsin | [Dairyland's 2026 final decision](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/1515-CE-103%20Final%20Decision.pdf) and [Wisconsin PSC Grid Forward case](https://psc.wi.gov/Pages/CommissionActions/CasePages/GridForwardCentralWisconsin.aspx) | Distinct construction packages converge in the Tremval area, and their published construction windows cover 2026–27 | Xcel is tied to both initiatives. The cited sources do not establish whether Dairyland and ATC have shared-resource plans. Check additional filings before presenting this as an unresolved review lead; never call it uncoordinated. |
| Cross-state validation: Xcel/SPS and Transource Oklahoma, Potter–Beckham | [Xcel/SPS Texas segment](https://xcelenergytransmission.com/projects/potter-beckham-345-kv/) and [Transource Oklahoma segment](https://www.transourceenergyprojects.com/potter-beckham/) | Two owner-specific construction packages in one border-crossing initiative; another detection case | Both sources call this a joint initiative. Keep the packages distinct for comparison but place their match under `Known coordination`, never `New discovery`. |
| Candidate for later manual review: ATC/NSPW Grid Forward Central Wisconsin and Transource BECI | [Wisconsin PSC Grid Forward case](https://psc.wi.gov/Pages/CommissionActions/CasePages/GridForwardCentralWisconsin.aspx), [MISO's 2025 BECI scope](https://cdn.misoenergy.org/20250317%20Competitive%20Project%20RFP%20Item%2002%20Presentation685217.pdf), and [MISO's 2026 selection report naming Transource](https://cdn.misoenergy.org/BECI%20Selection%20Report734487.pdf) | Both name the Columbia Substation; demonstrate a possible `GEO` review lead if two independently identified work packages are represented correctly | MISO assigns some Columbia-substation work to ATC and explicitly anticipates coordination with interconnecting owners. Existing arrangements, construction timing, and exact route need investigation before this can be called an opportunity. Do not put it in the headline demo until validated. |

**Corpus expansion after the first demo:** the [2025 Minnesota Biennial Transmission Projects Report](https://www.minnelectrans.com/report-2025.html) spans multiple utilities; the [MISO MTEP public page](https://www.misoenergy.org/planning/transmission-planning/mtep) provides status workbooks. MISO route data may not be public. Utility and public-commission pages are safer sources for route illustrations. Maintain a dated, frozen source manifest so the demo and research result can be reproduced.

## 5. Functional requirements

### P0 — complete for the Sperry submission

1. **Public source registry.** Store at least two distinct utilities' future construction work packages. Each record has at least one original source URL and a field-level citation for owner, location, construction schedule, and project status.
2. **Working comparison engine.** Generate candidate pairs only across distinct utilities. Return separate spatial and temporal flags. A pair can be returned with only one flag because the challenge says **or**.
3. **Evidence-aware statuses.** Separate `Needs review`, `Known coordination`, `Possible / insufficient evidence`, and `Conflicting sources`. A known joint build or documented interface must remain detectable but must not be advertised as a newly found coordination gap. State which kind of coordination is actually documented.
4. **Map and timeline.** The same selection controls the map, two construction bars, queue card, and evidence inspector. A user can understand the selected pair without reading code or asking a chatbot.
5. **Source inspector.** Display the source passages/pages, publisher, document/update dates, retrieval date, and confidence/precision tags that support the match.
6. **Cited review brief.** Export or copy one concise, source-linked question a planner can use for review; include unknowns and known-coordination status. This does not contact a utility.
7. **Real AI step.** Run a structured extraction on at least one public source using Gemini, persist the extracted output and model/prompt version, and show which fields were human checked. Deterministic code, not the model, calculates overlap.
8. **Reliable demo snapshot.** Store a frozen, auditable normalized dataset locally so the UI works if a source site or AI API is down during judging.
9. **One honest review lead.** Source and validate at least one pair whose resource-coordination status is not established in the reviewed public documents; label it `Needs review`, never `uncoordinated`. If curation cannot establish a credible lead before submission, show an honest empty `Needs review` state and present the featured cases as a matching/provenance proof of concept.
10. **A source-derived geographic centerpiece.** For the featured case, depict at least the approved Dairyland South Route as a visibly approximate trace derived from an [official 2024 route-options map](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/Maps/DPC_Alma_Blair_MapHandout_04.08.2024.pdf) and reconciled with the [2026 final decision](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/1515-CE-103%20Final%20Decision.pdf). Label it `schematic / not survey accurate`; use a locality halo for the Xcel project unless an approved public route map is verified. The synchronized timeline and evidence reveal supply the visual payoff even if precise GIS is unavailable.

### P1 — add after P0 works

- Guided “show me the overlap” sequence: camera fit, paired highlights, shared timeline window, and inspector reveal.
- Source-version comparison panel for the Xcel / Wisconsin PSC completion-date conflict.
- Additional validated `Needs review` cases from an expanded corpus, each labeled as *unverified coordination status* rather than newly discovered uncoordinated work.
- `Reviewer mode`: label candidate, start/stop review timer, and export audit CSV for the paper.
- Filters by utility, region, project status, flag type, source quality, and year.

### P2 — only if spare time remains

- Periodic source refresh and diff alerts.
- Optional [NWS active-alert](https://www.weather.gov/documentation/services-web-alerts) overlay called `Weather context`; it must not imply live crew assignments, outages, or job dispatch.
- User-supplied source URL import with a human confirmation step before it enters the shared corpus.
- Additional approved route GIS or responsibly digitized route geometry when public sources support it.

### Explicitly out of scope for this hackathon

- Actual utility dispatch, crew availability, outage restoration predictions, automatic utility contact, and savings claims.
- Copying a schematic PDF line onto a map as though it were an exact approved route.
- A chatbot as the central interface.
- Publicly claiming a pair is uncoordinated solely because no coordination mention was found.

## 6. Information model and provenance contract

Store **source claims**, not one flattened “truth.” A project can have multiple schedule claims from different versions or publishers. A `Project` record below means an owner-specific construction work package or independently permitted project. Two distinct owner segments may share a parent initiative; the same segment mentioned on two sites is one work package.

```ts
type Precision = "official-gis" | "official-map-digitized" |
  "named-facility" | "locality" | "county" | "unknown";
type ProjectStatus = "proposed" | "approved" | "construction" |
  "complete" | "cancelled" | "unknown";
type CoordinationStatus = "known-joint" | "reported-coordination" |
  "not-found-in-sources" | "unknown";

type SourceDocument = {
  id: string; publisher: string; title: string; url: string;
  publishedAt?: string; updatedAt?: string; retrievedAt: string;
  sha256: string; mimeType: string; sourceType: "utility" | "regulator" | "rto";
};
type Evidence = {
  sourceId: string; page?: number; section?: string;
  exactExcerpt: string; extractionMethod: "manual" | "gemini";
  reviewedByHuman: boolean;
};
type Claim<T> = { value: T; evidence: Evidence[];
  supersedesClaimIds?: string[] };
type DateBound = { earliest: string; latest: string; precision: "day" | "quarter" | "year" };
type ConstructionWindow = {
  start: Claim<DateBound>; end: Claim<DateBound>;
  phase: Claim<"preconstruction" | "general-construction" | "unknown">;
};
type Place = {
  label: Claim<string>; precision: Precision;
  geometry?: Claim<GeoJSON.Geometry>; uncertaintyMeters?: number;
};
type Project = {
  id: string; parentInitiativeId?: string; docketId?: string;
  ownerUtilityIds: Claim<string[]>;
  title: Claim<string>; status: Claim<ProjectStatus>;
  places: Place[]; constructionWindows: ConstructionWindow[];
  completionClaims?: { date: DateBound; evidence: Evidence[] }[];
  knownCoordination: { status: CoordinationStatus; partnerIds: string[];
    scope: "joint-ownership" | "interconnection-design" |
      "resource-sharing" | "unknown"; evidence: Evidence[] };
  sourceIds: string[];
};
type Match = {
  id: string; projectAId: string; projectBId: string;
  geo: "confirmed" | "possible" | "no-match" | "unknown";
  time: "confirmed" | "possible" | "no-match" | "unknown";
  geoReason?: string; timeReason?: string;
  reviewStatus: "needs-review" | "known-coordination" | "possible";
  conflictIds: string[]; evidence: Evidence[]; engineVersion: string;
};
```

**Rules:**

- `constructionWindows` cannot be populated from an in-service or completion date alone.
- An empty field stays `unknown`; the extractor must not infer a month, coordinate, route, or lack of coordination.
- Store exact source excerpts only as short evidence passages with page/section anchors and links; do not republish entire PDFs.
- Preserve disagreeing claims side by side. Mark the type of conflict and which field it affects.
- Use canonical utility IDs and reviewed alias/docket mappings. Merge duplicate **mentions of the same construction work package**, not two different packages just because they share a switching station or parent initiative. A co-owned package has multiple owner IDs. The Texas and Oklahoma Potter–Beckham segments remain two distinct packages under one known joint initiative. Source conflicts are independent flags, so a match can be both `Known coordination` and `Source conflict`.
- Each snapshot records extraction prompt version, model identifier, review status, and the source document hash.

## 7. Data and AI pipeline

```text
Public utility / regulator / RTO URL
    → fetch source and record retrieval time + SHA-256
    → HTML text or PDF text + page anchors
    → Gemini structured extraction to typed claims + exact evidence spans
    → schema and span validation
    → human review for demo corpus
    → normalized project snapshot
    → deterministic matching engine
    → map / timeline / evidence UI / cited brief
```

1. **Source manifest:** manually list the first public URLs, publisher, expected project, and source type. Prefer official utility, commission, and RTO material.
2. **Fetch and parse:** use a small Python job for HTML/PDF; keep cached text and page numbers. Retry failed sites, but the app reads the last verified snapshot.
3. **Extract:** use the [Gemini structured-output feature](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) with a tight JSON schema for utility, title, status, construction start/end, named facilities, completion/in-service date, explicit coordination mentions, and exact supporting excerpt. Request `null` for missing fields. The API guarantees shape, not truth, so validation remains mandatory.
4. **Validate:** reject an extracted claim if its quote cannot be located in normalized source text or if the citation lacks the right page/section; allow a documented human override for OCR/whitespace differences. Validate dates and project identity. Human-check all featured demo fields.
5. **Geocode only with evidence:** a named place may be shown as an approximate locality. Give it a visible precision label. If an official map is manually digitized, record that it is derived and approximate. Never ask the model to invent a route.
6. **Refresh:** compare hashes and mark changed sources for review. Do not overwrite the previous claim silently.

**Version policy:** a final regulatory decision can explicitly supersede a proposed route claim; keep both but use the approved claim for current-map rendering. Do not choose a winner solely because a webpage is newer. When two currently applicable construction-window claims disagree, evaluate all plausible combinations: only show `confirmed` if every combination supports overlap, `possible` if some do, and `no-match` if none do. Surface the conflict in the inspector. A completion-date disagreement alone does not change the construction-window match.

**AI in the experience:** the inspector can show “extracted from page X, verified” next to a field and allow a judge to open the original passage. The product's main task is comparing plans, not chatting.

## 8. Matching logic

### Eligibility

- Consider two **distinct work packages/projects** with disjoint canonical owner sets whose status is `proposed`, `approved`, or `construction` and whose work is future or ongoing relative to the snapshot date. Completed or canceled plans go to an archive and can serve as negative examples. If owner sets overlap, classify the pair as internal/shared-owner context rather than a cross-utility review lead.
- De-duplicate repeated filings/pages about the **same package and docket** before pair generation. Preserve independently owned state segments under the same parent initiative; they can form a `Known coordination` pair. Sharing a station is evidence of geographic relation, not evidence that two projects are duplicates.
- Do not let a project match itself or its duplicate filing.

### Spatial signal

1. **Explicit shared-site relation:** if source evidence says both projects connect or work at the same named switching station/substation, mark `GEO confirmed`, with a textual explanation. The map point can still be approximate; the relation is supported by text.
2. **Measured proximity:** when both geometries are sufficiently precise, calculate route/point minimum distance. Default threshold: **25 miles**, user adjustable and described as a review heuristic, not a regulatory standard. Record actual geometry precision and units.
3. **Uncertainty:** when position error is quantified, use `d_low = max(0, d_est − error_A − error_B)` and `d_high = d_est + error_A + error_B`. If `d_high ≤ threshold`, `confirmed`; if only `d_low ≤ threshold`, `possible`; otherwise `no-match`. Without usable place evidence, use `unknown`.
4. **Coarse place:** county-only or locality-only evidence can make a `possible` spatial match, never a precise mileage claim. A shared county by itself cannot prove that construction sites are near.

### Temporal signal

- Compare **construction** intervals, not completion dates. Store year/quarter/day precision for each endpoint. For each project, represent the possible start as `[S_earliest, S_latest]` and possible end as `[E_earliest, E_latest]`.
- A `confirmed` **reported-window** overlap exists when `max(S_latest_A, S_latest_B) ≤ min(E_earliest_A, E_earliest_B)`, assuming each reported construction phase runs continuously between its start and end. This does **not** establish concurrent field crews. If the source does not imply a continuous phase, lower the confidence.
- A `possible` overlap exists when `max(S_earliest_A, S_earliest_B) ≤ min(E_latest_A, E_latest_B)` but the confirmed test fails. If the possible test fails with complete windows, mark `no-match`. If one or both windows are missing, mark `unknown`, not “no overlap.”
- Show exact overlap span only when both sources support it. Show a fuzzy band for year-only or planning-level dates.

### Pair classification and ranking

```text
for each unique pair of projects from distinct utilities:
    geo = evaluate_geography(pair)
    time = evaluate_construction_windows(pair)
    if geo or time is confirmed/possible:
        detect_duplicate_or_known_joint_status(pair)
        attach all supporting and conflicting evidence
        assign queue based on coordination status and evidence quality
```

- Badges: `BOTH` when geo and time are confirmed; `GEO` or `TIME` when one is confirmed; add `possible` labels individually where evidence is coarse. Do not flatten `confirmed TIME + possible GEO` into a confident `BOTH` badge.
- The queue's ordering is an **explainable review priority**, not a predicted probability or dollar value. Put supported, not-yet-known-joint `BOTH` cases above single-signal cases; then sort by source completeness and schedule relevance. Keep `Known coordination` in its own tab. Far-apart `TIME` pairs remain visible under the literal sponsor rule but are low-priority with “resource relevance unclear.”
- A “coordination not found in sources” result is **unknown status**, not proof of no coordination. Keep `no-match` (enough evidence to rule out proximity/overlap) distinct from `unknown` (insufficient evidence).

### Required match test matrix

| Case | Expected output |
| --- | --- |
| Dairyland Alma–Blair vs Xcel Western Wisconsin | Confirmed geographic relation from the 2026 PSC decision's shared switching-station evidence; overlapping published construction years; `Known coordination` for the documented interface, with resource sharing still unknown |
| Xcel/SPS Texas Potter–Beckham vs Transource Oklahoma segment | Cross-state geographic relation; `Known coordination` |
| Same region, nonoverlapping construction years | `GEO` only, if spatial evidence is strong |
| Same construction period, far apart | `TIME` only; show low practical priority |
| County-only geography | `possible GEO`; no fabricated precise distance |
| Two different completion dates, same construction evidence | Keep match based on construction; show completion conflict separately |
| Completed/cancelled project or duplicate joint filing | Excluded from new candidate queue |
| Missing schedule | No confident `TIME` flag |

## 9. Interface specification

### Visual direction

An editorial command center with the map as the stage: midnight navy canvas, cyan for Utility A, violet for Utility B, and amber only for source-supported match regions or periods. Use high-contrast white text, clean sans-serif labels, and monospaced dates/numbers. The visual effect should come from synchronized evidence and restrained motion, not fictitious glowing power routes.

### Desktop layout, designed for a 1440 × 900 judge screen

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ GridLock Atlas | region / utilities | public-plan snapshot | legend      │
├──────────────────┬──────────────────────────────────────┬─────────────────┤
│ Opportunity Queue│                                      │ Evidence         │
│ Needs review     │              2.5D MAP                │ Inspector        │
│ Known coord.     │     supported geometry and halos     │ why flagged     │
│ Source conflicts │                                      │ source A / B    │
│ filters          │                                      │ action / brief  │
├──────────────────┴──────────────────────────────────────┴─────────────────┤
│  Utility A construction timeline  ══════════                           │
│  Utility B construction timeline       ═════════════  shared window     │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Top bar, ~56 px:** brand, utility/region selection, `Public planning data` label, snapshot date, source count derived from data, legend, reset view.
- **Left rail, ~300 px:** queue cards with both project names, utilities, `GEO` / `TIME` / `BOTH` badges, source quality, status, and filters. Include real empty states.
- **Map, flexible center:** use verified routes where available; otherwise named-facility pins or translucent approximate location halos. Hover/focus a project to highlight its row and timeline. Selection flies or pans to the source-supported area.
- **Bottom timeline, ~140 px:** two project construction bars and an overlap bracket. Exact dates get hard edges; estimated/year-only dates get soft edges and a tooltip explaining their range.
- **Right inspector, ~350 px overlay:** one-sentence match explanation, spatial/temporal precision, two short source excerpts side by side with page/section links, source-version conflict, known-coordination callout, and `Create review brief`.

### Map rendering truth rules

| Evidence type | Rendering |
| --- | --- |
| Official machine-readable route | Solid route stroke with source label |
| Line digitized from a public official map | Dashed stroke and `approximate` tag |
| Named facility with verified coordinate | Point marker |
| Named locality or county only | Translucent halo/polygon with coarse-location tag; no precise line |
| Relationship mentioned in filing but no route data | Visual link between project cards/pins labeled `shared site stated in source`; never drawn as a physical transmission route |

A brief map tilt may create depth, but `Flat map` returns to accurate overhead reading. The judge should be able to distinguish presentation from geospatial evidence.

For the featured Dairyland project, the official 2024 handout explicitly calls its map a general graphic of route options. The 2026 PSC decision identifies the authorized South Route. If the team traces that south option for the demo, label the result as a **schematic approximation based on the handout and current decision**; never label it official GIS or use the traced line to compute a precise distance. The shared switching-station claim, not this tracing, is the geographic match evidence.

### Primary interaction flow

1. User opens the comparison overview or selects `Guided demo`.
2. User clicks `Compare public plans` to run the deterministic comparison over the frozen snapshot. The app shows source count and snapshot date.
3. Queue fills with categorized pairs. Select Dairyland + Xcel from `Known coordination`; the status is visible immediately.
4. Map focuses on Blair/Tremval, projects highlight in cyan and violet, the shared planning window appears in amber, and the inspector explains `GEO` + `TIME` with citations.
5. Inspector opens the earlier Dairyland filing's interface-coordination statement, alongside the 2026 PSC decision approving a connection to the Western Wisconsin switching station. This explains the status already shown on the card; the UI does not claim crews or equipment are shared.
6. Click `Schedule sources` to see the Xcel/PSC completion-date difference side by side.
7. User exports a brief asking whether any additional resource coordination is warranted and noting existing coordination and the date conflict.

**Example review brief format** (generated from reviewed fields, not free-form model facts):

```text
Pair: Dairyland Alma–Blair × Xcel Western Wisconsin Transmission Connection
Why flagged: GEO — a documented connection near Blair/Tremval;
             TIME — both sources report construction in 2026–27.
Status: A shared connection is in the 2026 PSC decision, pp. 1 and 29–30;
        interface coordination appears in Dairyland's earlier CPCN application,
        PDF viewer pp. 24–25 (printed pp. 4–5). Resource sharing is not established.
Unresolved: Xcel and the Wisconsin PSC publish different completion dates;
            confirm current phase dates before discussing shared resources.
Review question: Are there any remaining construction-phase interfaces or
                 resource needs that the existing coordination has not covered?
Sources: direct URLs, document dates, excerpt/page anchors, snapshot date.
```

### Interaction and accessibility requirements

- All queue cards and evidence controls work with keyboard. Every map feature has a mirrored list item, visible focus, and textual summary. Escape closes inspector.
- Text contrast target at least 4.5:1; color is reinforced with badge text, line style, and labels.
- Motion lasts roughly 250–500 ms, with no endless radar sweep. Honor `prefers-reduced-motion` and offer a static view.
- On narrow screens, queue and inspector become bottom sheets and the timeline becomes a scrollable pair card. The desktop judging layout is the priority.
- States to build deliberately: loading, no candidates, `GEO`, `TIME`, `BOTH`, possible evidence, known coordination, conflicting sources, missing geometry, source unavailable.

## 10. Architecture and implementation

### Pragmatic stack

- **Front end:** Next.js + React + TypeScript, Tailwind CSS, and lightweight CSS/motion transitions.
- **Map:** [MapLibre GL JS GeoJSON sources/layers](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/); keep full provenance objects outside map feature properties because MapLibre does not preserve arbitrary complex GeoJSON properties through rendering.
- **Demo map fallback:** bundle lightweight local boundary/context geometry for the featured region, so the map remains legible if remote basemap tiles fail; attribute any third-party basemap used online.
- **Matching:** pure TypeScript module with fixture tests. Use Turf.js or well-tested geospatial functions for supported point/line distance calculations; do not add PostGIS merely for a tiny hackathon corpus.
- **Extraction job:** Python HTML/PDF text extraction plus Gemini structured output; write normalized JSON after human review. API key stays server-side.
- **Storage for hackathon:** versioned JSON snapshot committed with the project, plus cached excerpts and source manifest. If the corpus later grows, move normalized records and reviewer labels to Postgres/PostGIS without changing the UI contract.
- **Brief export:** client-side print/PDF or copy-to-clipboard from a deterministic template; include source links and snapshot date. AI may improve prose after the facts are assembled, but cannot add unsupported facts.

### Proposed repository layout

```text
gridlock-atlas/
  app/                    # pages and route handlers
  components/             # queue, map, timeline, evidence, brief
  lib/domain/             # types, provenance rules, statuses
  lib/matching/           # deterministic geo/time engine
  data/manifest.json      # official URLs and publisher metadata
  data/snapshot.json      # normalized, reviewed demo records
  data/sources/           # short cached excerpts + hashes, where permitted
  scripts/ingest/         # fetch, text extraction, Gemini, validation
  tests/                  # match fixtures and one UI smoke path
  paper/                  # research draft, labels, protocol
  README.md               # run, data, caveats, demo
```

### Minimal interfaces

- `GET /api/snapshot` → snapshot metadata, utilities, projects, source references.
- `GET /api/matches?utilityA=&utilityB=&region=&year=` → deterministic candidate pairs and evidence IDs. Filters may be optional; request should not silently hide `TIME` only candidates.
- `GET /api/matches/:id` → fully joined pair, reasons, precision, source claims, known-coordination status.
- `POST /api/review-label` → **P1 only**; local or authenticated reviewer-mode label and elapsed review time.
- `POST /api/ingest` → **P2 only**; arbitrary URL ingestion requires source verification and human approval before inclusion.

For the MVP, route handlers can read `snapshot.json`; no database or account system is necessary. The “Compare public plans” button should invoke the real matching module, not replay a hard-coded animation.

## 11. Build order and time box

The work can be split among a small team; one person can follow the same sequence.

| Block | Deliverable | Exit test |
| --- | --- | --- |
| 0–2 h | Freeze source manifest; manually verify featured pair and investigate the first `Needs review` lead | Every demo claim has a URL/page/section; coordination scope recorded; unresolved lead is vetted or honestly omitted |
| 2–5 h | Domain types, Gemini extraction job, validation, reviewed snapshot | Snapshot parses; missing fields stay null; one real Gemini extraction retained |
| 4–8 h | Deterministic matching engine and fixture tests | All required cases in §8 pass, especially OR rule and known-joint demotion |
| 6–12 h | Map, source-derived schematic trace, queue, timeline, inspector connected to same selected match | Selecting a card updates all views; trace is labeled approximate; source links open |
| 12–15 h | Brief export, conflict view, accessibility, responsive fallback | A cited brief exports; keyboard path works |
| 15–18 h | Visual polish and scripted three-minute demo | No invented route/savings/live status; demo under three minutes |
| Remaining time | P1 reviewer mode and one additional validated candidate; README, repo and submission | Fresh clone runs; source snapshot and limitations documented |

**Workstreams if there are 3–4 people:** (A) source curation/extraction, (B) matching/domain/tests, (C) map/timeline/visuals, (D) evidence inspector, brief, paper, and demo. Integrate against the shared types by the midpoint. If time slips, cut P1/P2 before cutting provenance or the actual comparison engine.

### Definition of done

- Two distinct utilities' **public future construction plans** appear with working source links.
- A real function compares their project records and returns separate `GEO`/`TIME` reasons under the challenge's OR rule.
- The Dairyland/Xcel pair is correctly shown as a match **and** as having documented interface coordination, while any shared labor/equipment remains unknown.
- The completion-date conflict is visible and does not corrupt the construction overlap.
- The map never claims unsupported route accuracy, and the timeline distinguishes coarse dates.
- A judge can move from a queue card to the exact public evidence and export a cited brief in under one minute.
- A clean install can launch the app and run the deterministic matching tests; the demo works without live third-party services.
- README names snapshot date, data sources, extraction/model version, known limitations, and demo steps.

## 12. Verification plan

Run only tests that verify real risks:

1. **Unit tests:** OR semantics, distinct-utility filter, duplicate joint-project suppression, construction vs completion date, coarse evidence, missing fields, known coordination, conflicting claims.
2. **Data audit script:** every displayed fact has at least one resolvable `Evidence` object; every evidence excerpt exists in cached source text; no featured field is model-only/unreviewed.
3. **UI smoke test:** open app, select the featured pair, verify map/timeline/inspector agree, open each source link, export brief, use keyboard focus, test reduced motion.
4. **Demo fallback:** disconnect network and run the same case from snapshot; no blank map or blocked AI request.

Do not spend the remaining hackathon time writing tests that simply restate styling or component implementation.

## 13. Three-minute judging story

| Time | Action | Point the judge should understand |
| --- | --- | --- |
| 0:00–0:20 | Show two separate public plans and the map/timeline | Utility plans are fragmented across sources. |
| 0:20–0:55 | Click `Compare public plans`; select Dairyland + Xcel | The software finds a source-backed geographic and construction-window match. |
| 0:55–1:35 | Open the evidence inspector | Exact passages, source links, and location/date precision explain the match. |
| 1:35–2:05 | Reveal the earlier interface-coordination statement and the 2026 approved connection | The system recognizes a known interface, not a newly discovered lack of coordination. |
| 2:05–2:35 | Reveal Xcel vs PSC completion-date claims | It preserves conflicting source versions instead of inventing certainty. |
| 2:35–3:00 | Export review brief; optionally show a separately validated review lead | The output is an actionable, cited question for planners. |

Suggested opening line: **“Two utility plans can describe the same work area in different documents. GridLock puts the geography, schedule, and original evidence on one screen.”**

Suggested closing line: **“The goal is a better conversation between planners. This tool tells them where to look and shows why.”**

## 14. Research paper plan

### Narrow research question and contribution

**Question:** In heterogeneous public transmission-planning documents, can provenance- and uncertainty-aware matching increase the number of *planner-review-worthy* cross-utility candidates found per reviewer minute compared with simple county/year or distance/date filters?

The contribution is the combination of field-level evidence, source versions, uncertainty, and known-coordination classification in public future-plan comparison. Do **not** claim that spatiotemporal utility coordination is new: earlier work such as [Tseng et al., *Automation in Construction* (2011)](https://www.sciencedirect.com/science/article/abs/pii/S0926580511000057) studied it. [FERC Order 1920](https://www.ferc.gov/explainer-transmission-planning-and-cost-allocation-final-rule) supplies planning context but addresses long-term regional planning and cost allocation; it does not require utilities to share crews or prove savings.

### Study design

- **Unit of analysis:** an unordered pair of distinct-utility future construction projects, after duplicate joint-project removal.
- **Frozen corpus:** public source documents with retrieval date/hash and a documented inclusion rule. Begin with case studies; expand to a multi-utility corpus from Minnesota's biennial report, MISO status records, utility pages, and state commission dockets.
- **Gold labels:** two blinded reviewers receive source packets without model ranking. Label `worth planner outreach/review`, `already coordinated`, `not useful`, or `insufficient evidence`; adjudicate disagreements. Seek actual utility planners for later validation.
- **Baselines:** (1) same county + same year; (2) exact route/point distance + construction interval when both are available; (3) optional text-only LLM ranking on the same corpus.
- **Metrics:** precision@5/@10; recall@K if the pool is exhaustively labeled; useful review leads with no documented resource plan per reviewer minute; extraction F1 by field; unsupported-claim/citation error rate; known-joint suppression rate; reviewer agreement.
- **Splits:** hold out by project and preferably utility pair or region. Never random-split project pairs because the same project text would leak into training and test.
- **Controls:** close projects in different years; same year but far apart; canceled/completed projects; alternative route versions; duplicate filings; known joint work. Freeze prompts/model and source snapshot before evaluation.
- **Analysis:** predefine matching thresholds, report all denominators and uncertainty bands, and use a project-clustered bootstrap for confidence intervals once the sample is large enough. Do not report statistical significance from a tiny hackathon pilot.

### Paper structure and honest claims

1. Abstract: problem, system, limited observed result.
2. Introduction and prior work: fragmented public plans; coordination literature; regional planning context.
3. Dataset and provenance: inclusion, source snapshot, extraction validation, annotator protocol.
4. Method: entity resolution, geometry/time precision, OR-rule matching, status classification.
5. Interface: map/timeline/evidence and planner review brief.
6. Evaluation: baselines, labels, metrics, case studies, errors and ablations.
7. Limitations and ethics: incomplete public plans, changed schedules, unpublished coordination, unavailable route GIS, no causal savings estimate.

**Hackathon paper deliverable:** a 3–5 page system/design paper with audited case studies and a tiny pilot labeled clearly as exploratory. **Later publication standard:** larger preregistered corpus, blinded planner review, held-out-region testing, and ablations of provenance, uncertainty, and known-coordination logic. Release source URLs, metadata, annotation protocol, and derived data only where sharing terms permit.

## 15. Risks and fallbacks

| Risk | Response |
| --- | --- |
| Public site or Gemini API fails during judging | Use the verified frozen snapshot; show retrieval and extraction timestamps. |
| No precise public route GIS | Use text-supported shared-site relation and approximate area rendering; no fake exact line or distance. |
| Source dates disagree | Show all claims with publisher/date and mark the affected field; keep matching on construction windows. |
| All compelling matches are already joint projects | Present them as positive controls and demonstrate correct demotion; expand corpus for a `Needs review` case only after source validation. |
| Time-only matches are too broad | Keep them visible to satisfy the sponsor's OR rule, but rank them low when geography makes resource sharing implausible. |
| Paper lacks enough labeled pairs | Write a system/case-study paper; reserve quantitative effectiveness claims for a larger blinded study. |

## 16. External sources used in this specification

- [Dairyland Alma–Blair project](https://dairylandpower.com/alma-blair-transmission-project), [2026 PSC final decision](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/1515-CE-103%20Final%20Decision.pdf), [general route-options map](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/Maps/DPC_Alma_Blair_MapHandout_04.08.2024.pdf), and [earlier CPCN application](https://dairylandpower.com/sites/default/files/PDFs/Power%20Delivery/Dairyland%20Alma-Blair%20CPCN%20Application_2024-07-01.pdf)
- [Xcel Western Wisconsin Transmission Connection](https://xcelenergytransmission.com/projects/western-wisconsin-transmission-connection/) and [Wisconsin PSC case](https://psc.wi.gov/Pages/CommissionActions/CasePages/WesternWisconsin.aspx)
- [Xcel/SPS Potter–Beckham](https://xcelenergytransmission.com/projects/potter-beckham-345-kv/) and [Transource Oklahoma Potter–Beckham](https://www.transourceenergyprojects.com/potter-beckham/)
- [Wisconsin PSC Grid Forward case](https://psc.wi.gov/Pages/CommissionActions/CasePages/GridForwardCentralWisconsin.aspx), [MISO BECI scope presentation](https://cdn.misoenergy.org/20250317%20Competitive%20Project%20RFP%20Item%2002%20Presentation685217.pdf), and [MISO BECI developer selection](https://cdn.misoenergy.org/BECI%20Selection%20Report734487.pdf)
- [Minnesota 2025 Biennial Transmission Projects Report](https://www.minnelectrans.com/report-2025.html) and [MISO MTEP](https://www.misoenergy.org/planning/transmission-planning/mtep)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [MapLibre GeoJSON source](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/), [NWS alerts API](https://www.weather.gov/documentation/services-web-alerts)
- [FERC Order 1920 explainer](https://www.ferc.gov/explainer-transmission-planning-and-cost-allocation-final-rule) and [Tseng et al. 2011](https://www.sciencedirect.com/science/article/abs/pii/S0926580511000057)
