import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import EVAL from "@/data/eval/eval.json";
import XEVAL from "@/data/eval/extraction-eval.json";
import { CACHE, locate, ROOT } from "@/scripts/source-cache";
import { normalize } from "@/scripts/textnorm";

const DOCS = ["README.md", "docs/paper.md", "docs/devpost.md", "docs/pitch.md", "docs/judge-qa.md"] as const;
type Doc = (typeof DOCS)[number];
const text = Object.fromEntries(DOCS.map((d) => [d, fs.readFileSync(path.join(ROOT, d), "utf8")])) as Record<Doc, string>;
const n = (v: number) => v.toLocaleString("en-US");
const baseline = (id: string) => EVAL.baselines.find((b) => b.id === id)!;

describe("write-ups quote the committed evaluation", () => {
  const headline = [
    n(EVAL.queue.universePairs),
    String(EVAL.queue.flagged.k),
    String(baseline("B2").flagged),
    n(baseline("B3").flagged),
    n(XEVAL.verbatimQuote.all.k),
    n(XEVAL.verbatimQuote.all.n),
    String(XEVAL.pagesScored),
  ];
  it.each(DOCS)("%s states the current headline numbers", (d) => {
    for (const v of headline) expect(text[d], `${d} should state ${v}`).toContain(v);
  });

  it("the paper and README carry the detailed evaluation", () => {
    const b4 = EVAL.interfaces.recall.B4.all;
    for (const d of ["README.md", "docs/paper.md"] as const) {
      expect(text[d]).toContain(n(EVAL.queue.descGpcPairs));
      expect(text[d]).toContain(`${n(XEVAL.overall.exact.k)}`);
      expect(text[d]).toContain(`${(XEVAL.overall.exact.rate * 100).toFixed(1)}%`);
      expect(text[d]).toMatch(new RegExp(`${b4.hit} \\(physical links ${EVAL.interfaces.recall.B4.physical.hit}/9\\)|${b4.hit}/${b4.of}`));
    }
    expect(text["docs/paper.md"]).toContain(EVAL.meta.snapshot);
    expect(text["docs/pitch.md"]).toContain(EVAL.meta.snapshot);
    for (const s of EVAL.sweep) expect(text["docs/paper.md"]).toContain(`| ${n(s.flagged)} `);
    for (const a of EVAL.ablations) expect(text["docs/paper.md"]).toContain(`| ${a.id} `);
  });

  it("no write-up keeps a superseded count", () => {
    // engine 1.1 / snapshot 552257b2 figures: 4,705 pairs, 3,183 OR-flags, 4,606 DESC × GPC pairs, 1,688 excerpts
    for (const d of DOCS) for (const stale of ["4,705", "3,183", "4,606", "1,688", "552257b2"]) expect(text[d], `${d}: ${stale}`).not.toContain(stale);
  });
});

