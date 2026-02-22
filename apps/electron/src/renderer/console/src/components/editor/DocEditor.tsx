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

import { DocEditorKit, DocEditorKitNoToolbar } from "./doc-editor-kit";
import { createEmptyDocument, markdownToPlate, plateToMarkdown } from "./markdown-utils";

// Error boundary component
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackContent?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallbackContent?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("Editor crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-canvas-overlay rounded-xl border border-stroke-subtle">
          <div className="text-ink-primary font-medium mb-2">Unable to render document</div>
          <p className="text-sm text-ink-secondary mb-4">
            The document content has formatting issues that couldn't be parsed.
          </p>
          {this.props.fallbackContent && (
            <div className="bg-canvas-muted rounded-lg p-4 max-h-96 overflow-auto">
              <pre className="text-sm text-ink-secondary whitespace-pre-wrap font-mono">
                {this.props.fallbackContent}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

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
  /** Show toolbar (default: true). Set false for clean read-only rendering. */
  showToolbar?: boolean;
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
  showToolbar = true,
}: DocEditorProps) {
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = React.useRef<string>(initialContent);
  const editorRef = React.useRef<PlateEditor | null>(null);

  // Parse initial markdown to Plate value
  const initialValue = React.useMemo(() => {
    return createEmptyDocument();
  }, []);

  const editor = usePlateEditor({
    plugins: showToolbar ? DocEditorKit : DocEditorKitNoToolbar,
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
    <EditorErrorBoundary fallbackContent={initialContent}>
      <Plate editor={editor} onChange={handleChange}>
        <EditorContainer className={className}>
          <Editor variant={variant} readOnly={readOnly} placeholder={placeholder} />
        </EditorContainer>
      </Plate>
    </EditorErrorBoundary>
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
