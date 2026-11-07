import Link from "next/link";
import { notFound } from "next/navigation";
import { UserMenu } from "@/components/app/UserMenu";
import { getSchoolBranding } from "@/lib/branding/school";
import { studentTestsEnabled } from "@/lib/feature-flags";
import { getCurrentStudent } from "@/lib/tests/queries";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!studentTestsEnabled()) notFound();
  const student = await getCurrentStudent();
  const brand = getSchoolBranding(student?.schoolName);
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-canvas/80 px-4 py-3 backdrop-blur">
        <Link href="/student" className="font-display text-lg">
          {brand ? (
            <img
              src={brand.logoPath}
              alt={brand.name}
              className="inline-block h-11 w-auto object-contain"
            />
          ) : (
            "Mitable"
          )}
          <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">students</span>
        </Link>
        {student ? (
          <UserMenu
            email={student.loginCode}
            firstName={student.displayName}
            signOutHref="/student/login"
          />
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
