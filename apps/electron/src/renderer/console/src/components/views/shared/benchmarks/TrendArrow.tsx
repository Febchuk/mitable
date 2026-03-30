import { Minus, TrendingDown, TrendingUp } from "lucide-react";

interface TrendArrowProps {
  trend: "improving" | "declining" | "stable" | "new";
  delta: number;
}

export function TrendArrow({ trend, delta }: TrendArrowProps) {
  if (trend === "new") {
    return (
      <span className="text-[12px] font-medium" style={{ color: "#82C0CC" }}>
        New
      </span>
    );
  }

  if (trend === "stable") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] font-medium"
        style={{ color: "#6B665C" }}
      >
        <Minus size={14} strokeWidth={2} />
        0%
      </span>
    );
  }

  if (trend === "improving") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] font-medium"
        style={{ color: "#3A9B6B" }}
      >
        <TrendingUp size={14} strokeWidth={2} />
        +{Math.abs(delta)}%
      </span>
    );
  }

  // declining
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-medium"
      style={{ color: "#D4A27A" }}
    >
      <TrendingDown size={14} strokeWidth={2} />
      -{Math.abs(delta)}%
    </span>
  );
}
