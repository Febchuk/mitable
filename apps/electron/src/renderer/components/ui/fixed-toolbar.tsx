"use client";

import { cn } from "@/lib/utils";

import { Toolbar } from "./toolbar";

export function FixedToolbar(props: React.ComponentProps<typeof Toolbar>) {
  return (
    <Toolbar
      {...props}
      className={cn(
        "sticky top-0 left-0 z-50 w-full justify-between flex-wrap border-b border-border/50 bg-transparent px-1 py-1.5 text-foreground",
        props.className
      )}
    />
  );
}
