import { notFound } from "next/navigation";
import { getStaffTest, listTestRoster } from "@/lib/tests/queries";
import TestBuilder from "./test-builder";
import TestResults from "./test-results";

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const test = await getStaffTest(id);
  if (!test) notFound();
  if (test.status === "draft") return <TestBuilder test={test} />;
  return <TestResults test={test} roster={await listTestRoster(test)} />;
}
