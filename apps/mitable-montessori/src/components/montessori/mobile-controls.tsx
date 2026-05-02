"use client";

import * as React from "react";
import { OnlineToggle } from "./online-toggle";

export function MobileTopRight({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="lg:hidden"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 15,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <OnlineToggle compact />
      {children}
    </div>
  );
}
