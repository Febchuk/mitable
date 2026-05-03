import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ChildDetail } from "@/components/montessori/child-detail";
import { createClient } from "@/utils/supabase/server";
import { getStudentProfile } from "@/lib/queries/student-profile";
import { listAxesWithAssessment, listWholeChildObservations } from "@/lib/queries/whole-child";

export default async function ChildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getStudentProfile(id);
  if (!profile) notFound();

  const [axes, observations] = await Promise.all([
    listAxesWithAssessment(id),
    listWholeChildObservations(id),
  ]);

  return <ChildDetail profile={profile} axes={axes} observations={observations} />;
}
