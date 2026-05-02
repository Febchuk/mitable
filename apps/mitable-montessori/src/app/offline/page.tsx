export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl">You&apos;re offline</h1>
      <p className="text-sm text-ink/60">
        Mitable keeps recent observations on this device. Once you&apos;re back online, your pending
        commands will sync automatically.
      </p>
    </main>
  );
}
