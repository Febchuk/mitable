"use client";

import * as React from "react";

import {
  type FloatingToolbarState,
  flip,
  offset,
  useFloatingToolbar,
  useFloatingToolbarState,
} from "@platejs/floating";
import { useComposedRef } from "@udecode/cn";
import { KEYS } from "platejs";
import { useEditorId, useEventEditorValue, usePluginOption } from "platejs/react";

import { cn } from "@/lib/utils";

import { Toolbar } from "./toolbar";

export const FloatingToolbar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof Toolbar> & {
    state?: FloatingToolbarState;
  }
>(({ children, className, state, ...props }, forwardedRef) => {
  const editorId = useEditorId();
  const focusedEditorId = useEventEditorValue("focus");
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, "mode");
  const isAIChatOpen = usePluginOption({ key: KEYS.aiChat }, "open");

  const floatingToolbarState = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: isFloatingLinkOpen || isAIChatOpen,
    ...state,
    floatingOptions: {
      middleware: [
        offset(12),
        flip({
          fallbackPlacements: ["top-start", "top-end", "bottom-start", "bottom-end"],
          padding: 12,
        }),
      ],
      placement: "top",
      ...state?.floatingOptions,
    },
  });

  const {
    clickOutsideRef,
    hidden,
    props: rootProps,
    ref: floatingRef,
  } = useFloatingToolbar(floatingToolbarState);

  const ref = useComposedRef<HTMLDivElement>(forwardedRef, floatingRef);

  if (hidden) return null;

  return (
    <div ref={clickOutsideRef}>
      <Toolbar
        {...props}
        {...rootProps}
        ref={ref}
        className={cn(
          "absolute z-50 whitespace-nowrap rounded-xl border border-border/50 bg-popover p-1 opacity-100 shadow-lg print:hidden",
          className
        )}
      >
        {children}
      </Toolbar>
    </div>
  );
});
FloatingToolbar.displayName = "FloatingToolbar";
