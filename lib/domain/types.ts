/**
 * GridLock Atlas domain model.
 *
 * We store source *claims*, not one flattened truth: every displayed fact points at
 * evidence ids, and every evidence object is a short verbatim excerpt from a cached
 * public document with a page/section anchor (see plan.md §6).
 */

export type Precision =
  | "official-gis"
  | "official-map-digitized"
  | "named-facility"
  | "locality"
  | "county"
  | "unknown";

export type ProjectStatus =
  | "proposed"
  | "approved"
  | "construction"
  | "complete"
  | "cancelled"
  | "unknown";

export type CoordinationStatus =
  | "known-joint"
  | "reported-coordination"
  | "not-found-in-sources"
  | "unknown";

export type CoordinationScope =
  | "joint-ownership"
  | "joint-initiative"
  | "interconnection-design"
  | "shared-facility"
  | "resource-sharing"
  | "unknown";

export type SourceType = "utility" | "regulator" | "rto";

export interface Utility {
  id: string;
  name: string;
  shortName: string;
  /** Parent brand, e.g. "Xcel Energy" for NSP-Wisconsin. */
  parent?: string;
  kind: "cooperative" | "investor-owned" | "transmission-company" | "municipal-agency";
}

export interface SourceDocument {
  id: string;
  publisher: string;
  title: string;
  url: string;
  sourceType: SourceType;
  publishedAt?: string;
  updatedAt?: string;
  documentDateNote?: string;
  retrievedAt: string;
  sha256: string;
  mimeType: string;
  pageCount?: number;
  bytes?: number;
}

export interface Evidence {
  id: string;
  sourceId: string;
  /** 1-based PDF viewer page. */
  page?: number;
  /** Printed page label when it differs from the viewer page. */
  printedPage?: string;
  section?: string;
  exactExcerpt: string;
  /** What this excerpt supports, in plain words. */
  supports: string;
  /**
   * manual: typed by a person from the source; gemini: structured extraction run;
   * agent-assisted: located by an AI research agent and verified verbatim by script.
   */
  extractionMethod: "manual" | "gemini" | "agent-assisted";
  reviewedByHuman: boolean;
  /** Excerpt was located verbatim (after normalization) in the cached source text. */
  verifiedInSource: boolean;
}

export interface DateBound {
  /** ISO date YYYY-MM-DD */
  earliest: string;
  latest: string;
  precision: "day" | "month" | "quarter" | "year";
}

export interface ConstructionWindow {
  id: string;
  claimSourceId: string;
  phase: "preconstruction" | "general-construction" | "unknown";
  start: DateBound;
  end: DateBound;
  /** Source implies one continuous phase between start and end. */
  continuous: boolean;
  evidenceIds: string[];
  note?: string;
  /** Claim id that explicitly supersedes this one (kept for history, not matched). */
  supersededBy?: string;
  /** Only a start milestone is published ("construction begins Fall 2027"); the end is unknown. */
  openEnded?: boolean;
  /** The source bounds the work (e.g. start date → need/in-service date) without dating the field work inside it. */
  boundsOnly?: boolean;
}

export interface CompletionClaim {
  id: string;
  claimSourceId: string;
  label: string;
  date: DateBound;
  evidenceIds: string[];
  /** false for a claim from an earlier edition of the same plan (kept as version history). */
  current?: boolean;
}

export interface CoordinationClaim {
  /** Counterpart project id. */
  partnerProjectId: string;
  status: CoordinationStatus;
  scope: CoordinationScope;
  description: string;
  evidenceIds: string[];
}

export interface Place {
  id: string;
  /** Short map label. */
  label: string;
  /** Full description as recorded from the source, when longer than the label. */
  detail?: string;
  kind:
    | "substation"
    | "switching-station"
    | "locality"
    | "county"
    | "route-endpoint"
    | "river-crossing"
    | "state-line"
    | "other";
  precision: Precision;
  lat: number;
  lon: number;
  uncertaintyMeters: number;
  coordinateSource: string;
  evidenceIds: string[];
  /** endpoint = a named terminal used for the project center (sponsor method: midpoint of the two sub-points). */
  role?: "endpoint" | "site" | "context";
  /** Geocode confidence after checking the match against the plan text. */
  confidence?: "confirmed" | "lower-confidence";
}

export interface Route {
  precision: "official-gis" | "official-map-digitized";
  description: string;
  /** [lon, lat] pairs, ordered. */
  coordinates: [number, number][];
  waypointNames: string[];
  evidenceIds: string[];
  caveat: string;
}

export interface ProjectFact {
  key: "voltageKv" | "lengthMiles" | "costUsd" | "other";
  label: string;
  value: string;
  evidenceIds: string[];
}

export interface Project {
  id: string;
  title: string;
  shortTitle: string;
  titleEvidenceIds: string[];
  parentInitiative?: string;
  docketId?: string;
  summary: string;
  owners: { utilityId: string; evidenceIds: string[] }[];
  /** value drives eligibility; label is the status exactly as the source words it ("In Progress"). */
  status: { value: ProjectStatus; label?: string; asOf?: string; evidenceIds: string[] };
  states: string[];
  counties: { name: string; state: string; evidenceIds: string[] }[];
  facts: ProjectFact[];
  places: Place[];
  route?: Route;
  constructionWindows: ConstructionWindow[];
  completionClaims: CompletionClaim[];
  knownCoordination: CoordinationClaim[];
  caveats: string[];
  sourceIds: string[];
  /** Set when this record is a repeated mention of another work package. */
  duplicateOf?: string;
  /** Short region key used by filters and camera presets. */
  region: string;
}

