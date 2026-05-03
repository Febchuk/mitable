import type Anthropic from "@anthropic-ai/sdk";

/**
 * LLM-assisted column mapping for messy spreadsheets. The admin pastes a CSV;
 * we hand the LLM the headers + a few sample rows and ask for a mapping to
 * canonical fields. Returned mapping plugs into `lib/admin/csv.ts`'s planning
 * step.
 *
 * This is intentionally a single-turn extraction, not an agent loop — there's
 * nothing to look up, just a schema-aware match between strings.
 */

export type MappingTarget = "roster" | "guardian" | "subtopic";

const TARGET_FIELDS: Record<MappingTarget, string[]> = {
  roster: ["first_name", "last_name", "preferred_name", "birth_date"],
  guardian: ["first_name", "last_name", "email", "phone", "preferred_contact_method"],
  subtopic: ["name", "sort_order", "aliases"],
};

export interface AnthropicLike {
  messages: {
    create: (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export async function suggestColumnMapping(input: {
  target: MappingTarget;
  headers: string[];
  sampleRows: string[][];
  anthropic: AnthropicLike;
  model: string;
}): Promise<Record<string, string | null>> {
  const tool: Anthropic.Tool = {
    name: "suggest_mapping",
    description: "Map CSV headers to canonical fields. null means the column is unused.",
    input_schema: {
      type: "object",
      properties: {
        mapping: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["mapping"],
    },
  };

  const sample = input.sampleRows
    .slice(0, 5)
    .map((r, i) => `Row ${i + 1}: ${r.map((c, j) => `${input.headers[j]}=${c}`).join(", ")}`)
    .join("\n");

  const resp = await input.anthropic.messages.create({
    model: input.model,
    max_tokens: 512,
    system:
      "You map CSV headers to a fixed set of canonical fields. Use null (or omit a header) if it doesn't fit. Don't invent canonical fields outside the provided list.",
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: [
          `Target: ${input.target}`,
          `Canonical fields: ${TARGET_FIELDS[input.target].join(", ")}`,
          ``,
          `Headers: ${input.headers.join(", ")}`,
          ``,
          `Samples:\n${sample}`,
          ``,
          `Return a mapping {csv_header: canonical_field_or_null}.`,
        ].join("\n"),
      },
    ],
  });

  const toolUse = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Mapping returned no tool call");
  const args = toolUse.input as { mapping?: Record<string, string | null> };
  return args.mapping ?? {};
}
