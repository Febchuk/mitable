import { redirect } from "next/navigation";
import { AppBootstrap } from "@/components/app/AppBootstrap";
import { BottomNav } from "@/components/app/BottomNav";
import { FloatingChat } from "@/components/chat/FloatingChat";
import { PendingBadge } from "@/components/sync/PendingBadge";
import {
  getActiveClassroomForCurrentUser,
  getCurrentUserContext,
} from "@/lib/app/active-classroom";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const classroom = await getActiveClassroomForCurrentUser();

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <BottomNav />
      <div className="flex-1 pb-20 sm:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink/10 bg-canvas/80 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink/40">Classroom</p>
            <p className="text-sm font-semibold">
              {classroom?.name ?? "No active classroom"}
              {classroom?.code ? <span className="ml-2 text-ink/40">{classroom.code}</span> : null}
            </p>
          </div>
          <PendingBadge />
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </div>
      <AppBootstrap />
      {classroom ? (
        <FloatingChat classroomId={classroom.id} schoolId={ctx.schoolId} userId={ctx.userId} />
      ) : null}
    </div>
  );
}
