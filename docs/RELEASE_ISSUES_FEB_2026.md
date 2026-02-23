# Release Testing Issues & Improvements — February 2026

**Reported by:** Febe & Aurel (Engineering)
**Date:** February 22, 2026
**Context:** Issues found during testing of the latest release

---

## 1. Session & Passive Monitoring

### 1.1 Passive monitoring should be on by default
- **Priority:** High
- **Current behavior:** Passive monitoring is off by default; users must manually enable it.
- **Expected behavior:** Passive monitoring should be enabled by default for all users so sessions are captured automatically from the start.
- **Area:** `PassiveMonitorService`, user settings/preferences

### 1.2 Audio/mic activity should prevent session from ending
- **Priority:** High
- **Current behavior:** Passive monitoring ends sessions after a period of keyboard/mouse inactivity, even if the user is in a meeting with their mic active and collecting audio data.
- **Expected behavior:** If the microphone is on, treat it as a continuous activity signal. The user may be in a meeting (listening, speaking) and is still working — the session should not be ended by the idle timeout while the mic is active.
- **Area:** `ActivityTracker`, `PassiveMonitorService` idle detection / session ending logic, mic state tracking

### 1.3 Use app name (not window title) in the activity block breakdown
- **Priority:** Medium
- **Current behavior:** The session activity/block breakdown displays window titles.
- **Expected behavior:** Display the application name instead (e.g., "Google Chrome", "Visual Studio Code"). App names provide a cleaner, more meaningful breakdown than window titles.
- **Area:** Activity tracking data model, session summary UI

---

## 2. Pill Widget (WatchingPill)

### 2.1 Pill should fully disappear on session end
- **Priority:** High
- **Current behavior:** The pill remains visible after a session ends.
- **Expected behavior:** When a session ends (either manually or via passive monitoring timeout), the pill window should fully hide. It should only reappear when a new session starts.
- **Area:** `WatchingPill` window management, session lifecycle events in `main.ts`

### 2.2 Pill logo lacks visual affordance for opening Console
- **Priority:** Medium
- **Current behavior:** The logo on the pill is the way to open the Console mid-session, but there is no visual indication that it's clickable or that clicking it opens the Console. Users don't discover this functionality.
- **Expected behavior:** Add clear visual feedback — hover state, tooltip ("Open Console"), cursor change, or a subtle animation — so it's obvious the logo is an interactive element that opens the Console.
- **Area:** `WatchingPill` renderer styles, UX

### 2.3 Console window doesn't focus when opened from pill during active session
- **Priority:** High
- **Current behavior:** Clicking the pill logo to open the Console during an active session does not bring the Console window to the front. Users have to four-finger swipe down (Mission Control) and manually select the Console window to see it.
- **Expected behavior:** Clicking the pill logo should reliably bring the Console window to the foreground and give it focus, regardless of the current window state or active session.
- **Area:** Window management in `main.ts`, `window.focus()` / `window.show()` behavior on macOS, possible `setAlwaysOnTop` interaction

---

## 3. Notifications & Updates

### 3.1 Notification when there's a new app update
- **Priority:** High
- **Current behavior:** No notification is shown when a new version of the app is available.
- **Expected behavior:** When an update is detected (via `electron-updater` or similar), display a clear notification to the user — either an in-app banner, OS notification, or both — with an option to update.
- **Area:** Auto-updater integration, notification system

### 3.2 Implement OS-level notifications
- **Priority:** Medium
- **Current behavior:** The app does not leverage native OS notifications.
- **Expected behavior:** Use the Electron `Notification` API to send native OS notifications for key events:
  - New app update available
  - Session started/ended (passive monitoring)
  - Nudge received (expert recommendation)
  - Roadmap task reminders
- **Area:** New notification service in Electron main process

---

## 4. Admin Controls

### 4.1 Admin should be able to enforce passive monitoring
- **Priority:** High
- **Current behavior:** Passive monitoring is a per-user setting with no organizational override.
- **Expected behavior:** Organization admins should be able to:
  - Enforce passive monitoring as always-on for all org members
  - Set a default (on/off) that users can or cannot override, depending on admin preference
  - View which users have passive monitoring enabled/disabled
- **Area:** Admin dashboard, org settings API, `PassiveMonitorService` config source

### 4.2 Admin should have influence over the block list
- **Priority:** Medium
- **Current behavior:** Block list (apps/sites excluded from monitoring) is not admin-configurable.
- **Expected behavior:** Admins should be able to:
  - Define an org-wide block list of apps/domains to exclude from monitoring
  - Users may add personal additions but not remove org-enforced blocks
  - Block list changes propagate to all org members
- **Area:** Admin dashboard, org settings schema, block list sync to Electron client

---

## 5. Authentication & Accounts

### 5.1 Email address confirmation
- **Priority:** High
- **Current behavior:** Users can sign up without verifying their email address.
- **Expected behavior:** After registration, send a verification email with a confirmation link. Users should not have full access until their email is confirmed.
- **Area:** Auth flow (Supabase Auth or custom), email service integration

### 5.2 Forgot password flow
- **Priority:** High
- **Current behavior:** No password reset functionality exists.
- **Expected behavior:** Add a "Forgot password?" link on the login screen that:
  1. Prompts for email address
  2. Sends a password reset link
  3. Allows the user to set a new password via the link
- **Area:** Auth flow, email service, reset password UI

### 5.3 Self-service account creation with org association
- **Priority:** High
- **Current behavior:** Users cannot independently create an account and join their organization.
- **Expected behavior:** New users should be able to:
  - Create an account (sign up)
  - Be automatically associated with their organization (e.g., via email domain matching, invite link, or org code)
  - Get appropriate default role and permissions
- **Area:** Sign-up flow, org membership logic, invite system

---

## 6. Platform & Infrastructure

### 6.1 Bring the website into the mitable monorepo
- **Priority:** Medium
- **Current behavior:** The marketing/landing website lives in a separate repository.
- **Expected behavior:** Move the website into the monorepo (e.g., `apps/website/`) to share types/utilities, unify CI/CD, and simplify dependency management.
- **Area:** Monorepo configuration, CI/CD, deployment

### 6.2 Add Stripe integration for payments
- **Priority:** Medium
- **Current behavior:** No payment processing exists.
- **Expected behavior:** Integrate Stripe for subscription/payment management:
  - Add Stripe checkout link or embedded payment flow
  - Handle subscription lifecycle (create, upgrade, cancel)
  - Gate features based on plan/tier
- **Area:** Backend payment service, Stripe SDK, pricing/plan schema

---

## Summary

| # | Issue | Priority | Category |
|---|-------|----------|----------|
| 1.1 | Passive monitoring on by default | High | Session |
| 1.2 | Mic on = keep session alive | High | Session |
| 1.3 | App name in block breakdown | Medium | Session |
| 2.1 | Pill hides on session end | High | Pill |
| 2.2 | Pill logo needs clickable affordance | Medium | Pill |
| 2.3 | Console doesn't focus from pill click | High | Pill |
| 3.1 | New update notification | High | Notifications |
| 3.2 | OS-level notifications | Medium | Notifications |
| 4.1 | Admin enforces passive monitoring | High | Admin |
| 4.2 | Admin controls block list | Medium | Admin |
| 5.1 | Email confirmation | High | Auth |
| 5.2 | Forgot password | High | Auth |
| 5.3 | Self-service signup + org join | High | Auth |
| 6.1 | Website into monorepo | Medium | Infra |
| 6.2 | Stripe payments | Medium | Infra |

**High priority:** 8 | **Medium priority:** 7 | **Total:** 15
