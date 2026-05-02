"use client";

import * as React from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useMontessori } from "./store";

export function OnlineToggle({ compact = false }: { compact?: boolean }) {
  const store = useMontessori();
  return (
    <button
      type="button"
      className="tap"
      onClick={() => store.setOnline((o) => !o)}
      title="Toggle online/offline"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "5px 9px" : "6px 11px",
        borderRadius: 999,
        background: store.online ? "var(--color-sage-soft)" : "var(--color-clay-soft)",
        color: store.online ? "var(--color-sage-deep)" : "var(--color-terracotta-deep)",
        border: "1px solid transparent",
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
      }}
    >
      {store.online ? (
        <Wifi size={13} strokeWidth={1.5} />
      ) : (
        <WifiOff size={13} strokeWidth={1.5} />
      )}
      {store.online ? "Online" : "Offline"}
    </button>
  );
}
