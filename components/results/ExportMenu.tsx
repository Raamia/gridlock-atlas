"use client";

import { ChevronDown, Download, FileText, FileJson, Table2, Tags } from "lucide-react";
import { useMemo } from "react";
import { IDX } from "@/lib/data";
import { regionExports } from "@/lib/export";
import { download, labelsCsv, useReview } from "@/lib/review";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, Menu, MenuItem, MenuSeparator } from "../ui";
import { fmt, regionLabel } from "./model";

/**
 * Export menu in the Opportunities header, post-run (SPEC §5.1): the sponsor's two tables, every flagged pair, the open
 * pair's brief, and the reviewer's labels / human-check log. Exports cover the whole region at the run's radius — list
 * filters are not applied, and the header says so. Item names differ from Method's "Download … (Sperry format)",
 * "Labels CSV" and "review-log.json" buttons, which stay where they are.
 */
export function ExportMenu({ size = "sm", labelled = false }: { size?: "sm" | "md"; labelled?: boolean }) {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const selected = useAtlas((s) => s.selectedMatchId);
  const set = useAtlas((s) => s.set);
  const labels = useReview((s) => s.labels);
  const checked = useReview((s) => s.checked);
  const files = useMemo(() => (run ? regionExports(run, region) : null), [run, region]);
  if (!run || !files) return null;

  const nLabels = Object.keys(labels).length;
  const nChecked = Object.keys(checked).length;
  const meta = (id: string) => {
    const [a, b] = id.split("__");
    return { project_a: IDX.project(a)?.title ?? a, project_b: IDX.project(b)?.title ?? b };
  };
  const scope = `${regionLabel(region)} · ${run.thresholdMiles} mi · whole region — list filters not applied`;

  return (
    <Menu
      align="end"
      minWidth={288}
      label="Export"
      header={<span className="block text-caption text-pretty text-fg-3">{scope}</span>}
      trigger={
        labelled ? (
          <Button variant="ghost" size={size} icon={<Download size={14} strokeWidth={1.75} />} iconRight={<ChevronDown size={12} strokeWidth={2} className="-ml-0.5 text-fg-3" />} className="px-2.5">
            Export
          </Button>
        ) : (
          <IconButton label="Export" size={size} tooltip="Export · Sperry tables, flagged pairs, brief, labels">
            <Download size={14} strokeWidth={1.75} />
          </IconButton>
        )
      }
    >
      <MenuItem
        aria-label="Sperry overlap table (CSV) — Export overlap table as CSV"
        icon={<Table2 />}
        hint={<span className="num">{fmt(files.overlaps.rows)} rows · under 25 mi, closest first</span>}
        onSelect={() => download(files.overlaps.name, files.overlaps.csv(), "text/csv")}
      >
        Sperry overlap table (CSV)
      </MenuItem>
      <MenuItem
        aria-label="Sperry project table (CSV) — Export project table as CSV"
        icon={<Table2 />}
        hint={<span className="num">{fmt(files.projects.rows)} projects · overlap_1…n</span>}
        onSelect={() => download(files.projects.name, files.projects.csv(), "text/csv")}
      >
        Sperry project table (CSV)
      </MenuItem>
      <MenuItem
        icon={<Table2 />}
        hint={<span className="num">{fmt(files.flagged.rows)} rows · with reasons</span>}
        onSelect={() => download(files.flagged.name, files.flagged.csv(), "text/csv")}
      >
        All flagged pairs (CSV)
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<FileText />} disabled={!selected} hint={selected ? "Markdown, print or PDF" : "Open a pair first"} onSelect={() => set({ briefOpen: true })}>
        Review brief (open pair)
      </MenuItem>
      <MenuItem
        icon={<Tags />}
        disabled={!nLabels}
        hint={nLabels ? "Saved in this browser" : "Label pairs in reviewer mode"}
        onSelect={() => download("gridlock-labels.csv", labelsCsv(labels, meta), "text/csv")}
      >
        Reviewer labels (CSV) · <span className="num">{nLabels}</span> labeled
      </MenuItem>
      <MenuItem
        icon={<FileJson />}
        disabled={!nChecked}
        hint={nChecked ? `${fmt(nChecked)} ${nChecked === 1 ? "excerpt" : "excerpts"} checked by you` : "Check excerpts in reviewer mode"}
        onSelect={() =>
          download("review-log.json", JSON.stringify({ reviewedEvidenceIds: Object.keys(checked).sort(), exportedAt: new Date().toISOString() }, null, 1), "application/json")
        }
      >
        Human-check log (JSON)
      </MenuItem>
    </Menu>
  );
}
