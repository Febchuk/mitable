import { redirect } from "next/navigation";
import { AppBootstrap } from "@/components/app/AppBootstrap";
import { UserMenu } from "@/components/app/UserMenu";
import { MontessoriBottomNav } from "@/components/montessori/bottom-nav";
import { InstallBanner } from "@/components/montessori/install-banner";
import { MobileTopRight } from "@/components/montessori/mobile-controls";
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
          classroomName={ctx.schoolName ?? "School"}
          contextSubtitle="Admin workspace"
          userEmail={ctx.email}
          userMenuSlot={<UserMenu email={ctx.email} />}
          roleLabel="Admin"
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
          <main
            className="scroll-quiet"
            style={{
              flex: 1,
              position: "relative",
              paddingBottom: 96,
            }}
          >
            <MobileTopRight>
              <UserMenu email={ctx.email} />
            </MobileTopRight>
            {children}
          </main>
        </div>
      </div>
      <MontessoriBottomNav variant="admin" />
      <ToastHost />
      <InstallBanner />
      <AppBootstrap />
    </MontessoriProvider>
  );
}
