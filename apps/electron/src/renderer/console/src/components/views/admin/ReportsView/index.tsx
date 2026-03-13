import { FileText } from "lucide-react";

export default function ReportsView() {
  return (
    <div className="h-full overflow-y-auto p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-4xl font-bold text-text-primary">Reports</h1>
        <p className="text-sm text-text-secondary mt-1">Generate and view team reports</p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo/10 flex items-center justify-center mx-auto">
            <FileText size={32} className="text-indigo-light" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Coming Soon</h2>
            <p className="text-sm text-text-secondary mt-1 max-w-sm">
              Team reports will be available here. For now, you can generate reports through the Ask
              tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
