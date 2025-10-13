import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  children?: ReactNode;
}

export default function MetricCard({ label, value, description, children }: MetricCardProps) {
  return (
    <div className="bg-[#2A2A2A] rounded-xl p-6 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-white font-semibold text-base">{label}</h3>
        {description && <p className="text-text-secondary text-sm">{description}</p>}
      </div>

      {/* Value or Custom Content */}
      {children ? (
        children
      ) : (
        <div className="text-white font-bold text-4xl">{value}</div>
      )}
    </div>
  );
}
