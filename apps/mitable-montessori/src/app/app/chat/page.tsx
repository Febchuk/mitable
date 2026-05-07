import { redirect } from "next/navigation";
import {
  getActiveClassroomForCurrentUser,
  getCurrentUserContext,
} from "@/lib/app/active-classroom";
import { MobileChatShell } from "./MobileChatShell";

export default async function MobileChatPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const classroom = await getActiveClassroomForCurrentUser();
  return (
    <MobileChatShell
      classroomId={classroom?.id ?? null}
      classroomName={classroom?.name ?? "No classroom"}
      schoolId={ctx.schoolId}
      userId={ctx.userId}
    />
  );
}
