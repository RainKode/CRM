import { Suspense } from "react";
import { getStages, getDeals, getLossReasons, getPipelines } from "./actions";
import { PipelineView } from "./pipeline-view";

export default async function PipelinePage() {
  const [pipelines, stages, deals, lossReasons] = await Promise.all([
    getPipelines(),
    getStages(),
    getDeals(),
    getLossReasons(),
  ]);

  return (
    <Suspense>
      <PipelineView
        pipelines={pipelines}
        stages={stages}
        initialDeals={deals}
        lossReasons={lossReasons}
      />
    </Suspense>
  );
}
