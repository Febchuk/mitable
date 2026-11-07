import { notFound, redirect } from "next/navigation";
import { getCurrentStudent, getStudentTest } from "@/lib/tests/queries";
import TakeTest from "./take-test";

export default async function StudentTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await getCurrentStudent();
  if (!student) redirect(`/student/login?redirect=${encodeURIComponent(`/student/tests/${id}`)}`);
  const test = await getStudentTest(id, student.studentId);
  if (!test) notFound();
  if (test.submitted) redirect("/student");
  return <TakeTest test={test} />;
}
