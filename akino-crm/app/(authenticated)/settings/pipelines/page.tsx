import { listTemplates } from "@/app/(authenticated)/pipeline/templates/actions";
import { PipelineTemplatesView } from "./pipeline-templates-view";

export const metadata = { title: "Pipeline Templates" };

export default async function PipelineTemplatesPage() {
  const templates = await listTemplates();
  return <PipelineTemplatesView initialTemplates={templates} />;
}
