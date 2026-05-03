import { notFound } from "next/navigation";
import { ChildDetail } from "@/components/montessori/child-detail";
import { findChild } from "@/components/montessori/data";

export default async function ChildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const child = findChild(id);
  if (!child) notFound();
  return <ChildDetail child={child} />;
}
