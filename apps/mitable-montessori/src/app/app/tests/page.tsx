import { listClassroomsForTests, listStaffTests } from "@/lib/tests/queries";
import TestsClient from "./tests-client";

export default async function TestsPage() {
  const [tests, classrooms] = await Promise.all([listStaffTests(), listClassroomsForTests()]);
  return <TestsClient tests={tests} classrooms={classrooms} />;
}
