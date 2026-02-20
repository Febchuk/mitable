"use client";

/**
 * Document Editor Kit
 *
 * A simplified Plate editor configuration optimized for document editing.
 * Includes essential formatting, AI features, and markdown support.
 */

import { TrailingBlockPlugin } from "platejs";

import { AIKit } from "@/components/editor/plugins/ai-kit";
import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit";
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit";
import { BlockMenuKit } from "@/components/editor/plugins/block-menu-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { CursorOverlayKit } from "@/components/editor/plugins/cursor-overlay-kit";
import { ExitBreakKit } from "@/components/editor/plugins/exit-break-kit";
import { FixedToolbarKit } from "@/components/editor/plugins/fixed-toolbar-kit";
import { FloatingToolbarKit } from "@/components/editor/plugins/floating-toolbar-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";

/**
 * DocEditorKit - Plugins for document editing
 *
 * Includes:
 * - AI features (⌘+J for AI menu)
 * - Basic blocks (headings, paragraphs, blockquotes, horizontal rules)
 * - Basic marks (bold, italic, underline, strikethrough, code)
 * - Lists (bullet, numbered, task lists)
 * - Tables
 * - Code blocks
 * - Links
 * - Markdown parsing/serialization
 * - Autoformat (markdown shortcuts like ## for h2)
 * - Floating toolbar
 * - Slash commands (/)
 * - Block menu (drag handle)
 */
export const DocEditorKit = [
  // AI features - ⌘+J to open AI menu
  ...AIKit,

  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...LinkKit,

  // Marks
  ...BasicMarksKit,

  // Block Style
  ...ListKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...MarkdownKit,

  // UI
  ...FixedToolbarKit,
  ...FloatingToolbarKit,
];

/** Same as DocEditorKit but without toolbar plugins — for clean read-only rendering */
export const DocEditorKitNoToolbar = [
  ...AIKit,
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...LinkKit,
  ...BasicMarksKit,
  ...ListKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,
  ...MarkdownKit,
];
