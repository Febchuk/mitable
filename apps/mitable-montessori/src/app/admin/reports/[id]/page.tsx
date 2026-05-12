import { redirect } from "next/navigation";

/** Full-page report UI — use the rail workspace instead. */
export default async function AdminReportDetailPageRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/reports?open=${encodeURIComponent(id)}`);
}
