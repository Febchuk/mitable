type Category = "productivity" | "collaboration" | "growth" | "quality";

interface CategoryBadgeProps {
  category: Category;
}

const CATEGORY_CONFIG: Record<Category, { label: string; className: string }> =
  {
    productivity: {
      label: "Productivity",
      className: "text-[#82C0CC] bg-[#82C0CC]/10",
    },
    collaboration: {
      label: "Collaboration",
      className: "text-[#3A9B6B] bg-[#3A9B6B]/10",
    },
    growth: {
      label: "Growth",
      className: "text-[#D4A27A] bg-[#D4A27A]/10",
    },
    quality: {
      label: "Quality",
      className: "text-[#4A9FD9] bg-[#4A9FD9]/10",
    },
  };

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const { label, className } = CATEGORY_CONFIG[category];

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.09em] ${className}`}
    >
      {label}
    </span>
  );
}
