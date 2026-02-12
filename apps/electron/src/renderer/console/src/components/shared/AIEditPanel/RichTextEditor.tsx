/**
 * RichTextEditor
 *
 * Quill-based rich text editor with Word-like toolbar.
 * Supports formatting: bold, italic, underline, strikethrough, lists, headings, links.
 */

import { useEffect, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

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
  const quillRef = useRef<ReactQuill>(null);
  const [editorValue, setEditorValue] = useState(content);

  // Sync external changes (like AI suggestions)
  useEffect(() => {
    setEditorValue(content);
  }, [content]);

  const handleChange = (value: string) => {
    setEditorValue(value);
    onChange(value);
  };

  // Simplified toolbar — clean, Notion-inspired
  const modules = {
    toolbar: [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link"]],
  };

  const formats = ["header", "bold", "italic", "underline", "list", "bullet", "link"];

  return (
    <div className="h-full flex flex-col quill-editor-clean">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={editorValue}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
        className="h-full flex flex-col [&_.ql-container]:flex-1 [&_.ql-editor]:h-full [&_.ql-editor]:overflow-y-auto"
      />
    </div>
  );
}
