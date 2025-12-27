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

  // Quill toolbar configuration
  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link"],
      ["clean"],
    ],
  };

  const formats = ["header", "bold", "italic", "underline", "strike", "list", "bullet", "link"];

  return (
    <div className="h-full flex flex-col quill-dark-theme">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={editorValue}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
        className="h-full flex flex-col [&_.ql-container]:flex-1 [&_.ql-editor]:h-full [&_.ql-editor]:text-text-primary [&_.ql-editor]:bg-background-elevated [&_.ql-toolbar]:bg-background-elevated [&_.ql-toolbar]:border-border-subtle [&_.ql-container]:border-border-subtle [&_.ql-stroke]:stroke-text-secondary [&_.ql-fill]:fill-text-secondary [&_.ql-picker-label]:text-text-secondary [&_.ql-editor]:placeholder:text-text-tertiary [&_.ql-toolbar_.ql-active]:text-primary [&_.ql-toolbar_.ql-active_.ql-stroke]:stroke-primary [&_.ql-toolbar_.ql-active_.ql-fill]:fill-primary"
      />
    </div>
  );
}
