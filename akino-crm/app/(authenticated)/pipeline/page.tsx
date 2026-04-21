import { Suspense } from "react";
import { getStages, getDeals, getLossReasons, getPipelines } from "./actions";
import { listSavedViews } from "../saved-views/actions";
import { createClient } from "@/lib/supabase/server";
import PipelineViewClient from "./pipeline-view-client";

export default async function PipelinePage() {
  const [pipelines, stages, deals, lossReasons, savedViews, userRes] =
    await Promise.all([
      getPipelines(),
      getStages(),
      getDeals(),
      getLossReasons(),
      listSavedViews("pipeline", null),
      (await createClient()).auth.getUser(),
    ]);

  return (
    <Suspense>
      <PipelineViewClient
        pipelines={pipelines}
        stages={stages}
        initialDeals={deals}
        lossReasons={lossReasons}
        savedViews={savedViews}
        currentUserId={userRes.data.user?.id ?? null}
      />
    </Suspense>
  );
}
