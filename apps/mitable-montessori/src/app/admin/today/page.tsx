import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { getAdminTodayData } from "@/lib/queries/admin-today";
import AdminTodayClient from "./today-client";

export default async function AdminTodayPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx || ctx.role !== "admin") redirect("/app/today");

  const data = await getAdminTodayData(ctx.schoolId);

  return (
    <AdminTodayClient
      firstName={ctx.firstName ?? null}
      schoolName={ctx.schoolName ?? null}
      dateLabel={data.dateLabel}
      attendance={data.attendance}
      captured={data.captured}
      pendingReports={data.pendingReports}
    />
  );
}
