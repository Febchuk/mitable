import { redirect } from "next/navigation";
import { AppBootstrap } from "@/components/app/AppBootstrap";
import { UserMenu } from "@/components/app/UserMenu";
import { ActiveReportProvider } from "@/components/montessori/active-report-context";
import { ChatDock } from "@/components/montessori/chat-dock";
import { InstallBanner } from "@/components/montessori/install-banner";
import { MontessoriMobileShell } from "@/components/montessori/mobile-shell";
import { ToastHost } from "@/components/montessori/primitives";
import { MontessoriSidebar } from "@/components/montessori/sidebar";
import { MontessoriProvider } from "@/components/montessori/store";
import {
  getActiveClassroomForCurrentUser,
  getCurrentUserContext,
  teacherShouldSeeIepProgressTab,
  teacherShouldSeeSpeechProgressTab,
} from "@/lib/app/active-classroom";
import { getClassroomProgress } from "@/lib/queries/classroom-progress";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (!ctx.privacyAcknowledgedAt) redirect("/onboarding/privacy");
  const isAdmin = ctx.role === "admin";
  const classroom = await getActiveClassroomForCurrentUser();
  const classroomName = classroom?.name ?? "Primrose Room";
  // Teachers' Progress tab needs the curriculum tree + roster + progress
  // hydrated server-side. Skipped for admins (their /app shell shows admin
  // pages, not the teacher Progress tab).
  const initialClassroomProgress = isAdmin ? null : await getClassroomProgress();
  const showIepProgressTab = !isAdmin && (await teacherShouldSeeIepProgressTab());
  const showSpeechProgressTab = !isAdmin && (await teacherShouldSeeSpeechProgressTab());

  return (
    <MontessoriProvider
      initialClassroomProgress={initialClassroomProgress}
      showIepProgressTab={showIepProgressTab}
      showSpeechProgressTab={showSpeechProgressTab}
    >
      <ActiveReportProvider>
        <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
          <MontessoriSidebar
            variant={isAdmin ? "admin" : "teacher"}
            classroomName={isAdmin ? (ctx.schoolName ?? "School") : classroomName}
            contextSubtitle={isAdmin ? "Admin workspace" : undefined}
            userMenuSlot={
              <UserMenu
                email={ctx.email}
                firstName={ctx.firstName}
                roleLabel={isAdmin ? "Admin" : "Lead guide"}
                variant="row"
                direction="up"
                align="left"
              />
            }
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              position: "relative",
            }}
          >
            <MontessoriMobileShell
              variant={isAdmin ? "admin" : "teacher"}
              firstName={ctx.firstName}
              email={ctx.email}
              schoolName={isAdmin ? (ctx.schoolName ?? "School") : classroomName}
              schoolSubtitle={isAdmin ? "Admin workspace" : undefined}
              classroomId={isAdmin ? null : (classroom?.id ?? null)}
              classroomName={classroomName}
              schoolId={ctx.schoolId}
              userId={ctx.userId}
            />
            <main
              className="scroll-quiet"
              style={{
                flex: 1,
                position: "relative",
                paddingBottom: 96,
              }}
            >
              {children}
            </main>
          </div>
        </div>
        {!isAdmin && (
          <ChatDock
            classroomId={classroom?.id ?? null}
            classroomName={classroomName}
            schoolId={ctx.schoolId}
            userId={ctx.userId}
          />
        )}
        <ToastHost />
        <InstallBanner />
        <AppBootstrap />
      </ActiveReportProvider>
    </MontessoriProvider>
  );
}
