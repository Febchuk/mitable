import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
  onClick,
}: CardProps) {
  const paddingStyles = {
    sm: "p-sm",
    md: "p-md",
    lg: "p-lg",
  };

  const hoverStyles = hover
    ? "hover:bg-background-elevated cursor-pointer transition-colors"
    : "";

  return (
    <div
      className={`bg-background-secondary border border-border rounded-lg ${paddingStyles[padding]} ${hoverStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
