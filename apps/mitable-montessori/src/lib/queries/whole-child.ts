import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveAxesCatalog } from "./axes";

export type AxisLevel = "Emerging" | "Practicing" | "Deepening" | "Leading";

export type AxisCatalogRow = {
  key: string;
  label: string;
  descriptors: Record<AxisLevel, string>;
  sortOrder: number;
};

/** Axis with the student's current assessment merged in (or null when never assessed). */
export type AxisWithAssessment = AxisCatalogRow & {
  level: AxisLevel | null;
  assessedAt: string | null;
};

export type WholeChildObservation = {
  id: string;
  axisKey: string;
  fromLevel: AxisLevel | null;
  toLevel: AxisLevel | null;
  note: string;
  authorName: string | null;
  createdAt: string;
};

type AssessmentDbRow = {
  axis_key: string;
  level: AxisLevel;
  assessed_at: string;
};

type ObservationDbRow = {
  id: string;
  axis_key: string;
  from_level: AxisLevel | null;
  to_level: AxisLevel | null;
  note: string;
  created_at: string;
  users: { first_name: string | null; last_name: string | null } | null;
};

/** Returns the 7-axis catalog merged with the student's currently active assessments. */
export async function listAxesWithAssessment(studentId: string): Promise<AxisWithAssessment[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [axes, assessmentsResp] = await Promise.all([
    getActiveAxesCatalog(),
    supabase
      .from("axis_assessments")
      .select("axis_key, level, assessed_at")
      .eq("student_id", studentId)
      .is("ended_at", null)
      .returns<AssessmentDbRow[]>(),
  ]);

  const assessments = assessmentsResp.data ?? [];
  const byAxis = new Map(assessments.map((a) => [a.axis_key, a]));

  return axes.map((a) => {
    const current = byAxis.get(a.key);
    return {
      key: a.key,
      label: a.label,
      descriptors: a.descriptors as Record<AxisLevel, string>,
      sortOrder: a.sort_order,
      level: current?.level ?? null,
      assessedAt: current?.assessed_at ?? null,
    };
  });
}

export async function listWholeChildObservations(
  studentId: string
): Promise<WholeChildObservation[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("whole_child_observations")
    .select(
      "id, axis_key, from_level, to_level, note, created_at, users:author_user_id(first_name, last_name)"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .returns<ObservationDbRow[]>();

  return (data ?? []).map((o) => {
    const author = o.users
      ? [o.users.first_name, o.users.last_name].filter(Boolean).join(" ") || null
      : null;
    return {
      id: o.id,
      axisKey: o.axis_key,
      fromLevel: o.from_level,
      toLevel: o.to_level,
      note: o.note,
      authorName: author,
      createdAt: o.created_at,
    };
  });
}
