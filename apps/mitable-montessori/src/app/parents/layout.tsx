import Link from "next/link";

export default function ParentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-ink/10 bg-canvas/80 px-4 py-3 backdrop-blur">
        <Link href="/parents" className="font-display text-lg">
          Mitable
          <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">parents</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
