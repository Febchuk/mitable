# Prototype mobile nav redesign — sidebar drawer + floating chat

**Working dir:** `/Users/febechukwuma/Documents/mitable/apps/mitable-montessori`

## What to build

A single self-contained HTML prototype that demonstrates a redesigned mobile shell for the Mitable Montessori admin app. Two changes from today's mobile UX:

1. **Top-left profile icon → sidebar drawer.** Replace the current mobile bottom tab bar. Put a circular profile/avatar icon (initials or photo) in the top-left of the top bar. Tapping it slides a left sidebar drawer in from the left edge, full-height, with a translucent scrim over the rest of the screen. The drawer holds the nav items (the same routes that today live in the bottom bar) plus account/profile actions (Settings, Sign out, switch role if applicable). Tapping the scrim or a nav item dismisses the drawer.
2. **Floating chat button, persistent across every route.** A single circular FAB pinned to the bottom-right (≈16px inset, safe-area aware on iOS). Tapping it opens a chat panel — on mobile it slides up as a bottom sheet covering ~85% of the viewport; closing returns to whatever route was underneath. The button should appear identically on every route — Dashboard, Children, Curriculum, etc. — so demonstrate that by rendering ≥3 distinct route views in the prototype and showing the chat FAB present on all of them.

## Design conventions to follow

- **Tone: Montessori** — warm, calm, generous spacing, soft neutrals, rounded corners (look at existing `_design/*.html` for the established visual language). Avoid sterile/SaaS-blue web design tropes.
- The prototype lives in `apps/mitable-montessori/_design/` alongside siblings like `new-report-mobile-prototype.html`, `progress-prototype.html`, `report-editor-prototype.html`. Read at least one of those first to match typography, color, spacing, and component idioms.
- Use the device-frame pattern from existing mobile prototypes (iPhone-shaped frame, status bar, home indicator). Show 3–4 device frames side-by-side: closed state, drawer open, chat sheet open, plus one alternate route to prove the FAB is global.
- Single HTML file. Tailwind via CDN is fine. No build step. Use real images from Wikimedia/Met/Unsplash for any avatar/photo placeholders — no `via.placeholder.com`.
- Make the drawer and chat sheet **actually interactive** (click to open/close, scrim dismiss, smooth transform-based transitions). Don't just render static screenshots of states — the whole point of an HTML prototype is feel.

## Routes to represent (sample 3+)

Top-level admin routes today live under `src/app/admin/`. Verified route directories (as of the time this prompt was written):

- `today/` — Dashboard / today view
- `classrooms/`
- `curriculum/`
- `reports/`
- `report-templates/`
- `teachers/`

Pick a representative spread — e.g. Today (Dashboard), Classrooms, Curriculum, Reports. You don't need real data; mocked content cards are fine. The point is to show the shell, not rebuild the screens.

## What I want to see in the drawer

- Profile block at the top (avatar, name, role, school name)
- Primary nav (the items currently in the mobile bottom bar)
- Secondary section (Settings, Help)
- Sign out at the bottom
- Active-route indicator on whichever item matches the route shown behind it

## Chat FAB behavior

- 56px circle, soft shadow, brand-warm color (match the palette in the existing prototypes — don't pick a new accent)
- Subtle pulse or unread affordance is optional but nice
- When the bottom sheet is open, the FAB transforms into the sheet's close affordance (or hides) — pick one and be consistent
- The chat sheet itself can be a stub: header ("Ask Mitable"), a couple of mocked message bubbles, an input row at the bottom. This is about the shell, not the chat product.

## Constraints

- Don't redesign the top bar beyond adding the profile icon on the left. Keep whatever's currently in the center/right (page title, action icons) intact.
- Don't remove the bottom-bar concept on desktop — desktop is out of scope, mobile only.
- No frameworks beyond Tailwind CDN + vanilla JS. No React, no build step.
- Use real, license-clear images for avatars (Wikimedia Commons portraits, Unsplash people). Cite the source as a comment near the `<img>` tag.

## Before you write code

1. Read `_design/new-report-mobile-prototype.html` and one other mobile prototype in `_design/` to absorb the visual language.
2. Glance at `src/app/admin/` to confirm route names you'll use as nav labels.
3. Skim the existing top bar / bottom nav components under `src/components/` (likely under `src/components/montessori/` or `src/components/app/`) so the drawer items match what's actually in the app today — not invented.

## Deliverable

One file: `apps/mitable-montessori/_design/mobile-shell-prototype.html`. Open it in a browser and verify all interactions work (drawer open/close, scrim dismiss, FAB on every framed route, chat sheet open/close). Take a screenshot of the final state and save it as `_design/_screen-mobile-shell-prototype.png` to match the sibling naming convention.

## Out of scope

- Wiring this into the real Next.js app
- Desktop layout changes
- Building the actual chat backend
- Anything under `apps/backend` or `apps/electron`

---

## Verification (for the user, after the agent runs)

- File exists at `_design/mobile-shell-prototype.html`
- Opens in a browser without console errors
- Drawer opens from profile-icon tap, dismisses on scrim tap and on nav-item tap
- FAB visible on every framed route shown in the prototype
- Chat bottom sheet opens from FAB and closes cleanly
- Visual language matches sibling prototypes (warmth, rounded corners, spacing)

## Critical files (referenced by this prompt, not edited by the task)

- `apps/mitable-montessori/_design/new-report-mobile-prototype.html` — visual reference
- `apps/mitable-montessori/_design/progress-prototype.html` — visual reference
- `apps/mitable-montessori/_design/report-editor-prototype.html` — visual reference
- `apps/mitable-montessori/src/app/admin/` — route names for nav labels (`today`, `classrooms`, `curriculum`, `reports`, `report-templates`, `teachers`)
- `apps/mitable-montessori/src/components/` — current mobile shell to mirror (check `montessori/` and `app/` subdirs)
