import { cookies } from "next/headers";
import { SenReportsFeature } from "@/components/montessori/sen";
import { createClient } from "@/utils/supabase/server";
export default async function SenPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const child = (await searchParams).child;
  const db = createClient(await cookies());
  const { data } = child
    ? await db
        .from("sen_report_group_members")
        .select("sen_report_group_id, sen_report_groups!inner(classroom_id, is_active)")
        .eq("student_id", child)
        .is("left_on", null)
        .eq("sen_report_groups.is_active", true)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const group = data?.sen_report_groups as unknown as { classroom_id: string } | null;
  return (
    <SenReportsFeature
      initialStudentId={child}
      initialClassroomId={group?.classroom_id}
      initialGroupId={data?.sen_report_group_id}
    />
  );
}
