import { notFound } from "next/navigation";
import { getSubmissionForMarking } from "@/lib/tests/queries";
import MarkingClient from "./marking-client";

export default async function MarkingPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  const data = await getSubmissionForMarking(id, submissionId);
  if (!data) notFound();
  return <MarkingClient data={data} />;
}
