import PERMITS from "@/data/permits/permit-search.json";

/**
 * State land-disturbance filings as a source of field-work dates (data/permits, `scripts/ingest/permit_search.py`).
 * A filing shows that land disturbance was permitted or requested; it is not a crew schedule, and no filing found is not
 * evidence that no work is planned. Nothing here enters the snapshot or the engine.
 */
export const SAVED = PERMITS;

/** What the saved check found for one project behind the top Savannah River leads. */
export interface LeadPermit {
  projectId: string;
  /** none = no filing for this project; related = filings nearby or for an adjacent record, not this project's own work; site = a filing at this project's site */
  verdict: "none" | "related" | "site";
  text: string;
}

export const LEAD_PERMITS: LeadPermit[] = [
  {
    projectId: "gpc-20065",
    verdict: "none",
    text: "No Georgia EPD filing since 2024. Earlier nearby work: “Georgia Pacific Substation” (NOI 12/18/2018, terminated 09/10/2020) and “Georgia Pacific Sawmill Transmission Line” (2019–2020).",
  },
  { projectId: "gpc-20989", verdict: "none", text: "No Georgia EPD filing. The “Rice Hope” results are subdivisions, storage and a lift station." },
  {
    projectId: "gpc-20785",
    verdict: "none",
    text: "No Georgia EPD filing since 2024. “GOSHEN - KRAFT 115kV” (submission 183238) carries 09/27/2017, the date many legacy records share, so it most likely dates an older permit, not this rebuild.",
  },
  { projectId: "sertp26-mcintosh-relays", verdict: "none", text: "No filing, and none expected: relay work inside a substation." },
  { projectId: "desc-6888", verdict: "none", text: "No SC DES boundary for the reactor or the Deerfield switching station. The “Deerfield” results are subdivisions, a turn lane and a sand mine." },
  {
    projectId: "desc-0139-m-n",
    verdict: "site",
    text: "“Okatie 230kV Substation” (boundary 2022-12-20) and “… Expansion” (2023-06-16), 20.5 acres, 0.2 km from our Okatie point. One date each, no end: site work was being permitted in 2022–2023.",
  },
  {
    projectId: "desc-06367-d-g",
    verdict: "related",
    text: "No boundary named for the line. “Sherwood Substation” (2026-02-10): Dominion says the second line ends there, but the SCRTP list carries it as a separate record (06367 A-C, H).",
  },
  {
    projectId: "desc-6367-d",
    verdict: "related",
    text: "No boundary named for the tap. “Sherwood Substation” (2026-02-10) lies 1.3 km from the map-read Riverport point; “Jasper-Riverport Transmission Line” (2025-02-28) names no owner.",
  },
];

/** Utility-like facility names, as in scripts/ingest/permit_search.py. */
const UTILITY = /\d\s?kv\b|\bT\/?L\b|\bGPC\b|georgia power|dominion|\bDESC\b|sce&g|substation|switching|transmission line|\btie\b/i;
const NOT_UTILITY = /water|sewer|force main|gas main|feeder main|transmission main|\bGFM\b|lift station|pump station|freight|\d-inch|\d-in\b/i;
export const looksLikeUtility = (name: string) => UTILITY.test(name) && !NOT_UTILITY.test(name);

export interface GeorgiaFiling {
  submissionId: string;
  facility: string;
  appType: string;
  submitted: string | null;
  county?: string;
}
export interface CarolinaBoundary {
  objectId: number;
  project: string;
  boundaryFiled: string | null;
  acres: number;
}
export interface LiveCheck {
  checkedAt: string;
  since: string;
  georgia: { searches: { county: string; results: number }[]; newFilings: GeorgiaFiling[] };
  southCarolina: { boundariesSince: number; newBoundaries: CarolinaBoundary[] };
}
