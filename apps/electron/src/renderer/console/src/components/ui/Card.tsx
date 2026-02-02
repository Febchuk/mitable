import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
  variant?: "default" | "elevated" | "accent";
}

export default function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
  onClick,
  variant = "default",
}: CardProps) {
  const paddingStyles = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const variantStyles = {
    default: "bg-canvas-raised border-stroke-subtle",
    elevated: "bg-canvas-overlay border-stroke",
    accent: "bg-indigo/5 border-indigo/20",
  };

  const hoverStyles = hover
    ? "hover:-translate-y-0.5 hover:shadow-lg hover:border-stroke cursor-pointer transition-all duration-normal"
    : "";

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${hoverStyles}
        ${className}
      `}
      onClick={onClick}
    >
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />

      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  );
}
