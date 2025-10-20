/**
 * Converts Zod schemas to Gemini-compatible JSON Schemas
 * by removing unsupported fields (e.g., $schema, additionalProperties, exclusiveMinimum)
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";

// Gemini supports only a subset of OpenAPI 3.0 Schema fields
const GEMINI_SUPPORTED_FIELDS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "maxItems",
  "minItems",
  "properties",
  "required",
  "items",
]);

export function toGeminiSchema(zodSchema: ZodType): Record<string, any> {
  const fullJsonSchema = zodToJsonSchema(zodSchema, {
    $refStrategy: "none", // Gemini doesn't support $ref
  });

  console.log("🔍 Full JSON Schema:", JSON.stringify(fullJsonSchema, null, 2));

  const simplified = simplifyForGemini(fullJsonSchema);

  console.log("✨ Simplified Gemini Schema:", JSON.stringify(simplified, null, 2));

  return simplified;
}

function simplifyForGemini(schema: any): any {
  if (schema === null || schema === undefined) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(simplifyForGemini);
  }

  if (typeof schema !== "object") {
    return schema;
  }

  // Handle anyOf pattern for nullable fields (e.g., {anyOf: [{type: "string"}, {type: "null"}]})
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const nonNullSchemas = schema.anyOf.filter((s: any) => s.type !== "null");
    const hasNull = schema.anyOf.some((s: any) => s.type === "null");

    if (hasNull && nonNullSchemas.length === 1) {
      console.log("🔄 Converting anyOf nullable:", JSON.stringify(schema.anyOf));
      // Convert to Gemini's nullable format
      const baseSchema = simplifyForGemini(nonNullSchemas[0]);
      const result = { ...baseSchema, nullable: true };
      console.log("  ✓ Converted to:", JSON.stringify(result));
      return result;
    }
  }

  const simplified: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (!GEMINI_SUPPORTED_FIELDS.has(key)) {
      continue;
    }

    // Handle type arrays like ["string", "null"] → convert to {type: "string", nullable: true}
    if (key === "type" && Array.isArray(value)) {
      console.log("🔄 Converting type array:", JSON.stringify(value));
      const nonNullTypes = value.filter((t: string) => t !== "null");
      const hasNull = value.includes("null");

      if (nonNullTypes.length === 1) {
        simplified.type = nonNullTypes[0];
        if (hasNull) {
          simplified.nullable = true;
        }
        console.log(`  ✓ Converted to: type="${simplified.type}", nullable=${hasNull}`);
      } else if (nonNullTypes.length > 1) {
        // Multiple non-null types - just use first one and mark as nullable if needed
        simplified.type = nonNullTypes[0];
        if (hasNull) {
          simplified.nullable = true;
        }
        console.log(`  ✓ Converted to: type="${simplified.type}", nullable=${hasNull}`);
      }
      continue;
    }

    // Recursively process nested structures
    if (key === "properties" && typeof value === "object" && value !== null) {
      const simplifiedProperties: Record<string, any> = {};
      for (const [propKey, propValue] of Object.entries(value)) {
        simplifiedProperties[propKey] = simplifyForGemini(propValue);
      }
      simplified[key] = simplifiedProperties;
    } else if (key === "items") {
      simplified[key] = simplifyForGemini(value);
    } else {
      simplified[key] = value;
    }
  }

  return simplified;
}