/** Excerpts the write-ups quote, with the page they cite. */
const QUOTES: { docs: Doc[]; sourceId: string; page: number | null; excerpt: string }[] = [
  { docs: ["docs/paper.md"], sourceId: "ferc-order-1920-fr", page: 1, excerpt: "This final order is effective August 12, 2024." },
  { docs: ["docs/paper.md", "docs/devpost.md"], sourceId: "ferc-order-1920-fr", page: 117, excerpt: "(1) avoided or deferred reliability transmission facilities and aging infrastructure replacement" },
  { docs: ["docs/paper.md", "docs/devpost.md"], sourceId: "ferc-order-1920-fr", page: 117, excerpt: "(5) reduced congestion due to transmission outages" },
  {
    docs: ["docs/paper.md"],
    sourceId: "ferc-order-1920-fr",
    page: 258,
    excerpt: "must include in its in-kind replacement estimates the transmission facilities operating at and above 200 kV, or at and above a lower proposed threshold, that it owns and anticipates replacing",
  },
  {
    docs: ["docs/paper.md"],
    sourceId: "scrtp-home",
    page: null,
    excerpt:
      "are planning to join the Southeastern Regional Transmission Planning (SERTP) process region, to become effective as of the effective date of Dominion Energy South Carolina's Order 1920 compliance filing.",
  },
  { docs: ["README.md", "docs/judge-qa.md"], sourceId: "scrtp-home", page: null, excerpt: "are planning to join" },
  { docs: ["README.md", "docs/paper.md"], sourceId: "sertp-2026-prelim-plan", page: 17, excerpt: "SUMTER - DESC EASTOVER" },
  { docs: ["docs/paper.md"], sourceId: "sertp-2026-q3-presentation", page: 43, excerpt: "SERTP has now held interregional data exchange meetings with the following neighbors: – SCRTP and FRCC" },
  { docs: ["docs/paper.md"], sourceId: "sertp-2025-plan", page: 3, excerpt: "as it does not include Critical Energy Infrastructure Information (CEII) materials" },
  { docs: ["docs/paper.md"], sourceId: "gpc-irp-2025-vol3", page: 314, excerpt: "Estimated Cost – GPC REDACTED" },
  { docs: ["docs/paper.md", "docs/judge-qa.md"], sourceId: "gpc-irp-2025-vol3", page: 174, excerpt: "schedule for implementation (start date)" },
  { docs: ["docs/paper.md"], sourceId: "desc-scrtp-2026-2030", page: 41, excerpt: "Okatie – McIntosh 115kV Tie: Add Series Reactor" },
  { docs: ["docs/paper.md", "docs/judge-qa.md"], sourceId: "desc-scrtp-2026-2030", page: 41, excerpt: "12/31/2028" },
  { docs: ["docs/paper.md", "docs/judge-qa.md"], sourceId: "gpc-irp-2025-vol3", page: 314, excerpt: "Goshen (Savannah) - Georgia Pacific (Rincon) section, approximately 6.7 miles" },
  { docs: ["docs/paper.md"], sourceId: "gpc-irp-2025-vol3", page: 314, excerpt: "Need Date 06/01/2027" },
  { docs: ["docs/paper.md", "docs/judge-qa.md"], sourceId: "desc-scrtp-2024-2028", page: 23, excerpt: "12/31/25" },
  { docs: ["docs/paper.md"], sourceId: "desc-scrtp-2025-2029", page: 18, excerpt: "5/31/2026" },
  { docs: ["docs/paper.md", "docs/judge-qa.md"], sourceId: "desc-scrtp-2026-2030", page: 12, excerpt: "12/01/2026" },
  { docs: ["docs/paper.md"], sourceId: "scpsc-2023-115-e-letter-2025-03", page: 2, excerpt: "DESC now estimates the commercial operation date for the facilities to be December 1, 2026." },
  {
    docs: ["docs/paper.md", "README.md"],
    sourceId: "scpsc-2023-115-e-letter-2025-03",
    page: 2,
    excerpt: "from approximately $54 million to approximately $98 million",
  },
  { docs: ["docs/paper.md"], sourceId: "psc-1515-ce-103-final", page: 13, excerpt: "to the new 345 kV Tremval Nouth Substation that was approved in docket 5-CE-158" },
  { docs: ["docs/paper.md"], sourceId: "psc-grid-forward-final", page: 19, excerpt: "both individually and in conjunction with" },
  { docs: ["docs/paper.md"], sourceId: "ctpc-2025-plan", page: 154, excerpt: "W220124 – Newberry 115 kV Line (Bush River-DESC), Upgrade" },
  { docs: ["docs/paper.md"], sourceId: "desc-scrtp-2026-2030", page: 15, excerpt: "Rebuild the existing Saluda Hydro – Bush River #1 and #2 Tie Lines to SPDC 1272." },
  { docs: ["docs/paper.md"], sourceId: "scpsc-vcs1-killian-order-2011", page: 52, excerpt: "at the same time will avoid the need to mobilize construction crews twice" },
  { docs: ["docs/paper.md"], sourceId: "nerc-iro-017-1", page: 2, excerpt: "coordinate the resolution of identified outage conflicts" },
];

describe("quoted excerpts", () => {
  it.each(QUOTES.flatMap((q) => q.docs.map((d) => [d, q.excerpt] as const)))("%s quotes “%s”", (d, excerpt) => {
    expect(normalize(text[d])).toContain(normalize(excerpt));
  });

  it.skipIf(!fs.existsSync(path.join(CACHE, "text")))("each is found verbatim on its cited page", () => {
    for (const q of QUOTES) {
      const r = locate(q.sourceId, q.excerpt);
      if (r.status === "no-cache") continue;
      expect(r.status, `${q.sourceId}: ${q.excerpt}`).toBe("found");
      if (r.status === "found") expect(r.pages, `${q.sourceId} p. ${q.page}: ${q.excerpt}`).toContain(q.page);
    }
  });
});
