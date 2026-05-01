import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  CreateGuardianSchema,
  CreateStudentSchema,
  CreateClassroomSchema,
  CreateCurriculumSubtopicSchema,
} from "@/lib/schemas/admin";

/**
 * Single-turn extraction-to-form. Admin types a description; LLM extracts the
 * fields; the result is shown back as a pre-filled form. Submission goes
 * through the direct CRUD endpoint, never through the agent loop, so plaintext
 * PII is isolated to one call.
 */

export type ExtractionEntity = "student" | "guardian" | "classroom" | "subtopic";

const ENTITY_SCHEMAS: Record<ExtractionEntity, z.ZodObject<z.ZodRawShape>> = {
  student: CreateStudentSchema,
  guardian: CreateGuardianSchema,
  classroom: CreateClassroomSchema,
  subtopic: CreateCurriculumSubtopicSchema,
};

const ENTITY_TOOL_NAME: Record<ExtractionEntity, string> = {
  student: "fill_student_form",
  guardian: "fill_guardian_form",
  classroom: "fill_classroom_form",
  subtopic: "fill_subtopic_form",
};

const ENTITY_DESCRIPTIONS: Record<ExtractionEntity, string> = {
  student: "Extract fields for a new student record.",
  guardian: "Extract fields for a new guardian record.",
  classroom: "Extract fields for a new classroom.",
  subtopic: "Extract fields for a new curriculum subtopic.",
};

export interface AnthropicLike {
  messages: {
    create: (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export async function extractEntityFields(input: {
  entity: ExtractionEntity;
  description: string;
  anthropic: AnthropicLike;
  model: string;
}): Promise<{ fields: Record<string, unknown>; raw: unknown }> {
  const tool: Anthropic.Tool = {
    name: ENTITY_TOOL_NAME[input.entity],
    description: ENTITY_DESCRIPTIONS[input.entity],
    input_schema: zodToInputSchema(ENTITY_SCHEMAS[input.entity]),
  };

  const resp = await input.anthropic.messages.create({
    model: input.model,
    max_tokens: 1024,
    system:
      "You convert a free-text description into a single tool call with the extracted fields. Do not invent values; leave optional fields out if the description doesn't mention them. The user will review your output in a form before submitting.",
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `Description:\n"${input.description}"`,
      },
    ],
  });

  const toolUse = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    throw new Error("Extraction returned no tool call");
  }

  const validated = ENTITY_SCHEMAS[input.entity].safeParse(toolUse.input);
  if (!validated.success) {
    throw new Error(`Extraction validation failed: ${JSON.stringify(validated.error.flatten())}`);
  }

  return { fields: validated.data, raw: toolUse.input };
}

/**
 * Minimal Zod → JSON Schema bridge. Covers the fields used by the four
 * extraction entities — strings (with min/max), enums, optional flags. Anything
 * unsupported throws so we don't ship subtle silent gaps.
 */
function zodToInputSchema(schema: z.ZodObject<z.ZodRawShape>): Anthropic.Tool["input_schema"] {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const inner = unwrap(value);
    properties[key] = jsonForZod(inner);
    if (!isOptional(value)) required.push(key);
  }

  return {
    type: "object",
    properties: properties as Record<string, { type: string }>,
    required: required.length > 0 ? required : undefined,
  } as unknown as Anthropic.Tool["input_schema"];
}

function isOptional(z: z.ZodTypeAny): boolean {
  if (z.isOptional()) return true;
  if (z._def?.typeName === "ZodDefault") return true;
  return false;
}

function unwrap(z: z.ZodTypeAny): z.ZodTypeAny {
  let cur = z;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  while ((cur as any)._def?.innerType) cur = (cur as any)._def.innerType;
  return cur;
}

function jsonForZod(z: z.ZodTypeAny): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = z._def as any;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: jsonForZod(def.type) };
    case "ZodObject": {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(def.shape() as Record<string, z.ZodTypeAny>)) {
        props[k] = jsonForZod(unwrap(v));
      }
      return { type: "object", properties: props };
    }
    default:
      return { type: "string" };
  }
}
