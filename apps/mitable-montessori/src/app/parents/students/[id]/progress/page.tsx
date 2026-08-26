import { redirect } from "next/navigation";

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parents/progress?child=${id}`);
}
