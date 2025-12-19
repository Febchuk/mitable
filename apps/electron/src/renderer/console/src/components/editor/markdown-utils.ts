/**
 * Markdown Serialization Utilities
 *
 * Converts between Plate editor JSON and Markdown strings for storage.
 */

import type { Value } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { deserializeMd, serializeMd } from '@platejs/markdown';

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
    console.error('Error serializing to markdown:', error);
    // Fallback: extract plain text
    return value
      ? value.map((node) => extractText(node)).join('\n\n')
      : editor.children.map((node) => extractText(node)).join('\n\n');
  }
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
    if (!markdown || markdown.trim() === '') {
      return [{ type: 'p', children: [{ text: '' }] }];
    }

    const result = deserializeMd(editor, markdown);

    // Ensure we have at least one valid node
    if (!result || result.length === 0) {
      return [{ type: 'p', children: [{ text: '' }] }];
    }

    return result;
  } catch (error) {
    console.error('Error deserializing markdown:', error);
    // Fallback: wrap in paragraph
    return markdown.split('\n\n').map((paragraph) => ({
      type: 'p',
      children: [{ text: paragraph }],
    }));
  }
}

/**
 * Extract plain text from a Plate node (recursive)
 */
function extractText(node: unknown): string {
  if (typeof node === 'string') return node;

  if (node && typeof node === 'object') {
    if ('text' in node && typeof (node as { text: unknown }).text === 'string') {
      return (node as { text: string }).text;
    }

    if ('children' in node && Array.isArray((node as { children: unknown[] }).children)) {
      return (node as { children: unknown[] }).children.map(extractText).join('');
    }
  }

  return '';
}

/**
 * Create an empty document value for the editor
 */
export function createEmptyDocument(): Value {
  return [{ type: 'p', children: [{ text: '' }] }];
}

/**
 * Check if the editor value is empty
 */
export function isDocumentEmpty(value: Value): boolean {
  if (!value || value.length === 0) return true;

  if (value.length === 1) {
    const node = value[0];
    if (node && typeof node === 'object' && 'children' in node) {
      const children = (node as { children: unknown[] }).children;
      if (children.length === 0) return true;
      if (children.length === 1) {
        const child = children[0];
        if (child && typeof child === 'object' && 'text' in child) {
          return (child as { text: string }).text.trim() === '';
        }
      }
    }
  }

  return false;
}
