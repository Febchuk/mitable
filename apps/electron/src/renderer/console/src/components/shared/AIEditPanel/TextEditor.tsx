/**
 * TextEditor
 *
 * Full-height rich text editor for the left side of the AI edit panel.
 * Uses Tiptap for WYSIWYG editing with a Word-like toolbar.
 */

import RichTextEditor from "./RichTextEditor";

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function TextEditor({
  content,
  onChange,
  placeholder = "Write your content here...",
  disabled = false,
}: TextEditorProps) {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-1 overflow-hidden">
        <RichTextEditor
          content={content}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
