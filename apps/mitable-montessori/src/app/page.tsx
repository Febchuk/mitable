import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUserContext } from "@/lib/app/active-classroom";

export default async function RootPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const ctx = await getCurrentUserContext();
    if (ctx?.role === "admin") {
      redirect("/admin/today");
    }
    redirect("/app/reports");
  }
  redirect("/login");
}
