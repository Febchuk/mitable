/**
 * Local Activity Hooks
 *
 * React Query hooks for the Me tab, reading activity blocks
 * and daily summaries from PGlite via IPC.
 *
 * Auto-refreshes when the block aggregator broadcasts "me-activity:updated".
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../context/UserContext";

export type MeActivityPeriod = "yesterday" | "week" | "month" | "quarter";

export interface ActivityBlock {
  id: string;
  sessionId: string;
  narrative: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  date: string;
  topCategory: string | null;
  topApp: string | null;
}

export interface DailySummaryEntry {
  date: string;
  totalActiveMs: number;
  sessionCount: number;
  categoryBreakdown: Record<string, number>;
}

export interface MeActivityData {
  totalActiveMs: number;
  categoryBreakdown: Record<string, number>;
  appBreakdown: Record<string, number>;
  clientBreakdown: Record<string, number>;
  dailySummaries: DailySummaryEntry[];
  recentBlocks: ActivityBlock[];
  period: string;
  startDate: string;
  endDate: string;
}

export const localActivityKeys = {
  all: ["local-activity"] as const,
  activity: (period: string) => [...localActivityKeys.all, period] as const,
};

export function useLocalActivity(period: MeActivityPeriod = "week") {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Auto-refresh when block aggregator finishes a new session
  useEffect(() => {
    const unsubscribe = window.consoleAPI.onMeActivityUpdated?.(() => {
      queryClient.invalidateQueries({ queryKey: localActivityKeys.all });
    });
    return () => unsubscribe?.();
  }, [queryClient]);

  return useQuery<MeActivityData>({
    queryKey: localActivityKeys.activity(period),
    queryFn: async (): Promise<MeActivityData> => {
      const result = await window.consoleAPI.getMyActivity?.(user!.id, period);
      if (!result) {
        return {
          totalActiveMs: 0,
          categoryBreakdown: {},
          appBreakdown: {},
          clientBreakdown: {},
          dailySummaries: [],
          recentBlocks: [],
          period,
          startDate: "",
          endDate: "",
        };
      }
      return result as MeActivityData;
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
