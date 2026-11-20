# Collaboration preferences

- Lead with the plain-English outcome. Keep responses concise and easy to scan.
- Avoid technical jargon up front. When a technical term is necessary, define it in ordinary language the first time it appears.
- Give enough reasoning and a clear plan to support decisions, but do not make the user read a long, five-minute response by default.
- Prefer a short main answer and offer deeper detail only when it would materially help the decision or the user asks for it.
- For every feature that depends on database changes, create, apply, and verify all required migrations in the linked development environment before calling the work shipped or ready for testing. Do not wait for a separate reminder.

# Feedback and learning workflow

- For customer complaints, regressions, and lists of product feedback, follow [feedback-resolution](skills/feedback-resolution/SKILL.md). Prove the affected user journey works, including persistence and mobile browser checks where relevant; distinguish local tests from deployed behavior.
- Explain what changed, why, exactly what was tested and observed, and what remains uncertain. Keep detailed evidence in repository quality documentation so Mikun can evaluate the work and add his own taste.
- After substantive corrections or product decisions, follow [conversation-learnings](skills/conversation-learnings/SKILL.md) and maintain [working learnings](docs/agent-learnings.md). Capture supported, scoped guidance without customer personal information or secrets.
