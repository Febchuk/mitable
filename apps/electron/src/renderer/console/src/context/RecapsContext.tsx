/**
 * RecapsContext
 *
 * Persists recaps via the backend API, backed by React Query.
 * Exposes the same interface shape so consumers don't need changes,
 * except addRecap is now async (returns Promise<Recap>).
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import type { WorkBlock } from "../components/views/employee/CalendarView/types";
import {
  useRecapsList,
  useCreateRecap,
  useUpdateRecap,
  useAddRecapDelivery,
  useDeleteRecap as useDeleteRecapMutation,
} from "../hooks/queries/monitoring";
import type { RecapRecord } from "../services/monitoringService";

export type RecapDestination = "slack" | "gmail" | "linear" | "copy";

export interface RecapBlockSnapshot {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  summary: string;
  goal?: string;
  isFocusedSession?: boolean;
}

export interface RecapDelivery {
  destination: RecapDestination;
  sentAt: Date;
}

export interface Recap {
  id: string;
  createdAt: Date;
  title: string;
  blocks: RecapBlockSnapshot[];
  totalDuration: number;
  content: string;
  deliveries: RecapDelivery[];
}

interface RecapsContextValue {
  recaps: Recap[];
  isLoading: boolean;
  addRecap: (recap: Omit<Recap, "id" | "createdAt" | "deliveries">) => Promise<Recap>;
  addDelivery: (recapId: string, destination: RecapDestination) => Promise<void>;
  updateRecap: (
    recapId: string,
    data: Partial<Pick<Recap, "title" | "content" | "blocks" | "totalDuration">>
  ) => Promise<void>;
  deleteRecap: (id: string) => Promise<void>;
  getRecap: (id: string) => Recap | undefined;
}

const RecapsContext = createContext<RecapsContextValue | null>(null);

/** Snapshot a WorkBlock into the lightweight shape stored in a recap */
export function snapshotBlock(block: WorkBlock): RecapBlockSnapshot {
  return {
    id: block.id,
    startTime: block.startTime,
    endTime: block.endTime,
    duration: block.duration,
    summary: block.summary,
    goal: block.goal,
    isFocusedSession: block.isFocusedSession,
  };
}

/** Convert a backend RecapRecord (ISO strings) into a frontend Recap (Date objects) */
function toRecap(row: RecapRecord): Recap {
  const blocks = (Array.isArray(row.blocks) ? row.blocks : []) as Array<Record<string, unknown>>;
  const deliveries = (Array.isArray(row.deliveries) ? row.deliveries : []) as Array<
    Record<string, unknown>
  >;

  return {
    id: row.id,
    createdAt: new Date(row.createdAt),
    title: row.title,
    content: row.content,
    totalDuration: row.totalDuration,
    blocks: blocks.map((b) => ({
      id: String(b.id ?? ""),
      startTime: new Date(b.startTime as string),
      endTime: b.endTime ? new Date(b.endTime as string) : null,
      duration: Number(b.duration ?? 0),
      summary: String(b.summary ?? ""),
      goal: b.goal ? String(b.goal) : undefined,
      isFocusedSession: b.isFocusedSession ? Boolean(b.isFocusedSession) : undefined,
    })),
    deliveries: deliveries.map((d) => ({
      destination: String(d.destination ?? "copy") as RecapDestination,
      sentAt: new Date(d.sentAt as string),
    })),
  };
}

/** Serialize blocks/deliveries for the API (Date → ISO string) */
function serializeBlocks(blocks: RecapBlockSnapshot[]): unknown[] {
  return blocks.map((b) => ({
    ...b,
    startTime: b.startTime instanceof Date ? b.startTime.toISOString() : b.startTime,
    endTime: b.endTime instanceof Date ? b.endTime.toISOString() : b.endTime,
  }));
}

export function RecapsProvider({ children }: { children: ReactNode }) {
  const { data: rows, isLoading } = useRecapsList();
  const createMutation = useCreateRecap();
  const updateMutation = useUpdateRecap();
  const deliveryMutation = useAddRecapDelivery();
  const deleteMutation = useDeleteRecapMutation();

  const recaps: Recap[] = (rows ?? []).map(toRecap);

  const addRecap = useCallback(
    async (data: Omit<Recap, "id" | "createdAt" | "deliveries">): Promise<Recap> => {
      const result = await createMutation.mutateAsync({
        title: data.title,
        content: data.content,
        blocks: serializeBlocks(data.blocks),
        totalDuration: data.totalDuration,
      });
      return toRecap(result.recap);
    },
    [createMutation]
  );

  const addDelivery = useCallback(
    async (recapId: string, destination: RecapDestination): Promise<void> => {
      await deliveryMutation.mutateAsync({ id: recapId, destination });
    },
    [deliveryMutation]
  );

  const updateRecap = useCallback(
    async (
      recapId: string,
      data: Partial<Pick<Recap, "title" | "content" | "blocks" | "totalDuration">>
    ): Promise<void> => {
      const payload: Record<string, unknown> = {};
      if (data.title !== undefined) payload.title = data.title;
      if (data.content !== undefined) payload.content = data.content;
      if (data.blocks !== undefined) payload.blocks = serializeBlocks(data.blocks);
      if (data.totalDuration !== undefined) payload.totalDuration = data.totalDuration;
      await updateMutation.mutateAsync({ id: recapId, data: payload });
    },
    [updateMutation]
  );

  const deleteRecap = useCallback(
    async (id: string): Promise<void> => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const getRecap = useCallback((id: string) => recaps.find((r) => r.id === id), [recaps]);

  return (
    <RecapsContext.Provider
      value={{ recaps, isLoading, addRecap, addDelivery, updateRecap, deleteRecap, getRecap }}
    >
      {children}
    </RecapsContext.Provider>
  );
}

export function useRecaps() {
  const ctx = useContext(RecapsContext);
  if (!ctx) {
    throw new Error("useRecaps must be used within a RecapsProvider");
  }
  return ctx;
}
