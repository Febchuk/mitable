import { redirect } from "next/navigation";

export default async function StudentHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parents/overview?child=${id}`);
}
