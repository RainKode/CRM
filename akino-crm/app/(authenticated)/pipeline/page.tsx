import { getStages, getDeals, getLossReasons } from "./actions";
import { PipelineView } from "./pipeline-view";

export default async function PipelinePage() {
  const [stages, deals, lossReasons] = await Promise.all([
    getStages(),
    getDeals(),
    getLossReasons(),
  ]);

  return (
    <PipelineView
      stages={stages}
      initialDeals={deals}
      lossReasons={lossReasons}
    />
  );
}
