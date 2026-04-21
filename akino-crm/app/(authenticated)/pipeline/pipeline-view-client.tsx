"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import PipelineLoading from "./loading";
import type { PipelineView as PipelineViewType } from "./pipeline-view";

const PipelineView = dynamic(
  () => import("./pipeline-view").then((m) => ({ default: m.PipelineView })),
  { loading: () => <PipelineLoading />, ssr: false }
);

export default function PipelineViewClient(
  props: ComponentProps<typeof PipelineViewType>
) {
  return <PipelineView {...props} />;
}
