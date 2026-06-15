import { redirect } from "next/navigation";
import { adminReportTemplatesEnabled } from "@/lib/feature-flags";

export default function AdminReportTemplatesLayout({ children }: { children: React.ReactNode }) {
  if (!adminReportTemplatesEnabled()) {
    redirect("/admin/classrooms");
  }
  return children;
}
