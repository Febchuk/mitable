interface AIMessageProps {
  content: string;
}

export default function AIMessage({ content }: AIMessageProps) {
  return (
    <div className="mb-6 px-4">
      <p className="text-text-primary text-sm leading-relaxed">{content}</p>
    </div>
  );
}
