"use client";

import { ArrowRight, FileSearch, FilterX } from "lucide-react";
import type { ReviewStatus } from "@/lib/domain/types";
import { pluralize } from "@/lib/format";
import { Button, EmptyState } from "../ui";

/** Exact titles (tests + honesty contract P7). The filtered-out variant never calls itself an honest result. */
const COPY: Record<ReviewStatus, { title: string; body: string }> = {
  "needs-review": {
    title: "No open review leads",
    body: "Every flagged pair either has documented coordination or only coarse evidence. That is an honest result, not an error.",
  },
  "known-coordination": { title: "No documented coordination", body: "No flagged pair has joint work or interface coordination on record." },
  possible: { title: "Nothing only-possible", body: "Every candidate has at least one confirmed signal." },
};

export function EmptyTab({
  tab,
  hidden,
  onClear,
  elsewhere,
  onShowElsewhere,
}: {
  tab: ReviewStatus;
  /** Pairs of this tab that the list filters hide. */
  hidden: number;
  onClear: () => void;
  /** Known-0 only: "8 documented interfaces are in Upper Midwest and Southern Plains". */
  elsewhere?: string | null;
  onShowElsewhere?: () => void;
}) {
  const copy = COPY[tab];
  if (hidden > 0)
    return (
      <EmptyState
        icon={<FilterX />}
        title={copy.title}
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      >
        No pairs match the current filters — {pluralize(hidden, "pair")} in this tab {hidden === 1 ? "is" : "are"} hidden.
      </EmptyState>
    );
  return (
    <EmptyState
      icon={<FileSearch />}
      title={copy.title}
      action={
        elsewhere && onShowElsewhere ? (
          <div className="flex flex-col items-center gap-2">
            <p className="max-w-[34ch] text-caption text-pretty text-fg-2">{elsewhere}</p>
            <Button variant="secondary" size="sm" iconRight={<ArrowRight size={14} strokeWidth={1.75} />} onClick={onShowElsewhere}>
              Show them
            </Button>
          </div>
        ) : undefined
      }
    >
      {copy.body}
    </EmptyState>
  );
}
