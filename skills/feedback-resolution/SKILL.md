---
name: feedback-resolution
description: Resolve reported Mitable product failures with reproducible evidence, realistic user-flow testing, and a reviewable explanation of the fix. Use for customer complaints, regressions, and multi-item feedback; scale the work to the impact.
---

Treat a complaint as a user outcome to verify, not a list of code edits. Read the relevant entries in `docs/agent-learnings.md` before investigating.

For each item, record the reported behavior, the intended behavior, and what would prove it fixed. Distinguish customer-reported facts, observations, and hypotheses. Consult the actual Granola transcript for TLP product decisions; ask Mikun when important ambiguity remains after checking the evidence. Prefer an admin configuration surface when the school should own the decision (grading ranges, report fields, order, branding), and preserve the existing design.

Identify the affected environment, deployed version, role, account scope, device, and time window. Translate reported local times to UTC explicitly. Inspect deployment metadata, logs, and saved records where available. A clean test in a different account or checkout does not disprove the complaint. A successful response does not prove a write occurred: reload, requery, and verify persistence. Check stale browser assets and mixed deployments when users see different results.

Reproduce the actual user journey and fix the cause. For emails and other repeated side effects, test repeated clicks, concurrent requests, retries, and interrupted delivery using a fake provider or a controlled test sink. Do not send test messages to real parents. Confirm that saving, marking progress, opening a report, and background retries do not create fresh notifications. User authorization to investigate does not authorize contacting customers.

Use representative roles and devices. For parent access, test the actual report link while signed out, sign-in or onboarding, and the return to the same child/report in a mobile browser. Verify authorization, branding, long-content layout, and relevant download behavior. Include meaningful failure cases, such as the wrong guardian, missing access, failed delivery, or a rejected write. Do not substitute component tests for browser checks when the reported problem crosses those boundaries.

Keep a concise evidence record in the task's repository documentation: environment/version; setup; actions; expected result; actual result; test command or browser evidence; limitations. Record failed attempts and the corrective action, not only passing tests. Use disposable fixtures and remove them afterward. Exclude credentials, private messages, and identifying customer details from committed evidence.

Apply and verify required database migrations in the linked development environment. Run relevant automated checks, then expand testing only to address remaining risks or new changes. Preserve sent reports and recorded history unless the requested behavior explicitly requires otherwise.

Finish with a plain-English explanation for each feedback item: what caused it (or what remains unproven), what changed in code and why that approach fits the product, exactly which tests ran and what happened, and what is local, applied in development, deployed, or still blocked. Link the detailed evidence. Do not call work shipped merely because local tests passed. Leave the result concrete enough for Mikun to evaluate and add his own taste.
