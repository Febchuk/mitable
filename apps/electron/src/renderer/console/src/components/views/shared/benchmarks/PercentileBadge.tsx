type Percentile = "top_1" | "top_10" | "top_25" | "top_50" | "bottom_half";

interface PercentileBadgeProps {
  percentile: Percentile;
}

const PERCENTILE_CONFIG: Record<
  Percentile,
  { label: string; className: string }
> = {
  top_1: {
    label: "Top 1%",
    className: "bg-[#3A9B6B]/15 text-[#3A9B6B]",
  },
  top_10: {
    label: "Top 10%",
    className: "bg-[#3A9B6B]/15 text-[#3A9B6B]",
  },
  top_25: {
    label: "Top 25%",
    className: "bg-[#4A9FD9]/15 text-[#4A9FD9]",
  },
  top_50: {
    label: "Top 50%",
    className: "bg-[#82C0CC]/10 text-[#82C0CC]",
  },
  bottom_half: {
    label: "Bottom Half",
    className: "bg-[#D4A27A]/15 text-[#D4A27A]",
  },
};

export function PercentileBadge({ percentile }: PercentileBadgeProps) {
  const { label, className } = PERCENTILE_CONFIG[percentile];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}
