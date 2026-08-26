import { notFound, redirect } from "next/navigation";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { ParentOverview, type ParentActivity } from "@/components/parents/parent-overview";
import { listAxesWithAssessment, listWholeChildObservations } from "@/lib/queries/whole-child";
import type { StudentProfile } from "@/lib/queries/student-profile";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { listParentMedia } from "@/lib/media/parent-media";

type ParentProgressHistoryRow = {
  id: string;
  new_status: string;
  comment: string | null;
  changed_at: string;
  source_command_id: string | null;
  curriculum_subtopics: {
    name: string;
    curriculum_topics: { name: string } | null;
  } | null;
};

function progressStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function ParentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const portal = await getParentPortalContext();
  if (!portal) redirect("/parents/login");
  if (!portal.onboardingComplete) redirect("/parents/onboarding");
  const child = selectedParentChild(portal.children, (await searchParams).child);
  if (!child) notFound();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const [studentResp, axes, observations, curriculumResp, reportsResp, progressResp, media] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name, preferred_name, birth_date, sex, notes")
        .eq("id", child.id)
        .maybeSingle(),
      listAxesWithAssessment(child.id),
      listWholeChildObservations(child.id),
      supabase
        .from("curriculum_events")
        .select("id, comment, created_at")
        .eq("student_id", child.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reports")
        .select("id, title, report_type, sent_at")
        .eq("student_id", child.id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(50),
      supabase
        .from("student_progress_history")
        .select(
          "id, new_status, comment, changed_at, source_command_id, " +
            "curriculum_subtopics(name, curriculum_topics(name))"
        )
        .eq("student_id", child.id)
        .order("changed_at", { ascending: false })
        .limit(50)
        .returns<ParentProgressHistoryRow[]>(),
      listParentMedia(child.id),
    ]);
  const student = studentResp.data;
  if (!student) notFound();

  const profile: StudentProfile = {
    id: student.id,
    fullName: `${student.first_name} ${student.last_name}`.trim(),
    preferredName: student.preferred_name,
    birthDate: student.birth_date,
    sex: student.sex,
    notes: student.notes,
    classroom: null,
    enrollmentStartDate: null,
    primaryTeacher: null,
    guardians: [],
  };
  const mediaByProgressCommand = new Map<string, typeof media>();
  for (const item of media) {
    if (!item.progressCommandId) continue;
    const attachments = mediaByProgressCommand.get(item.progressCommandId) ?? [];
    attachments.push(item);
    mediaByProgressCommand.set(item.progressCommandId, attachments);
  }

  const activity: ParentActivity[] = [
    ...observations.map((entry) => ({
      id: entry.id,
      kind: "whole-child" as const,
      title: "Whole-child observation",
      detail: entry.note,
      createdAt: entry.createdAt,
    })),
    ...(curriculumResp.data ?? []).map((entry) => ({
      id: entry.id,
      kind: "learning" as const,
      title: "Learning update",
      detail: entry.comment,
      createdAt: entry.created_at,
    })),
    ...(reportsResp.data ?? []).map((entry) => ({
      id: entry.id,
      kind: "report" as const,
      title: entry.title || `${entry.report_type} report`,
      detail: "A report was shared with your family.",
      createdAt: entry.sent_at || "",
    })),
    ...(progressResp.data ?? []).map((entry) => ({
      id: entry.id,
      kind: "progress" as const,
      title: `Progress · ${entry.curriculum_subtopics?.curriculum_topics?.name ?? "Learning"}`,
      detail: `Marked ${entry.curriculum_subtopics?.name ?? "an activity"}`,
      note: entry.comment,
      status: progressStatusLabel(entry.new_status),
      media: entry.source_command_id
        ? (mediaByProgressCommand.get(entry.source_command_id) ?? [])
        : [],
      createdAt: entry.changed_at,
    })),
    ...media
      .filter((item) => !item.progressCommandId)
      .map((item) => ({
        id: item.id,
        kind: "moment" as const,
        title: "Classroom moment",
        detail: item.caption || null,
        media: [item],
        createdAt: item.sharedAt,
      })),
  ]
    .filter((entry) => entry.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <ParentOverview profile={profile} axes={axes} observations={observations} activity={activity} />
  );
}
