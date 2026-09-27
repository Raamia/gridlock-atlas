/**
 * Atlas domain model.
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
   * manual: typed by a person from the source; model: a structured model-extraction run (scripts/ingest/extract.py);
   * agent-assisted: located by an AI research agent and verified verbatim by script.
   */
  extractionMethod: "manual" | "model" | "agent-assisted";
  reviewedByHuman: boolean;
  /** Excerpt was located verbatim (after normalization) in the cached source text. */
  verifiedInSource: boolean;
}

export interface DateBound {
  /** ISO date YYYY-MM-DD */
  earliest: string;
  latest: string;
  /** "half": a source's "Early/Late YYYY" (Jan–Jun / Jul–Dec). */
  precision: "day" | "month" | "quarter" | "half" | "year";
  /** The bound as the source words it ("Spring 2028"), shown instead of the precision-derived text; matching uses the dates. */
  label?: string;
}

export interface ConstructionWindow {
  id: string;
  claimSourceId: string;
  /** scheduled: a published schedule from implementation start to in-service (Georgia Power's Start Date "schedule for implementation",
   *  DESC's first evidenced spending) — never field-work dates; evaluated separately from construction windows. */
  phase: "preconstruction" | "general-construction" | "scheduled" | "unknown";
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
  /** Work began before the earliest year the source itemizes (DESC's 'Previous' column): the start year is not published,
   *  and start.earliest is only a floor for matching and the timeline axis, never a sourced date. */
  openStart?: boolean;
  /** Visible source credit when the bounds come from more than one document ("Georgia Power Ten-Year Plan start → SERTP 2025 in-service year"). */
  sourceLabel?: string;
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
  /** rowWidthFt: a right-of-way width the owner filed for this project (e.g. a siting application). */
  key: "voltageKv" | "lengthMiles" | "costUsd" | "rowWidthFt" | "other";
  label: string;
  value: string;
  evidenceIds: string[];
}

/** A preserved disagreement that is not a date (who owns the work, what it installs): every side keeps its excerpt. */
export interface Disagreement {
  field: "owner" | "scope";
  description: string;
  sides: { value: string; sourceIds: string[]; evidenceIds: string[] }[];
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
  disagreements?: Disagreement[];
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
  page?: number;
  /** "openai" or "gemini" (scripts/ingest/extract.py --provider) */
  provider?: string;
  /** the model version the provider reported, e.g. "gpt-5.5-2026-04-23" */
  model: string;
  promptVersion: string;
  runAt?: string;
  status: "completed" | "not-run" | "failed";
  /** located: the excerpt was re-found verbatim on the page; inSnapshot: it quotes a passage the snapshot already cites there */
  fields: { field: string; value: string; excerpt?: string; located: boolean; inSnapshot?: boolean; humanChecked: boolean }[];
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

/** A cited planning-context note (e.g. a newest-source check); context only, never coordination on a project. */
export interface ContextNote {
  id: string;
  region: string;
  title: string;
  text: string;
  evidenceIds: string[];
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
  contextNotes?: ContextNote[];
}

/* ------------------------------ Matching output ------------------------------ */

export type SignalLevel = "confirmed" | "possible" | "no-match" | "unknown";

export type ReviewStatus = "needs-review" | "known-coordination" | "possible";

export interface GeoDetail {
  method: "shared-site" | "shared-endpoint" | "measured" | "coarse" | "none";
  /** Current challenge metric: shortest distance between the projects' mapped work geometries. */
  closest?: {
    miles: number;
    lowMiles: number;
    highMiles: number;
    /** Nearest point on project A and project B, respectively. */
    a?: [number, number];
    b?: [number, number];
    basisA: "official-route" | "digitized-route" | "terminal-segment" | "work-sites";
    basisB: "official-route" | "digitized-route" | "terminal-segment" | "work-sites";
    /** True when the nearest point depends on a digitized or inferred line path. */
    approximate: boolean;
    lowConfidence: boolean;
    localityOnly: boolean;
    anyLocality: boolean;
    touching: boolean;
    tier: "touching-crossing" | "shared-land" | "site-logistics" | "crews-equipment" | "outside";
  };
  /** Legacy starter-workbook metric, retained only for benchmark/replay compatibility. */
  center?: {
    miles: number;
    lowMiles: number;
    highMiles: number;
    a: [number, number];
    b: [number, number];
    lowConfidence: boolean;
    /** A center rests only on town/road-level geocodes (at most a "possible" match, never a precise mileage claim). */
    localityOnly: boolean;
    /** Some point behind a center is town-level (locality). */
    anyLocality: boolean;
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
  /** construction: construction windows decide TIME; schedule: published schedules (start → in-service) overlap with certainty. */
  basis?: "construction" | "schedule";
  /** Published schedules (phase "scheduled"): the span both certainly cover, and whether it is long enough to confirm TIME. */
  schedule?: { windowIdsA: string[]; windowIdsB: string[]; overlap?: { start: string; end: string }; days: number; confirmed: boolean };
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
  /** Whether this disagreement feeds the construction-window match: always for window conflicts; for completion conflicts, when
   *  a disputed current date is also the end of an active window (see `endsWindow`: boundClaimIds is non-empty). The in-service
   *  gap (secondary signal) always uses the current date, whatever this says. */
  affectsMatch: boolean;
  /** Completion conflicts: one current side, the rest earlier editions (version history), not competing current claims. */
  versionOnly?: boolean;
  /** Completion conflicts: the disputed claim ids whose date ends an active window. */
  boundClaimIds?: string[];
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
  /** Legacy audit flag retained for older snapshots; shared facilities now have a zero-mile closest approach. */
  beyondRadius?: boolean;
  /** Projects whose planned in-service date has passed without a source confirming completion (kept, ranked lower, TIME at most possible). */
  pastDue?: PastDueProject[];
  evidenceIds: string[];
  engineVersion: string;
}

export interface ExcludedProject {
  projectId: string;
  reason: "complete" | "cancelled" | "duplicate" | "unknown-status" | "past-in-service";
  detail: string;
}

export interface PastDueProject {
  projectId: string;
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
  /** Kept in the queue with a flag: planned date passed, completion not confirmed. */
  pastDueProjects: PastDueProject[];
  /** Listed individually only for shared-owner pairs unless the caller asks for every exclusion. */
  excludedPairs: ExcludedPair[];
  excludedCounts: Record<ExcludedPair["reason"], number>;
}
