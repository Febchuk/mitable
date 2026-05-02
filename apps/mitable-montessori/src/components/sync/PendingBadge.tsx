"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/schema";

export function PendingBadge() {
  const count = useLiveQuery(
    async () => {
      const all = await getDb().commands.where("status").equals("approved").toArray();
      return all.filter((c) => !c.syncedAt).length;
    },
    [],
    0
  );

  if (!count) return null;

  return (
    <Badge variant="butter" className="gap-1">
      <CloudOff className="h-3 w-3" />
      {count} pending
    </Badge>
  );
}
