/**
 * RichTextEditor
 *
 * MDXEditor-based rich text editor with clean toolbar.
 * Native markdown input/output — no HTML conversion needed.
 */

import { useRef, useEffect } from "react";
import {
  MDXEditor,
  MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  CreateLink,
  Separator,
  markdownShortcutPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = "Write your content here...",
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

  // Sync external changes (like AI suggestions) via ref
  useEffect(() => {
    editorRef.current?.setMarkdown(content);
  }, [content]);

  return (
    <div className="h-full flex flex-col mdx-editor-wrapper">
      <MDXEditor
        ref={editorRef}
        markdown={content}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={disabled}
        className="dark-theme dark-editor h-full"
        contentEditableClassName="prose prose-invert prose-sm max-w-none px-6 py-4 min-h-full focus:outline-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <BoldItalicUnderlineToggles />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
