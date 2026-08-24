# Migration history notes

On 2026-08-24, the linked database recorded the following schema changes under
timestamp-style IDs, while this repository held the same changes under the
canonical sequential IDs below. A schema dump confirmed that each change was
already present in the remote database.

| Remote history ID | Canonical migration in this repo             |
| ----------------- | -------------------------------------------- |
| `20260714181139`  | `0046_ui_hidden_entities.sql`                |
| `20260715223901`  | `0047_topic_marking_schemas.sql`             |
| `20260715230434`  | `0048_fix_curriculum_subjects_admin_rls.sql` |

The remote migration history was reconciled to use the canonical IDs. This was
a metadata-only repair: it did not run, remove, or alter the already-applied
schema changes.
