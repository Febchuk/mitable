"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Download, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canInstall, onInstallability, promptInstall } from "@/lib/pwa/register";

type Network = "online" | "offline" | "weak";

/** Reads navigator.connection where available; falls back to online/offline. */
function readNetwork(): Network {
  if (typeof navigator === "undefined") return "online";
  if (!navigator.onLine) return "offline";
  type NavigatorWithConnection = {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const conn = (navigator as unknown as NavigatorWithConnection).connection;
  if (!conn) return "online";
  if (conn.saveData) return "weak";
  if (conn.effectiveType && /^(slow-2g|2g)$/i.test(conn.effectiveType)) return "weak";
  return "online";
}

export function ConnectionStatus() {
  const [network, setNetwork] = useState<Network>("online");
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    setNetwork(readNetwork());
    const onChange = () => setNetwork(readNetwork());
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    type NavigatorWithConnection = {
      connection?: EventTarget & { effectiveType?: string; saveData?: boolean };
    };
    const conn = (navigator as unknown as NavigatorWithConnection).connection;
    conn?.addEventListener?.("change", onChange);
    setInstallable(canInstall());
    const off = onInstallability(setInstallable);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      conn?.removeEventListener?.("change", onChange);
      off();
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {installable ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void promptInstall()}
          aria-label="Install Mitable"
        >
          <Download className="h-3 w-3" />
          Install
        </Button>
      ) : null}
      {network === "offline" ? (
        <Badge variant="outline" className="gap-1">
          <WifiOff className="h-3 w-3" />
          Offline
        </Badge>
      ) : network === "weak" ? (
        <Badge variant="butter" className="gap-1">
          <Wifi className="h-3 w-3" />
          Weak network
        </Badge>
      ) : (
        <Badge variant="sage" className="gap-1">
          <Cloud className="h-3 w-3" />
          Online
        </Badge>
      )}
      {/* Mirror the PendingBadge icon when offline, even if pending count is zero. */}
      {network === "offline" ? (
        <span className="hidden text-xs text-ink/40 sm:inline" aria-hidden="true">
          <CloudOff className="inline h-3 w-3" />
        </span>
      ) : null}
    </div>
  );
}
