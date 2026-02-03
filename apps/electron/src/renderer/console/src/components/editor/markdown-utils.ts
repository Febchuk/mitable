/**
 * Markdown Serialization Utilities
 *
 * Converts between Plate editor JSON and Markdown strings for storage.
 */

import type { Value } from "platejs";
import type { PlateEditor } from "platejs/react";

import { deserializeMd, serializeMd } from "@platejs/markdown";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("MarkdownUtils");

/**
 * Serialize Plate editor value to Markdown string
 *
 * @param editor - The Plate editor instance
 * @param value - Optional value to serialize (defaults to editor.children)
 * @returns Markdown string
 */
export function plateToMarkdown(editor: PlateEditor, value?: Value): string {
  try {
    return serializeMd(editor, {
      value: value || editor.children,
    });
  } catch (error) {
    logger.error("Error serializing to markdown:", error);
    // Fallback: extract plain text
    return value
      ? value.map((node) => extractText(node)).join("\n\n")
      : editor.children.map((node) => extractText(node)).join("\n\n");
  }
}

/**
 * Sanitize table nodes to ensure all rows have valid children arrays.
 * This prevents the "row.children is not iterable" error in the table plugin.
 */
function sanitizeNode(node: unknown): unknown {
  if (!node || typeof node !== "object") {
    return node;
  }

  const typedNode = node as { type?: string; children?: unknown[] };

  // If it's a table, sanitize its structure
  if (typedNode.type === "table") {
    const tableNode = node as { type: string; children?: unknown[] };
    return {
      ...tableNode,
      children: Array.isArray(tableNode.children)
        ? tableNode.children.map(sanitizeNode).filter(Boolean)
        : [],
    };
  }

  // If it's a table row, ensure it has children array
  if (typedNode.type === "tr") {
    const rowNode = node as { type: string; children?: unknown[] };
    const children = Array.isArray(rowNode.children)
      ? rowNode.children.map(sanitizeNode).filter(Boolean)
      : [];

    // If row has no cells, add an empty cell
    if (children.length === 0) {
      children.push({ type: "td", children: [{ text: "" }] });
    }

    return {
      ...rowNode,
      children,
    };
  }

  // If it's a table cell, ensure it has children
  if (typedNode.type === "td" || typedNode.type === "th") {
    const cellNode = node as { type: string; children?: unknown[] };
    const children = Array.isArray(cellNode.children)
      ? cellNode.children.map(sanitizeNode).filter(Boolean)
      : [];

    // If cell has no content, add empty text
    if (children.length === 0) {
      children.push({ text: "" });
    }

    return {
      ...cellNode,
      children,
    };
  }

  // For other nodes with children, recursively sanitize
  if (Array.isArray(typedNode.children)) {
    return {
      ...typedNode,
      children: typedNode.children.map(sanitizeNode).filter(Boolean),
    };
  }

  return node;
}

/**
 * Sanitize all nodes in the value array
 */
function sanitizeValue(value: Value): Value {
  return value.map((node) => sanitizeNode(node)).filter(Boolean) as Value;
}

/**
 * Deserialize Markdown string to Plate editor value
 *
 * @param editor - The Plate editor instance
 * @param markdown - Markdown string to parse
 * @returns Plate editor value (array of nodes)
 */
export function markdownToPlate(editor: PlateEditor, markdown: string): Value {
  try {
    if (!markdown || markdown.trim() === "") {
      return [{ type: "p", children: [{ text: "" }] }];
    }

    const result = deserializeMd(editor, markdown);

    // Ensure we have at least one valid node
    if (!result || result.length === 0) {
      return [{ type: "p", children: [{ text: "" }] }];
    }

    // Sanitize table nodes to prevent rendering errors
    return sanitizeValue(result);
  } catch (error) {
    logger.error("Error deserializing markdown:", error);
    // Fallback: wrap in paragraph
    return markdown.split("\n\n").map((paragraph) => ({
      type: "p",
      children: [{ text: paragraph }],
    }));
  }
}

/**
 * Extract plain text from a Plate node (recursive)
 */
function extractText(node: unknown): string {
  if (typeof node === "string") return node;

  if (node && typeof node === "object") {
    if ("text" in node && typeof (node as { text: unknown }).text === "string") {
      return (node as { text: string }).text;
    }

    if ("children" in node && Array.isArray((node as { children: unknown[] }).children)) {
      return (node as { children: unknown[] }).children.map(extractText).join("");
    }
  }

  return "";
}

/**
 * Create an empty document value for the editor
 */
export function createEmptyDocument(): Value {
  return [{ type: "p", children: [{ text: "" }] }];
}

/**
 * Check if the editor value is empty
 */
export function isDocumentEmpty(value: Value): boolean {
  if (!value || value.length === 0) return true;

  if (value.length === 1) {
    const node = value[0];
    if (node && typeof node === "object" && "children" in node) {
      const children = (node as { children: unknown[] }).children;
      if (children.length === 0) return true;
      if (children.length === 1) {
        const child = children[0];
        if (child && typeof child === "object" && "text" in child) {
          return (child as { text: string }).text.trim() === "";
        }
      }
    }
  }

  return false;
}
