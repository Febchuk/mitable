import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBragbook,
  saveBragbookPeriod,
  resetBragbookPeriod,
  generateBragbookPeriod,
  type BragbookView,
} from "../../services/bragbookService";
import { useUser } from "../../context/UserContext";

export function useBragbook(view: BragbookView = "weekly") {
  const { user } = useUser();
  return useQuery({
    queryKey: ["bragbook", view],
    queryFn: () => fetchBragbook(view),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveBragbookPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      periodType,
      periodStart,
      accomplishments,
    }: {
      periodType: BragbookView;
      periodStart: string;
      accomplishments: string[];
    }) => saveBragbookPeriod(periodType, periodStart, accomplishments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bragbook"] });
    },
  });
}

export function useGenerateBragbookPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodType, periodStart }: { periodType: BragbookView; periodStart: string }) =>
      generateBragbookPeriod(periodType, periodStart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bragbook"] });
    },
  });
}

export function useResetBragbookPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodType, periodStart }: { periodType: BragbookView; periodStart: string }) =>
      resetBragbookPeriod(periodType, periodStart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bragbook"] });
    },
  });
}
