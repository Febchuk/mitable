"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { ToastBus } from "./primitives";
import { useMontessori } from "./store";

export function InstallBanner() {
  const store = useMontessori();
  if (!store.installVisible) return null;

  return (
    <div
      className="anim-slide-up"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 50,
        background: "var(--color-ink)",
        color: "var(--color-surface)",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 340,
        boxShadow: "0 16px 36px rgba(42,39,35,0.28)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--color-terracotta)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Download size={18} strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.4 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Install Mitable</div>
        <div style={{ opacity: 0.75 }}>Add to home screen for offline capture.</div>
      </div>
      <button
        type="button"
        className="tap"
        onClick={() => {
          store.setInstallVisible(false);
          ToastBus.push({
            message: "Mitable added to home screen",
            icon: <Download size={12} strokeWidth={1.5} />,
          });
        }}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          border: 0,
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Install
      </button>
      <button
        type="button"
        className="tap"
        onClick={() => store.setInstallVisible(false)}
        style={{
          background: "transparent",
          color: "var(--color-surface)",
          border: 0,
          opacity: 0.6,
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
