import { Check, Copy } from "lucide-react";
import { ComponentProps, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export function CodeBlock({ children, className }: ComponentProps<"code">) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).trim();

  return (
    <div className="relative group mb-4">
      <CodeBlockCopyButton code={code} />
      {language && (
        <div className="absolute top-3 left-4 text-xs text-gray-400 uppercase font-mono z-10">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus as any}
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          padding: "1.5rem",
          paddingTop: language ? "2.5rem" : "1.5rem",
          fontSize: "0.875rem",
          lineHeight: "1.5",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 transition-all duration-200 h-8 w-8 rounded-md bg-[#2A2A2A] hover:bg-[#3A3A3A] flex items-center justify-center border border-gray-600 shadow-lg"
      aria-label="Copy code"
      type="button"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-400" />
      ) : (
        <Copy className="h-4 w-4 text-gray-300" />
      )}
    </button>
  );
}
