import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { UserMenu } from "@/components/app/UserMenu";

export default async function ParentsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-canvas/80 px-4 py-3 backdrop-blur">
        <Link href="/parents" className="font-display text-lg">
          Mitable
          <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">parents</span>
        </Link>
        {user?.email ? <UserMenu email={user.email} /> : null}
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
