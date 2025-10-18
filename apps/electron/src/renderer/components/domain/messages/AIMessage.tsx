interface AIMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function AIMessage({ content, isStreaming = false }: AIMessageProps) {
  return (
    <div className="mb-6 px-4">
      <p className="text-text-primary text-sm leading-relaxed">
        {content}
        {isStreaming && <span className="inline-block w-1 h-4 ml-1 bg-primary animate-pulse" />}
      </p>
    </div>
  );
}
