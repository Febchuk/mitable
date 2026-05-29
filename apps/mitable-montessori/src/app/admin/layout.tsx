import { redirect } from "next/navigation";
import { AppBootstrap } from "@/components/app/AppBootstrap";
import { UserMenu } from "@/components/app/UserMenu";
import { InstallBanner } from "@/components/montessori/install-banner";
import { MontessoriMobileShell } from "@/components/montessori/mobile-shell";
import { ToastHost } from "@/components/montessori/primitives";
import { MontessoriSidebar } from "@/components/montessori/sidebar";
import { MontessoriProvider } from "@/components/montessori/store";
import { getCurrentUserContext } from "@/lib/app/active-classroom";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (!ctx.privacyAcknowledgedAt) redirect("/onboarding/privacy");
  if (ctx.role !== "admin") redirect("/app/today");

  return (
    <MontessoriProvider>
      <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
        <MontessoriSidebar
          variant="admin"
          userMenuSlot={
            <UserMenu
              email={ctx.email}
              firstName={ctx.firstName}
              roleLabel="Admin"
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
            variant="admin"
            firstName={ctx.firstName}
            email={ctx.email}
            schoolName={ctx.schoolName ?? "School"}
            schoolSubtitle="Admin workspace"
            classroomId={null}
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
      <ToastHost />
      <InstallBanner />
      <AppBootstrap />
    </MontessoriProvider>
  );
}
