import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

export type ParentChild = {
  id: string;
  name: string;
  receivesReports: boolean;
};

export type ParentPortalContext = {
  firstName: string;
  email: string;
  onboardingComplete: boolean;
  children: ParentChild[];
};

/** Resolves the signed-in guardian and their active children for the parent portal. */
export const getParentPortalContext = cache(
  async function getParentPortalContext(): Promise<ParentPortalContext | null> {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data: guardian } = await supabase
      .from("guardians")
      .select("id, first_name, onboarding_completed_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!guardian) return null;

    const { data: links } = await supabase
      .from("student_guardians")
      .select("receives_reports, students(id, first_name, last_name, preferred_name, archived_at)")
      .eq("guardian_id", guardian.id);

    const children = (links ?? [])
      .map((row) => {
        const link = row as {
          receives_reports: boolean;
          students:
            | {
                id: string;
                first_name: string;
                last_name: string;
                preferred_name: string | null;
                archived_at: string | null;
              }
            | {
                id: string;
                first_name: string;
                last_name: string;
                preferred_name: string | null;
                archived_at: string | null;
              }[]
            | null;
        };
        const student = Array.isArray(link.students) ? link.students[0] : link.students;
        if (!student || student.archived_at) return null;
        return {
          id: student.id,
          name: student.preferred_name || `${student.first_name} ${student.last_name}`,
          receivesReports: link.receives_reports,
        };
      })
      .filter((child): child is ParentChild => child !== null);

    return {
      firstName: guardian.first_name,
      email: user.email,
      onboardingComplete: Boolean(guardian.onboarding_completed_at),
      children,
    };
  }
);

export function selectedParentChild(children: ParentChild[], childId: string | undefined) {
  if (childId) return children.find((child) => child.id === childId) ?? null;
  return children[0] ?? null;
}
