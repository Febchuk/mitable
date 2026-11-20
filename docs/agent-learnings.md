# Working learnings

## Collaboration and product ownership — 19 November 2026

- **Explicit preference (Mikun, this chat):** Treat negative feedback as a user journey to reproduce and verify. Explain the implementation, reasoning, test actions, actual results, and remaining uncertainty so Mikun can assess the result and add his own taste. Follow [feedback-resolution](../skills/feedback-resolution/SKILL.md).
- **Explicit product decision (Mikun, 18 November 2026; TLP Reports Feedback call, 11 November):** The school should control grading ranges and report fields, order, and logos in the app. Build appropriate admin configuration instead of repeatedly changing code for school-owned choices. Granola source: https://notes.granola.ai/d/bc85acaa-0c7a-4fcb-b2df-0000eca4c6d9.
- **Explicit product rule (Mikun, 19 November 2026):** Parent report emails should require an explicit teacher send of a new report or a material update. Routine saves, opening reports, and retries must not create additional notifications. Mikun explicitly confirmed that separate attendance emails should be disabled; account invitations and password recovery remain available. Verify the signed-out mobile link journey and TLP branding.
- **Observed failure (18 November investigation):** Curriculum removal controls previously changed browser state without persisting the removal. A visual disappearance is insufficient: verify a fresh read and retention of recorded history. Deployment status must be established separately from local correctness.

- **Observed failure (19 November browser verification):** A middleware file beside the repository root was ignored while the app lived under `src/app`. Unit tests of the function passed without proving Next.js actually ran it. Check the compiled middleware manifest and the signed-out browser journey after routing changes.

Use [conversation-learnings](../skills/conversation-learnings/SKILL.md) to maintain these entries. Keep unverified explanations out of this file.