export interface Relation {
  id: string;
  projectA: string;
  projectB: string;
  kind: "shared-site" | "interconnects" | "same-initiative" | "duplicate-mention" | "other";
  siteLabel?: string;
  siteDetail?: string;
  /** stated: one source says it directly; inferred: follows from several sources (e.g. an ownership split). */
  basis?: "stated" | "inferred";
  /** Approximate coordinate of the stated shared site, if one of the projects has it as a place. */
  sitePlaceId?: string;
  description: string;
  evidenceIds: string[];
}

export interface ExtractionRun {
  id: string;
  sourceId: string;
  model: string;
  promptVersion: string;
  runAt?: string;
  status: "completed" | "not-run" | "failed";
  fields: { field: string; value: string; located: boolean; humanChecked: boolean }[];
  note?: string;
}

export interface Region {
  id: string;
  label: string;
  bbox: [number, number, number, number];
}

/** A sourced number used by the illustrative impact calculator. */
export interface ImpactAssumption {
  key: string;
  label: string;
  low?: number;
  typical: number;
  high?: number;
  unit: string;
  evidenceIds: string[];
  note: string;
}

export interface Snapshot {
  version: string;
  snapshotDate: string;
  generatedAt: string;
  regions: Region[];
  utilities: Utility[];
  sources: SourceDocument[];
  evidence: Record<string, Evidence>;
  projects: Project[];
  relations: Relation[];
  extractionRuns: ExtractionRun[];
  assumptions: ImpactAssumption[];
  unresolved: { cluster: string; note: string }[];
}

/* ------------------------------ Matching output ------------------------------ */

export type SignalLevel = "confirmed" | "possible" | "no-match" | "unknown";

export type ReviewStatus = "needs-review" | "known-coordination" | "possible";

export interface GeoDetail {
  method: "shared-site" | "shared-endpoint" | "measured" | "coarse" | "none";
  /** Sponsor metric: haversine distance between project center points. */
  center?: {
    miles: number;
    lowMiles: number;
    highMiles: number;
    a: [number, number];
    b: [number, number];
    lowConfidence: boolean;
  };
  sharedEndpoint?: { labelA: string; labelB: string; milesApart: number };
  thresholdMiles: number;
  relationIds: string[];

}

export interface TimeDetail {
  combinations: number;
  confirmedCombinations: number;
  possibleCombinations: number;
  windowIdsA: string[];
  windowIdsB: string[];
  /** Envelope where overlap is possible under at least one combination. */
  possibleOverlap?: { start: string; end: string };
  /** Span every combination agrees on (only when confirmed). */
  confirmedOverlap?: { start: string; end: string };
  precision: DateBound["precision"];
  continuityCaveat: boolean;
  /** Sponsor's secondary signal: days between the two current in-service / need dates. */
  inService?: { a: string; b: string; gapDays: number; labelA: string; labelB: string; boundA: DateBound; boundB: DateBound; coarse: boolean };
}

export interface ConflictSide {
  /** The date or window this group of sources agrees on, formatted at source precision. */
  value: string;
  sourceIds: string[];
  claimIds: string[];
  /** Earlier plan edition (version history) rather than a competing current claim. */
  earlier?: boolean;
}

export interface Conflict {
  id: string;
  projectId: string;
  field: "completion" | "constructionWindow";
  description: string;
  sides: ConflictSide[];
  claimIds: string[];
  /** Whether this disagreement changes the construction-window match. */
  affectsMatch: boolean;
}

export interface MatchCoordination {
  status: CoordinationStatus;
  scope: CoordinationScope;
  description: string;
  evidenceIds: string[];
  fromProjectId: string;
}

export interface Match {
  id: string;
  projectAId: string;
  projectBId: string;
  geo: SignalLevel;
  time: SignalLevel;
  geoReason: string;
  timeReason: string;
  geoDetail: GeoDetail;
  timeDetail: TimeDetail;
  /** Headline badge; only confirmed signals combine into BOTH. */
  badge: "BOTH" | "GEO" | "TIME" | "POSSIBLE";
  reviewStatus: ReviewStatus;
  coordination: MatchCoordination[];
  conflicts: Conflict[];
  relevance: "high" | "medium" | "low";
  priority: number;
  priorityReasons: string[];
  evidenceIds: string[];
  engineVersion: string;
}

export interface ExcludedProject {
  projectId: string;
  reason: "complete" | "cancelled" | "duplicate" | "unknown-status";
  detail: string;
}

export interface ExcludedPair {
  projectAId: string;
  projectBId: string;
  reason: "shared-owner" | "no-signal" | "beyond-radius" | "different-region" | "location-unknown";
  detail: string;
}

export interface MatchRun {
  engineVersion: string;
  snapshotVersion: string;
  snapshotDate: string;
  thresholdMiles: number;
  ranAt: string;
  projectsConsidered: number;
  pairsEvaluated: number;
  matches: Match[];
  excludedProjects: ExcludedProject[];
  /** Listed individually only for shared-owner pairs unless the caller asks for every exclusion. */
  excludedPairs: ExcludedPair[];
  excludedCounts: Record<ExcludedPair["reason"], number>;
}
