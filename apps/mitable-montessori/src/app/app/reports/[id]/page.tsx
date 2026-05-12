import { redirect } from "next/navigation";

/** Full-page report UI — use the rail workspace instead. */
export default async function ReportDetailPageRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/reports?open=${encodeURIComponent(id)}`);
}
