interface EmptyStateProps {
  userName: string;
}

function EmptyState({ userName }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <h1 className="text-2xl font-semibold text-white mb-2">
        Hi {userName},
      </h1>
      <h2 className="text-xl font-medium text-white mb-3">
        Welcome back! How can I help?
      </h2>
      <p className="text-white/60 text-sm max-w-sm">
        I'm here to help you tackle your tasks effortlessly. Just tell me what
        you need, and I'll take care of it!
      </p>
    </div>
  );
}

export default EmptyState;
