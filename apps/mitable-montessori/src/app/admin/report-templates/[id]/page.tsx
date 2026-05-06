import { ReportTemplateEditor } from "../report-template-editor";

export default async function EditReportTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportTemplateEditor mode="edit" templateId={id} />;
}
