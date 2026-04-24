import * as React from "react";

import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
    name: string;
    size?: "xs" | "sm" | "md" | "lg";
    tone?: "default" | "accent" | "muted";
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
};

const TONES: Record<NonNullable<AvatarProps["tone"]>, string> = {
    default: "bg-canvas-overlay border-stroke-subtle text-ink-primary",
    accent: "bg-accent-bg border-accent-border text-accent",
    muted: "bg-canvas-muted border-stroke-subtle text-ink-secondary",
};

function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
    ({ className, name, size = "sm", tone = "default", ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "inline-flex items-center justify-center rounded-full border font-semibold select-none",
                SIZES[size],
                TONES[tone],
                className
            )}
            aria-label={name}
            {...props}
        >
            {initials(name)}
        </div>
    )
);
Avatar.displayName = "Avatar";
