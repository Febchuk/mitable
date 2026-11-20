---
name: conversation-learnings
description: Turn Mikun's explicit corrections, product decisions, and demonstrated implementation failures into scoped, durable guidance for later Mitable work. Use after substantive feedback or a completed feedback-resolution task.
---

Read `docs/agent-learnings.md` and the applicable repository instructions before adding guidance. Capture decisions that will change future work, not a transcript or a diary of activity.

For each candidate learning, distinguish an explicit user preference, a confirmed product rule, an observed engineering failure, and an unverified hypothesis. Persist only supported guidance. Preserve the source and date and scope it to the product or workflow it actually describes. Do not promote a one-off customer request into a universal rule.

Choose the narrowest useful home:

- Durable collaboration preferences belong in `AGENTS.md`.
- Reusable investigation or implementation methods belong in the relevant `SKILL.md`.
- Product-specific decisions and evidence-backed caveats belong in `docs/agent-learnings.md`, with links to source code or the task's evidence record.
- Temporary work status belongs in the task's evidence record, not permanent instructions.

Update or replace an existing entry when the new evidence corrects it. Remove duplication and obsolete instructions. State a practical implication so a later agent can act differently. Keep customer identifiers, secrets, personal details, and private message text out of the learning record. A customer's source system remains authoritative for their facts; do not create a shadow customer profile here.

For each substantive addition, review a realistic future task against the rule: would it improve the decision, preserve the user's intent, and avoid unnecessary work or unauthorized side effects? Validate changed skills with the skill-creator validator when available. Record unresolved questions as questions, not rules.

At the end of the task, tell Mikun briefly what was learned and where the guidance was saved. This workflow does not authorize background monitoring, messages, deployment, or changes to unrelated global skills.
