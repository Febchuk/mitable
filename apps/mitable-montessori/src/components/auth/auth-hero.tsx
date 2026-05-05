import Image from "next/image";

/**
 * AuthHero — left-side panel shared by /login and /signup.
 *
 * Desktop (>=lg): split-screen hero. Terracotta-toned cartoon fills the
 * left half, brand wordmark top-left, Maria Montessori quote bottom-left.
 *
 * Mobile (<lg): the full hero is hidden; the parent page also renders
 * <AuthHeroMobile /> at the top so phone users still see the brand bar
 * (terracotta strip + wordmark) without the cartoon eating half the screen.
 */
export function AuthHero() {
  return (
    <aside className="relative hidden overflow-hidden bg-terracotta lg:flex lg:flex-col lg:justify-end lg:p-16">
      {/* Cartoon illustration. The image itself has dominant terracotta
          tones (warm walls + floor) so it blends into the panel. */}
      <Image
        src="/auth/auth-hero-cartoon.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 0vw, 50vw"
        className="object-cover object-center"
      />

      {/* Subtle deeper-terracotta wash at the bottom for quote contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-terracotta-deep/40"
      />

      {/* Brand wordmark — top-left, Caveat */}
      <h2 className="absolute left-16 top-12 z-10 font-display text-3xl font-semibold text-canvas drop-shadow-[0_1px_12px_rgba(42,39,35,0.35)]">
        Mitable
      </h2>

      {/* Quote — bottom-left, layered above the gradient */}
      <div className="relative z-10 max-w-[480px]">
        <p className="font-display text-5xl font-medium leading-[1.05] text-canvas drop-shadow-[0_2px_24px_rgba(42,39,35,0.45)]">
          &ldquo;Help the child do it themselves.&rdquo;
        </p>
        <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-canvas/85">
          — Maria Montessori
        </p>
      </div>
    </aside>
  );
}

/**
 * Mobile-only brand bar — slim terracotta strip with the Mitable wordmark.
 * Replaces the full hero on phones so the form gets vertical breathing room.
 */
export function AuthHeroMobile() {
  return (
    <div className="flex h-16 items-center justify-center bg-terracotta px-6 lg:hidden">
      <h2 className="font-display text-2xl font-semibold leading-none text-canvas">
        Mitable
      </h2>
    </div>
  );
}
