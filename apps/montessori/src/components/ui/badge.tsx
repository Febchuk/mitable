import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
    {
        variants: {
            variant: {
                default: "border-stroke-subtle bg-canvas-overlay text-ink-secondary",
                accent: "border-accent-border bg-accent-bg text-accent",
                success:
                    "border-[rgba(var(--status-success-rgb),0.28)] bg-[rgba(var(--status-success-rgb),0.14)] text-status-success",
                warning:
                    "border-[rgba(var(--status-warning-rgb),0.28)] bg-[rgba(var(--status-warning-rgb),0.14)] text-status-warning",
                error:
                    "border-[rgba(var(--status-error-rgb),0.28)] bg-[rgba(var(--status-error-rgb),0.14)] text-status-error",
                outline: "border-stroke text-ink-secondary bg-transparent",
            },
        },
        defaultVariants: { variant: "default" },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
