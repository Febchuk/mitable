import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { adminAppHomePath } from "@/lib/feature-flags";
import ProgressClient from "./progress-client";

export default async function ProgressPage() {
  const ctx = await getCurrentUserContext();
  if (ctx?.role === "admin") redirect(adminAppHomePath());
  return <ProgressClient />;
}
