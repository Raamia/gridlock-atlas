import type { Evidence, Match, Project, SourceDocument, Snapshot, Utility } from "@/lib/domain/types";

export function indexSnapshot(s: Snapshot) {
  const projects = new Map(s.projects.map((p) => [p.id, p]));
  const utilities = new Map(s.utilities.map((u) => [u.id, u]));
  const sources = new Map(s.sources.map((d) => [d.id, d]));
  return {
    project: (id: string) => projects.get(id) as Project,
    utility: (id: string) => utilities.get(id) as Utility | undefined,
    source: (id: string) => sources.get(id) as SourceDocument | undefined,
    evidence: (id: string) => s.evidence[id] as Evidence | undefined,
    evidenceList: (ids: string[]) => ids.map((id) => s.evidence[id]).filter(Boolean) as Evidence[],
    allEvidence: () => s.evidence,
    relations: (ids: string[]) => s.relations.filter((r) => ids.includes(r.id)),
    snapshotDate: s.snapshotDate,
  };
}

export type SnapshotIndex = ReturnType<typeof indexSnapshot>;

export function ownerNames(p: Project, idx: SnapshotIndex, short = false): string {
  return p.owners
    .map((o) => {
      const u = idx.utility(o.utilityId);
      return u ? (short ? u.shortName : u.name) : o.utilityId;
    })
    .join(" · ");
}

/** Deep link to the cited page of a PDF, or the page itself for HTML. */
export function evidenceHref(e: Evidence, src?: SourceDocument): string | undefined {
  if (!src) return undefined;
  // only direct PDF links take a #page anchor; a docket landing page (e.g. Georgia PSC) does not
  if (src.mimeType === "application/pdf" && e.page && /\.pdf($|[?#])/i.test(src.url)) return `${src.url}#page=${e.page}`;
  return src.url;
}

export function pageLabel(e: Evidence): string | undefined {
  if (!e.page) return e.section;
  if (e.printedPage && e.printedPage !== String(e.page)) return `PDF p. ${e.page} (printed ${e.printedPage})`;
  return `p. ${e.page}`;
}

export function matchSourceIds(m: Match, idx: SnapshotIndex): string[] {
  const ids = new Set<string>();
  for (const id of m.evidenceIds) {
    const e = idx.evidence(id);
    if (e) ids.add(e.sourceId);
  }
  return [...ids];
}
