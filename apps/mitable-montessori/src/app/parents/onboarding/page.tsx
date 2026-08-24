import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ParentOnboardingForm } from "./parent-onboarding-form";

export default async function ParentOnboardingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: guardian } = await supabase
    .from("guardians")
    .select("first_name, onboarding_completed_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!guardian) redirect("/parents/login");
  if ((guardian as { onboarding_completed_at: string | null }).onboarding_completed_at) {
    redirect("/parents");
  }

  return <ParentOnboardingForm firstName={(guardian as { first_name: string }).first_name} />;
}
