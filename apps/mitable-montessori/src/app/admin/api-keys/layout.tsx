import { redirect } from "next/navigation";
import { adminExternalApiEnabled } from "@/lib/feature-flags";

export default function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  if (!adminExternalApiEnabled()) {
    redirect("/admin/classrooms");
  }
  return children;
}
