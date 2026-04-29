import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Montessori app.
 *
 * Scope: a single end-to-end smoke covering capture → draft → review →
 * save. The backend is mocked at the network layer with `page.route`,
 * and the Supabase session is faked via localStorage in the test
 * itself, so this test runs hermetically against `next dev` with no
 * real database, no Gemini, and no network outside the Playwright
 * process.
 *
 * To run locally:
 *   npm run test:e2e --workspace=apps/montessori
 *
 * (You'll need `npx playwright install chromium` once on this machine.)
 */
export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: "http://localhost:3004",
        trace: "on-first-retry",
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3004",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Inject fake Supabase env vars so the client constructs
        // without errors; the actual auth flow is mocked in the test.
        env: {
            NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
            NEXT_PUBLIC_API_BASE_URL: "http://localhost:3004",
        },
    },
});
