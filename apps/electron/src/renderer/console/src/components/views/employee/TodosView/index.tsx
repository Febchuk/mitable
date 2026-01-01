import { CheckSquare } from "lucide-react";

export default function TodosView() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center">
      <div className="text-text-tertiary mb-4">
        <CheckSquare size={48} strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-text-primary mb-2">Todos</h1>
      <p className="text-text-secondary">Coming soon...</p>
    </div>
  );
}
