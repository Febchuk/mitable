import { redirect } from "next/navigation";

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parents/attendance?child=${id}`);
}
