"use client";

/**
 * DocEditor
 *
 * A rich text editor component for document editing using Plate UI.
 * Supports:
 * - AI-assisted editing (⌘+J)
 * - Markdown import/export
 * - Rich formatting (headings, lists, code blocks, tables)
 * - Autosave functionality
 */

import * as React from "react";

import type { Value } from "platejs";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("DocEditor");
import type { PlateEditor } from "platejs/react";

import { normalizeNodeId } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

import { Editor, EditorContainer } from "@/components/ui/editor";

import { DocEditorKit } from "./doc-editor-kit";
import { createEmptyDocument, markdownToPlate, plateToMarkdown } from "./markdown-utils";
// TODO: Re-enable when AI chat is properly configured
// import { useDocChat } from './use-doc-chat';

export interface DocEditorProps {
  /** Initial markdown content */
  initialContent?: string;
  /** Called when content changes (debounced) */
  onChange?: (markdown: string) => void;
  /** Called on explicit save (⌘+S) */
  onSave?: (markdown: string) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Document ID for AI context */
  documentId?: string;
  /** Autosave delay in ms (default: 2000) */
  autosaveDelay?: number;
  /** Editor variant (default, demo, fullWidth) */
  variant?: "default" | "demo" | "fullWidth";
  /** Custom class name */
  className?: string;
}

export function DocEditor({
  initialContent = "",
  onChange,
  onSave,
  readOnly = false,
  placeholder = "Start writing... Press / for commands or ⌘+J for AI assistance.",
  documentId: _documentId,
  autosaveDelay = 2000,
  variant = "default",
  className,
}: DocEditorProps) {
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = React.useRef<string>(initialContent);
  const editorRef = React.useRef<PlateEditor | null>(null);

  // Parse initial markdown to Plate value
  const initialValue = React.useMemo(() => {
    return createEmptyDocument();
  }, []);

  const editor = usePlateEditor({
    plugins: DocEditorKit,
    value: initialValue,
  });

  // Store editor ref
  editorRef.current = editor;

  // Initialize content from markdown after editor is ready
  React.useEffect(() => {
    if (initialContent && initialContent.trim() !== "") {
      try {
        const value = markdownToPlate(editor, initialContent);
        editor.tf.reset();
        editor.tf.setValue(normalizeNodeId(value as Value));
      } catch (error) {
        logger.error("Error loading markdown content:", error);
      }
    }
  }, []); // Only run once on mount

  // Handle content changes with autosave
  const handleChange = React.useCallback(
    ({ value }: { value: Value }) => {
      if (readOnly || !onChange) return;

      // Clear existing timer
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      // Set new timer for autosave
      autosaveTimerRef.current = setTimeout(() => {
        try {
          const markdown = plateToMarkdown(editor, value);

          // Only trigger onChange if content actually changed
          if (markdown !== lastSavedContentRef.current) {
            lastSavedContentRef.current = markdown;
            onChange(markdown);
          }
        } catch (error) {
          logger.error("Error converting to markdown:", error);
        }
      }, autosaveDelay);
    },
    [editor, onChange, readOnly, autosaveDelay]
  );

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘+S / Ctrl+S for save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (onSave && editorRef.current) {
          try {
            const markdown = plateToMarkdown(editorRef.current);
            lastSavedContentRef.current = markdown;
            onSave(markdown);
          } catch (error) {
            logger.error("Error saving markdown:", error);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave]);

  // Cleanup autosave timer on unmount
  React.useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  return (
    <Plate editor={editor} onChange={handleChange}>
      <EditorContainer className={className}>
        <Editor variant={variant} readOnly={readOnly} placeholder={placeholder} />
      </EditorContainer>
    </Plate>
  );
}

/**
 * Get the current markdown content from the editor
 * Useful for programmatic access to content
 */
export function getEditorMarkdown(editor: PlateEditor): string {
  return plateToMarkdown(editor);
}

export default DocEditor;
