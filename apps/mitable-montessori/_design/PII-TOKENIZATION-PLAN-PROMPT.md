# Planning Prompt: PII Tokenization for Montessori Chat Agent

## Context

You are planning the implementation of a PII tokenization layer for the Mitable Montessori chat agent. This agent helps Montessori teachers reason about student progress, observations, and classroom dynamics. Today the agent likely passes student names directly to the LLM; we want to change that so names never leave our system, while preserving the model's ability to reason about relationships across students and across turns.

The product decision has already been made — read it carefully before planning. **Your job is to produce an implementation plan, not to redesign the approach.** If you find a place where reality forces a deviation from the design (e.g., the streaming infra can't buffer to token boundaries), flag it as an open question rather than silently changing the shape.

## The Design (already decided)

### Identifier strategy

- Use existing student database IDs (e.g., `stu_a7f2c1`) as the LLM-facing identifier. Do **not** introduce a separate token namespace.
- Treat these IDs as identifiers worth protecting, not as anonymous handles. They are stable across threads and time.
- Strip names, photos, parent contact info, and free-text PII before the LLM sees it. Detokenize at the response boundary for display.

### Token wire format

- `{{student:ID}}` — verbose but robust, unambiguous to parse, signals "entity reference" to the model.
- Same format used in: redacted user messages, system prompt instructions, tool inputs, tool outputs (including free-text fields), and model output.

### Request/response shape

**1. UI → Server**

```
POST /api/agent/chat
{
  threadId: "thr_01H...",
  message: "How is Amelia doing in practical life this week?",
  mentions?: [{ kind: "student", id: "stu_a7f2c1", display: "Amelia" }]
}
```

If `mentions` is absent, server runs entity-resolution against the org's student roster (fuzzy match on first name, scoped to the teacher's class).

**2. Server-side redaction (per-request, in-memory only)**

```ts
type TokenMap = {
  forward: Record<string, string>; // "Amelia" -> "stu_a7f2c1"
  reverse: Record<string, string>; // "stu_a7f2c1" -> "Amelia"
};
```

Rewrite the user message and retrieved context: `"How is {{student:stu_a7f2c1}} doing..."`.

**3. Server → LLM**

- System prompt instructs the model to preserve `{{student:ID}}` tokens verbatim, never invent/rename/detokenize them.
- Tool schemas use `studentId` (string) inputs. Tool outputs return the same ID format, with free-text fields (observation notes, etc.) passed through the same redactor on the way out of the DB.

**4. Tool round-trip** — model calls `get_student_progress({ studentId: "stu_a7f2c1", ... })`; server executes, returns a result whose free-text fields contain `{{student:other_id}}` tokens for any other students mentioned.

**5. LLM → Server** — model output keeps tokens: `"{{student:stu_a7f2c1}} has had a strong week..."`.

**6. Server → UI**

```
{
  threadId: "thr_01H...",
  message: "Amelia has had a strong week...",  // detokenized
  entities: [
    { kind: "student", id: "stu_a7f2c1", display: "Amelia", offsets: [[0, 6]] }
  ]
}
```

UI renders names as chips/links via the entities array.

### Design notes that are non-negotiable

- **Hallucination guard**: validate every `{{student:ID}}` in model output against the request's token map. If the model invents `{{student:stu_zzzz}}`, surface as an error — do not silently drop.
- **Streaming**: detokenize on complete-token boundaries (buffer until closing `}}`). Never emit partial `{{student:stu_a7f2`.
- **Logging**: log the redacted prompt, never the detokenized version. Token map is per-request, in-memory only.
- **Cross-thread continuity**: stable IDs across threads, but no memory leakage between threads unless explicitly passed.

## Your Task

Produce an implementation plan with the following sections:

1. **Codebase audit** — Explore the Montessori app (`apps/mitable-montessori/`) and identify:
   - Where the chat agent lives today (UI component, API route, LLM call site)
   - Current shape of the chat request/response
   - Current student data model (table/schema, ID format, what counts as PII)
   - Whether retrieval/RAG is involved and what fields it pulls
   - Tool/function-calling infra if any
   - Streaming infra if any
   - Existing logging hygiene around prompts

2. **Gap analysis** — For each piece of the design, what already exists vs. what needs building. Be specific about files.

3. **Implementation steps** — Ordered, each step small enough to ship and verify on its own. For each step:
   - File(s) touched
   - What changes (one or two sentences, not pseudocode)
   - How to verify it works

   Suggested phasing (adjust if the codebase forces a different order):
   - Redaction primitives (forward/reverse token map, message rewriter, free-text scanner)
   - Entity resolution (fuzzy student matching, scoped to teacher's class)
   - System prompt + tool schemas updated to the token format
   - DB-layer redactor for tool outputs (free-text fields containing other students)
   - Output validation (hallucination guard) + detokenizer + entities array builder
   - Streaming-aware detokenizer (token-boundary buffering)
   - Logging audit (verify no detokenized text reaches logs)

4. **Open questions** — Things you genuinely cannot decide without product/engineering input. Don't pad this with hypotheticals; only list what's actually blocking.

5. **Out of scope (explicitly)** — Things adjacent to this work that someone might assume are included but aren't. At minimum: external transcript sharing / re-tokenization for audit (deferred per design), PII beyond student names (parent contact, photos, free-text in other tables — call out which apply but don't expand scope unless trivial).

## Constraints

- Read-only investigation. **Do not write or edit code.** This is a planning pass.
- Reference real file paths and line numbers. Don't speculate about files you didn't open.
- If the chat agent doesn't exist yet in this codebase, say so plainly and pivot the plan to "build it with tokenization from day one" rather than retrofitting.
- Keep the plan tight — under ~600 lines of markdown. Lean on file:line references rather than quoting code.
- Flag any place where the existing Mitable backend (`apps/backend/`) already solves a piece of this (e.g., chunking, embedding, PII redaction in `shared-infra`) so we can reuse rather than rebuild.

## Deliverable

A single markdown document, written for an engineer who will execute the plan. Save it to `apps/mitable-montessori/_design/PII-TOKENIZATION-PLAN.md`.
