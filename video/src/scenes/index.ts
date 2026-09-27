import { Brief } from "./Brief";
import { Closeup } from "./Closeup";
import { Cold } from "./Cold";
import { Compare } from "./Compare";
import { Grid } from "./Grid";
import { Honest } from "./Honest";
import { Impact } from "./Impact";
import { Outro } from "./Outro";
import { Ovl3 } from "./Ovl3";
import { Pipeline } from "./Pipeline";
import { Problem } from "./Problem";
import { Proof } from "./Proof";
import { Title } from "./Title";
import { TopLead } from "./TopLead";

export const SCENES: Record<string, React.FC> = {
  cold: Cold,
  problem: Problem,
  title: Title,
  pipeline: Pipeline,
  grid: Grid,
  compare: Compare,
  toplead: TopLead,
  ovl3: Ovl3,
  closeup: Closeup,
  honest: Honest,
  brief: Brief,
  impact: Impact,
  proof: Proof,
  outro: Outro,
};
