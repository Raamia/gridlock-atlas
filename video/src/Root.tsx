import { Composition } from "remotion";
import { Demo } from "./Demo";
import timeline from "./data/timeline.json";

export const Root: React.FC = () => (
  <Composition id="GridLockDemo" component={Demo} durationInFrames={timeline.total} fps={timeline.fps} width={1920} height={1080} />
);
