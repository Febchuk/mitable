import { test, expect, type Route } from "@playwright/test";

/**
 * End-to-end smoke for the capture → draft → review → save loop.
 *
 * The backend is mocked at the network layer (page.route) and the
 * Supabase session is faked via localStorage in an init script, so
 * this test runs hermetically against `next dev` with no DB, no
 * Gemini, and no outbound traffic.
 *
 * What it proves:
 *   1. A signed-in teacher can land on /teacher/agent.
 *   2. Typing a note + sending hits /agent/interpret.
 *   3. The returned proposal envelope renders an editable card.
 *   4. Edits made by the teacher are reflected in the /agent/confirm
 *      payload — i.e. the agent never persists what it proposed,
 *      it persists what the human approved.
 *   5. A successful confirm shows the "Saved" terminal state.
 */

const SUPABASE_PROJECT_REF = "test-project";
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CLASSROOM_ID = "00000000-0000-0000-0000-000000000002";
const USER_ID = "00000000-0000-0000-0000-000000000003";
const STUDENT_ID = "00000000-0000-0000-0000-000000000004";
const TOPIC_ID = "00000000-0000-0000-0000-000000000005";
const THREAD_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_MESSAGE_ID = "22222222-2222-2222-2222-222222222222";

const ME_RESPONSE = {
    user: {
        id: USER_ID,
        email: "teacher@example.com",
        firstName: "Test",
        lastName: "Teacher",
        role: "teacher",
    },
    organization: { id: ORG_ID, name: "Test Montessori" },
    assignedClassroom: { id: CLASSROOM_ID, name: "Primary A", level: "primary" },
};

const INTERPRET_RESPONSE = {
    threadId: THREAD_ID,
    messageId: AGENT_MESSAGE_ID,
    envelope: {
        summary: "I noted Aiden practised pink tower.",
        proposals: [
            {
                kind: "observation",
                proposalId: "p1",
                summary: "Aiden — Pink Tower",
                sourceQuote: "Aiden built the pink tower today",
                studentId: STUDENT_ID,
                studentName: "Aiden",
                topicId: TOPIC_ID,
                topicName: "Pink Tower",
                domainName: "Sensorial",
                level: "practising",
                note: "Worked through full tower with one reset.",
            },
        ],
        clarifyingQuestion: null,
    },
};

const CONFIRM_RESPONSE = {
    applied: {
        observationIds: ["00000000-0000-0000-0000-00000000000a"],
        attendanceIds: [],
        reportIds: [],
    },
};

test.describe("Montessori agent capture loop", () => {
    test("interprets a note, lets the teacher edit, then saves the edited proposal", async ({
        page,
    }) => {
        // ── 1. Fake Supabase session ───────────────────────────────────
        // The Supabase JS client looks for an entry under the
        // `sb-<project-ref>-auth-token` key in localStorage. Writing one
        // before any page scripts run lets AuthContext.getSession()
        // resolve to a valid session and skip the redirect to /login.
        await page.addInitScript(
            ({ storageKey }) => {
                const oneHour = 60 * 60;
                const session = {
                    access_token: "fake-access-token",
                    refresh_token: "fake-refresh-token",
                    expires_in: oneHour,
                    expires_at: Math.floor(Date.now() / 1000) + oneHour,
                    token_type: "bearer",
                    user: {
                        id: "00000000-0000-0000-0000-000000000003",
                        aud: "authenticated",
                        role: "authenticated",
                        email: "teacher@example.com",
                        app_metadata: { provider: "email" },
                        user_metadata: {},
                        created_at: new Date().toISOString(),
                    },
                };
                window.localStorage.setItem(storageKey, JSON.stringify(session));
            },
            { storageKey: SUPABASE_STORAGE_KEY }
        );

        // ── 2. Stub the backend ───────────────────────────────────────
        await page.route("**/api/montessori/me", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(ME_RESPONSE),
            })
        );

        await page.route("**/api/montessori/agent/interpret", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(INTERPRET_RESPONSE),
            })
        );

        // Capture the body of the confirm POST so we can assert that
        // the teacher's edits round-tripped to the server payload.
        let capturedConfirmBody: unknown = null;
        await page.route("**/api/montessori/agent/confirm", async (route: Route) => {
            try {
                capturedConfirmBody = JSON.parse(route.request().postData() ?? "{}");
            } catch {
                capturedConfirmBody = null;
            }
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(CONFIRM_RESPONSE),
            });
        });

        // ── 3. Land on the agent page ─────────────────────────────────
        await page.goto("/teacher/agent");

        const composer = page.getByPlaceholder(
            /Tell the agent what happened, or attach a photo of your notes/i
        );
        await expect(composer).toBeVisible();

        // ── 4. Type + send ────────────────────────────────────────────
        await composer.fill("Aiden built the pink tower today");
        await page.getByRole("button", { name: "Send" }).click();

        // ── 5. Proposal card appears ──────────────────────────────────
        await expect(page.getByText("Aiden — Pink Tower")).toBeVisible();
        await expect(page.getByText("Aiden · Sensorial → Pink Tower")).toBeVisible();

        // ── 6. Edit the note before saving ────────────────────────────
        const editedNote = "Worked the full tower; clearly more confident than last week.";
        const noteField = page.getByPlaceholder("Add a note (optional)…").first();
        await noteField.fill(editedNote);

        // ── 7. Save ───────────────────────────────────────────────────
        await page.getByRole("button", { name: /Save 1 update/i }).click();

        // ── 8. Terminal "saved" state shows ───────────────────────────
        await expect(page.getByText("Saved 1 update.")).toBeVisible();

        // ── 9. The persisted payload reflects the edit, not the
        //      original AI proposal. This is the core privacy +
        //      correctness invariant: humans approve before writes.
        expect(capturedConfirmBody).not.toBeNull();
        const body = capturedConfirmBody as {
            threadId: string;
            sourceMessageId: string;
            envelope: {
                proposals: Array<{
                    kind: string;
                    note: string | null;
                    level: string;
                }>;
            };
        };
        expect(body.threadId).toBe(THREAD_ID);
        expect(body.sourceMessageId).toBe(AGENT_MESSAGE_ID);
        expect(body.envelope.proposals).toHaveLength(1);
        expect(body.envelope.proposals[0].kind).toBe("observation");
        expect(body.envelope.proposals[0].note).toBe(editedNote);
        expect(body.envelope.proposals[0].level).toBe("practising");
    });
});
