"use client";

/**
 * Method & audit: a large reading sheet whose contents open on "Proof at a glance" (what a judge needs in one screen),
 * then Sperry's six rows today, then the deep audit. `openMethod(section)` lands on a section: sections carry
 * `data-method-section={id}` (the store's MethodSection ids) and DocSheet jumps there whenever `methodNonce` changes.
 */

import { SNAPSHOT } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { ENGINE_VERSION } from "@/lib/matching/engine";
import { useAtlas, type MethodSection } from "@/lib/store";
import { DocSection } from "./bits";
import { DocSheet, type TocItem } from "./DocSheet";
import {
  ChallengeContext,
  CorpusChecks,
  Evaluation,
  Excluded,
  ExtractionRuns,
  LocationWorkflow,
  MatchingRules,
  OPEN_QUESTIONS,
  OpenQuestions,
  ProofAtAGlance,
  ReviewerMode,
  SponsorExports,
  SponsorRowsToday,
} from "./MethodSections";

const SECTIONS: { id: MethodSection; toc: string }[] = [
  { id: "proof", toc: "Proof at a glance" },
  { id: "sperry-rows", toc: "Sperry's six rows today" },
  { id: "rules", toc: "Matching rules" },
  { id: "exports", toc: "Exports" },
  { id: "location", toc: "Location workflow" },
  { id: "context", toc: "Context" },
  { id: "corpus", toc: "Corpus checks" },
  { id: "evaluation", toc: "Evaluation" },
  { id: "excluded", toc: "What the engine excluded" },
  { id: "reviewer", toc: "Reviewer mode" },
  { id: "ai", toc: "AI extraction" },
  { id: "questions", toc: "Open research questions" },
];

const META: Partial<Record<MethodSection, string | number>> = {
  "sperry-rows": 6,
  ai: SNAPSHOT.extractionRuns.length || undefined,
  questions: OPEN_QUESTIONS.length,
};
const TOC: TocItem[] = SECTIONS.map((s) => ({ id: s.id, label: s.toc, meta: META[s.id] }));

export function MethodAudit() {
  const open = useAtlas((s) => s.methodOpen);
  const set = useAtlas((s) => s.set);
  const section = useAtlas((s) => s.methodSection);
  const nonce = useAtlas((s) => s.methodNonce);
  const region = useAtlas((s) => s.region);
  const run = useAtlas((s) => s.run);
  const where = SNAPSHOT.regions.find((r) => r.id === region)?.label ?? "All regions";
  const n = (id: MethodSection) => SECTIONS.findIndex((s) => s.id === id) + 1;
  const attrs = (id: MethodSection) => ({ id, index: n(id), "data-method-section": id });

  return (
    <DocSheet
      open={open}
      onClose={() => set({ methodOpen: false })}
      eyebrow="How it works"
      title="Method & audit"
      meta={
        <>
          Live counts for {where} · {run ? `${run.thresholdMiles} mi run` : "before a comparison"} · {ENGINE_VERSION.replace("gridlock-engine/", "engine ")} · snapshot{" "}
          {formatDate(SNAPSHOT.snapshotDate)}
        </>
      }
      toc={TOC}
      tocLabel="Method sections"
      jump={open && section ? { id: section, nonce } : null}
      onJumped={() => useAtlas.setState({ methodSection: null })}
    >
      <DocSection {...attrs("proof")} title="Proof at a glance" lede="Sperry's own worked example, re-run by the engine that builds the queue — and how selective and how faithful it is.">
        <ProofAtAGlance />
      </DocSection>
      <DocSection {...attrs("sperry-rows")} title="Sperry's six rows today" lede="What became of each overlap row in the starter file, on today's plans. Starter projects are matched to plan records by title and in-service date; a project missing from the current list is “no longer listed,” never “completed.”">
        <SponsorRowsToday />
      </DocSection>
      <DocSection {...attrs("rules")} title="Matching rules" lede="Place first, then time, then status and an explainable rank. Deterministic: the same snapshot always gives the same queue.">
        <MatchingRules />
      </DocSection>
      <DocSection {...attrs("exports")} title="Sponsor-format exports">
        <SponsorExports />
      </DocSection>
      <DocSection {...attrs("location")} title="Location workflow" kicker="Sperry's guide, three steps">
        <LocationWorkflow />
      </DocSection>
      <DocSection {...attrs("context")} title="Context the challenge names">
        <ChallengeContext />
      </DocSection>
      <DocSection {...attrs("corpus")} title="Corpus checks" kicker="live">
        <CorpusChecks />
      </DocSection>
      <DocSection {...attrs("evaluation")} title="Evaluation" kicker="npm run eval">
        <Evaluation />
      </DocSection>
      <DocSection {...attrs("excluded")} title="What the engine excluded">
        <Excluded />
      </DocSection>
      <DocSection {...attrs("reviewer")} title="Reviewer mode" lede="Label pairs and check excerpts as you review; both stay in this browser until you export them.">
        <ReviewerMode />
      </DocSection>
      <DocSection {...attrs("ai")} title="AI extraction">
        <ExtractionRuns />
      </DocSection>
      <DocSection {...attrs("questions")} title="Open research questions">
        <OpenQuestions />
      </DocSection>
      <p className="num mt-2 border-t border-divider pt-5 text-caption text-fg-3">
        {ENGINE_VERSION} · snapshot {SNAPSHOT.version} · {formatDate(SNAPSHOT.snapshotDate)}
      </p>
    </DocSheet>
  );
}
