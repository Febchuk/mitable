import { notFound } from "next/navigation";
import { getElementaryGradesPageData } from "@/lib/queries/elementary-grades";
import GradesClient from "./grades-client";

export default async function GradesPage() {
  const data = await getElementaryGradesPageData();
  if (!data) notFound();
  return <GradesClient initialData={data} />;
}
