import { redirect } from "next/navigation";

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parents/reports?child=${id}`);
}
