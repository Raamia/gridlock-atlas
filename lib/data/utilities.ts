import type { Utility } from "@/lib/domain/types";

/** Canonical utility identities. Aliases and dockets map onto these ids during ingest. */
export const UTILITIES: Utility[] = [
  { id: "desc", name: "Dominion Energy South Carolina", shortName: "DESC", parent: "Dominion Energy", kind: "investor-owned" },
  { id: "gpc", name: "Georgia Power", shortName: "Georgia Power", parent: "Southern Company", kind: "investor-owned" },
  { id: "santee-cooper", name: "Santee Cooper", shortName: "Santee Cooper", kind: "municipal-agency" },
  { id: "gtc", name: "Georgia Transmission Corp.", shortName: "GTC", kind: "cooperative" },
  { id: "bhe-transmission", name: "BHE Midcontinent Transmission", shortName: "BHE", parent: "Berkshire Hathaway Energy", kind: "transmission-company" },
  { id: "dairyland", name: "Dairyland Power Cooperative", shortName: "Dairyland", kind: "cooperative" },
  { id: "xcel-nspw", name: "Northern States Power Co.–Wisconsin", shortName: "Xcel · NSPW", parent: "Xcel Energy", kind: "investor-owned" },
  { id: "xcel-nspm", name: "Northern States Power Co.–Minnesota", shortName: "Xcel · NSPM", parent: "Xcel Energy", kind: "investor-owned" },
  { id: "xcel-sps", name: "Southwestern Public Service Co.", shortName: "Xcel · SPS", parent: "Xcel Energy", kind: "investor-owned" },
  { id: "transource-ok", name: "Transource Oklahoma", shortName: "Transource OK", parent: "Transource Energy", kind: "transmission-company" },
  { id: "transource", name: "Transource Energy", shortName: "Transource", kind: "transmission-company" },
  { id: "transource-wi", name: "Transource Wisconsin", shortName: "Transource WI", parent: "Transource Energy", kind: "transmission-company" },
  { id: "atc", name: "American Transmission Co.", shortName: "ATC", kind: "transmission-company" },
  { id: "itc-midwest", name: "ITC Midwest", shortName: "ITC Midwest", parent: "ITC Holdings", kind: "transmission-company" },
  { id: "minnesota-power", name: "Minnesota Power", shortName: "Minnesota Power", parent: "ALLETE", kind: "investor-owned" },
  { id: "gre", name: "Great River Energy", shortName: "Great River", kind: "cooperative" },
  { id: "otter-tail", name: "Otter Tail Power Co.", shortName: "Otter Tail", kind: "investor-owned" },
  { id: "mres", name: "Missouri River Energy Services", shortName: "MRES", kind: "municipal-agency" },
  { id: "mdu", name: "Montana-Dakota Utilities", shortName: "MDU", kind: "investor-owned" },
  { id: "alliant-wpl", name: "Wisconsin Power and Light (Alliant)", shortName: "Alliant WPL", parent: "Alliant Energy", kind: "investor-owned" },
  { id: "wec", name: "WEC Energy Group", shortName: "WEC", kind: "investor-owned" },
  { id: "oge", name: "Oklahoma Gas & Electric", shortName: "OG&E", kind: "investor-owned" },
  { id: "mge", name: "Madison Gas and Electric", shortName: "MGE", kind: "investor-owned" },
  { id: "smmpa", name: "Southern Minnesota Municipal Power Agency", shortName: "SMMPA", kind: "municipal-agency" },
  { id: "wppi", name: "WPPI Energy", shortName: "WPPI", kind: "municipal-agency" },
  { id: "gridliance-heartland", name: "GridLiance Heartland", shortName: "GridLiance", kind: "transmission-company" },
  { id: "rpu", name: "Rochester Public Utilities", shortName: "RPU", kind: "municipal-agency" },
];

/** Researcher-coined ids that refer to a canonical utility above. */
export const UTILITY_ALIASES: Record<string, string> = {
  "smmpa-wisconsin": "smmpa",
  "wppi-energy": "wppi",
  "georgia-power": "gpc",
  dominion: "desc",
};
