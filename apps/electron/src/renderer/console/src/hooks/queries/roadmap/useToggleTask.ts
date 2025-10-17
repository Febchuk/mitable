import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleTaskCompletion } from '../../../services/roadmapService';
import { useUser } from '../../../context/UserContext';
import type { Week } from '../../../types';

export function useToggleTask() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: ({ taskId, completed }: { taskId: string; completed: boolean }) =>
      toggleTaskCompletion(taskId, completed),

    // Optimistic update
    onMutate: async ({ taskId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['roadmap', user?.id] });

      // Snapshot previous value
      const previousRoadmap = queryClient.getQueryData(['roadmap', user?.id]);

      // Optimistically update
      queryClient.setQueryData(['roadmap', user?.id], (old: any) => {
        if (!old) return old;

        const updatedWeeks = old.weeks.map((week: Week) => {
          const updatedTasks = week.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
          );

          const completedCount = updatedTasks.filter((t) => t.completed).length;
          const totalCount = updatedTasks.length;
          const newPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          return {
            ...week,
            tasks: updatedTasks,
            percentage: newPercentage,
          };
        });

        return { ...old, weeks: updatedWeeks };
      });

      return { previousRoadmap };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousRoadmap) {
        queryClient.setQueryData(['roadmap', user?.id], context.previousRoadmap);
      }
    },

    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmap', user?.id] });
    },
  });
}
