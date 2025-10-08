import { ButtonHTMLAttributes } from "react";
import { LucideIcon } from "lucide-react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: number;
}

export default function IconButton({
  icon: Icon,
  label,
  size = 20,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`p-sm rounded-md text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={size} />
    </button>
  );
}
