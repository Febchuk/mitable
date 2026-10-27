# CLP WhatsApp support automation

Research date: October 27, 2026. Proposal only; no WhatsApp connection or automatic messaging has been enabled.

## Recommendation

Start with a dedicated Mitable support number on Meta's official WhatsApp Cloud API. CLP staff message it directly with text, screenshots, and voice notes. The agent acknowledges feedback, asks focused follow-up questions, checks known fixes, and tracks an issue through a verified release. Keep a clear human takeover option.

Use a custom backend worker because the useful part is connecting the conversation to this repository, tests, school permissions, and deployment evidence. A provider can simplify number onboarding and supply a human inbox; it does not replace that workflow. Meta supports both direct integration and provider onboarding. [Meta platform overview](https://whatsappbusiness.com/products/business-platform/)

## The current WhatsApp group is the main constraint

- An existing WhatsApp Business App number may support **Coexistence**, meaning the phone app and API can operate on the same number. Existing group chats do not sync through this connection. Eligibility must be checked for the actual number: 8x8 currently lists Nigeria as unsupported for its Coexistence onboarding. [8x8 Coexistence documentation](https://developer.8x8.com/connect/docs/whatsapp/whatsapp-business-app-coexistence/)
- An official Groups API exists, but it is not a straightforward way to join the current CLP group. Current 360dialog documentation requires Official Business Account status and a messaging limit of at least 100,000 business-initiated conversations in a rolling 24 hours. Groups have at most eight participants, use API-created invitations, and are unavailable for Coexistence accounts. These precise restrictions were verified through the provider's documentation; Meta's developer page returned HTTP 429 during research. [360dialog Groups API](https://docs.360dialog.com/docs/messaging/groups)
- Unofficial linked-device libraries can access ordinary groups and media, but their maintainers warn that accounts may be blocked. Do not make Mikun's main number the foundation of unattended support. If remaining in the current group is essential, the existing WhatsApp-access agent can initially produce structured feedback imports while replies remain manual. [whatsapp-web.js documentation](https://docs.wwebjs.dev/)

Prefer direct messages to the support number for the first live version. Do not promise transparent access to the existing group or its entire history.

## Setup needed

Mikun needs to choose the support number, provide access to the owning Meta Business Portfolio, complete phone ownership verification, and identify authorized CLP staff. Confirm whether the number is new, in WhatsApp Messenger, already in WhatsApp Business App, or connected to a provider before choosing an onboarding path.

Engineering needs a Meta app and WhatsApp account, a production system-user token, phone-number identifier, signed HTTPS webhook, private media storage, transcription credentials, and a durable job worker. Store credentials outside the repository. Use a support update template for later follow-ups, plus an accessible human contact and opt-out handling. [Meta Cloud API setup](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)

Normal API replies are permitted within 24 hours of the most recent customer message. Outside that window, use approved templates. Automation must offer a direct escalation path, and subsequent outbound contact requires the recipient's permission. Keep the agent limited to Mitable support. [WhatsApp messaging policy](https://whatsappbusiness.com/policy/)

Voice notes should be downloaded into private storage, transcribed, and stored with their original message identifiers and audio. Keep uncertain wording available for review. Cloud API supports audio and media retrieval. [Meta audio messages](https://www.postman.com/meta/whatsapp-business-platform/request/juzqcg2/send-audio-message-by-url), [Meta media retrieval](https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url)

Obtain a live quote during onboarding for provider fees and message rates, then budget transcription, model use, and worker hosting. Provider pricing pages and Meta's public overview currently differ, so this proposal does not assume a free service-message allowance. [Meta pricing overview](https://whatsappbusiness.com/products/platform-pricing/)

## What the repository already provides

- `apps/backend/src/domains/auth/routes/feedback.ts` performs bounded investigation using logs. Reuse its investigation pattern and `apps/backend/src/domains/shared-infra/lib/feedback-log-sanitize.ts` before copying evidence into issues or agent jobs.
- The GitHub integration already uses installation credentials through `getInstallationOctokit`; reuse that connection for issues and pull requests rather than introducing personal tokens.
- `apps/backend/src/domains/capture/services/deepgramTranscriptionService.ts` handles live desktop audio. Add a prerecorded voice-note adapter; the existing live connection is not a drop-in WhatsApp transcription worker. [Deepgram prerecorded audio](https://developers.deepgram.com/docs/pre-recorded-audio)
- `apps/mitable-montessori/mcp-server/` and `/api/public/v1` expose school operations. Existing credentials have school-wide read/write scopes. A phone number must be mapped to a verified school actor, with role and classroom checks enforced by the server before each operation. Do not give a school-wide write key directly to a chat model.
- The school `/api/health` currently returns only `{ status: "ok" }`. The existing production deployment workflow checks the desktop/backend deployment. Neither proves that a particular school fix is live.

New infrastructure is still needed: durable support conversations, messages, issues, jobs, outgoing messages, and release evidence. Use unique inbound event identifiers, retry leases, and outgoing-message deduplication so webhook retries cannot create repeated jobs or customer replies. Record the school, authorized actor, source messages, and issue links throughout.

## Staged build

1. **Intake and replies:** verify webhooks, persist events before acknowledging them, fetch media, transcribe, deduplicate related feedback, and draft acknowledgements or clarification questions. Pilot with one CLP contact and review replies before enabling automatic acknowledgements. Keep original feedback separate from instructions the agent is allowed to execute.
2. **Investigation and tested pull requests:** inspect current code, recent merged changes, and sanitized logs before creating a new issue. A separate coding worker receives the scoped issue, uses an isolated checkout and branch, runs meaningful tests, and applies and verifies required development database migrations. Create a pull request with evidence. The conversational worker should have no arbitrary shell or deployment credentials.
3. **Limited automatic merge:** allow only defined low-risk changes after required checks and review pass. Route permissions, student data changes, destructive database changes, broad product decisions, and unclear reports to a human. Maintain a kill switch and a visible job history.
4. **Verified customer follow-up:** connect the issue to the merge commit, the school service deployment, and a feature-specific smoke check. Notify the original conversation once; use the approved template if its reply window has expired. Ask whether the reported workflow now works and reopen the issue if it does not.

The coding worker can use a supported agent runtime with structured outputs and bounded jobs. Do not run coding directly inside the WhatsApp webhook request. [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Codex noninteractive execution](https://learn.chatgpt.com/docs/non-interactive-mode)

## What the agent may say

Use states backed by saved evidence: **received**, **needs details**, **investigating**, **change under review**, **merged, awaiting deployment**, and **live, ready to test**. A successful coding run or merged pull request must never trigger a "fixed/live" reply by itself.

Before claiming a fix is live, verify that the school service is serving a deployment containing the intended commit, required migrations are present in the target environment, and the affected workflow passes a smoke check. Add a safe deployment revision endpoint or equivalent deployment metadata. Keep the customer reply short and describe the visible behavior that changed.

Pilot success means no missed or duplicate messages, useful voice-note transcripts, accurate school permissions, correct issue matching, and replies that agree with actual release state. Expand autonomy only after those checks hold in real use.
