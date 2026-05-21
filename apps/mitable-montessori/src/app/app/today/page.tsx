import { redirect } from "next/navigation";
import { addTodayProgressAndAgent } from "@/lib/feature-flags";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { getTodayAttendance, listCapturedToday, listDraftReports } from "@/lib/queries/today";
import TodayClient from "./today-client";

export default async function TodayPage() {
  if (!addTodayProgressAndAgent()) {
    redirect("/app/reports");
  }

  const [ctx, attendance, captured, drafts] = await Promise.all([
    getCurrentUserContext(),
    getTodayAttendance(),
    listCapturedToday(8),
    listDraftReports(),
  ]);
  return (
    <TodayClient
      firstName={ctx?.firstName ?? null}
      attendance={attendance}
      captured={captured}
      drafts={drafts}
    />
  );
}
