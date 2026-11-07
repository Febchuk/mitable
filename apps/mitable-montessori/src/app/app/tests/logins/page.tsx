import { listClassroomLogins, listClassroomsForTests } from "@/lib/tests/queries";
import LoginsClient from "./logins-client";

export default async function StudentLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ classroom?: string }>;
}) {
  const { classroom } = await searchParams;
  const classrooms = await listClassroomsForTests();
  const selected = classrooms.find((item) => item.id === classroom) ?? classrooms[0];
  const students = selected ? await listClassroomLogins(selected.id) : [];
  return (
    <LoginsClient classrooms={classrooms} classroomId={selected?.id ?? ""} students={students} />
  );
}
