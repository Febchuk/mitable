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
  listTeacherClassroomsForCurrentUser,
  teacherShouldSeeGrades,
  teacherShouldSeeDailyLog,
  teacherShouldSeeProgress,
  teacherShouldSeeSpeechProgressTab,
} from "@/lib/app/active-classroom";
import {
  addTodayProgressAndAgent,
  adminTodayEnabled,
  reportFirstExperience,
} from "@/lib/feature-flags";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (!ctx.privacyAcknowledgedAt) redirect("/onboarding/privacy");
  const isAdmin = ctx.role === "admin";
  const [
    classroom,
    teacherClassrooms,
    showSpeechProgressTab,
    showGradesNav,
    showDailyLogNav,
    showProgressNav,
  ] = isAdmin
    ? [null, [], false, false, false, true]
    : await Promise.all([
        getActiveClassroomForCurrentUser(),
        listTeacherClassroomsForCurrentUser(),
        teacherShouldSeeSpeechProgressTab(),
        teacherShouldSeeGrades(),
        teacherShouldSeeDailyLog(),
        teacherShouldSeeProgress(),
      ]);
  const classroomName = classroom?.name ?? "Primrose Room";
  const showTodayAndAgent = isAdmin ? adminTodayEnabled() : addTodayProgressAndAgent();
  const showReportFirstNav = !isAdmin && reportFirstExperience();

  return (
    <MontessoriProvider
      initialClassrooms={teacherClassrooms.map((c) => ({ id: c.id, name: c.name }))}
      showSpeechProgressTab={showSpeechProgressTab}
    >
      <ActiveReportProvider>
        <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
          <MontessoriSidebar
            variant={isAdmin ? "admin" : "teacher"}
            showTodayNav={showTodayAndAgent}
            reportFirstNav={showReportFirstNav}
            showGradesNav={showGradesNav}
            showDailyLogNav={showDailyLogNav}
            showProgressNav={showProgressNav}
            userMenuSlot={
              <UserMenu
                email={ctx.email}
                firstName={ctx.firstName}
                roleLabel={isAdmin ? "Admin" : "Lead guide"}
                variant="row"
                direction="up"
                align="left"
                showRevealHidden={isAdmin}
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
              showTodayNav={showTodayAndAgent}
              reportFirstNav={showReportFirstNav}
              showGradesNav={showGradesNav}
              showDailyLogNav={showDailyLogNav}
              showProgressNav={showProgressNav}
              showLegacyChat={showTodayAndAgent}
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
              className="scroll-quiet pb-24 lg:pb-0"
              style={{
                flex: 1,
                position: "relative",
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
            captureEnabled={showTodayAndAgent}
          />
        )}
        <ToastHost />
        <InstallBanner />
        <AppBootstrap />
      </ActiveReportProvider>
    </MontessoriProvider>
  );
}
