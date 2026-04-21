import { getAnalytics, getPipelinesForAnalytics } from "./actions";
import { AnalyticsView } from "./analytics-view";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const pipelines = await getPipelinesForAnalytics();
  if (pipelines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-(--color-fg) mb-2">
            No pipelines yet
          </h1>
          <p className="text-sm text-(--color-fg-muted)">
            Create a pipeline first — analytics will light up as deals move
            through stages.
          </p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const selectedId = params.pipeline && pipelines.find((p) => p.id === params.pipeline)
    ? params.pipeline
    : pipelines[0].id;

  const summary = await getAnalytics(selectedId);
  return (
    <AnalyticsView
      pipelines={pipelines}
      summary={summary}
      selectedPipelineId={selectedId}
    />
  );
}
