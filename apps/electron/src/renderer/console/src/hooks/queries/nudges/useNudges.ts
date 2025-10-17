import { useQuery } from '@tanstack/react-query';
import { fetchNudges } from '../../../services/nudgesService';
import { useUser } from '../../../context/UserContext';

export function useNudges() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['nudges', user?.id],
    queryFn: async () => {
      const data = await fetchNudges();

      // Parse date strings to Date objects
      return data.nudges.map((nudge) => ({
        ...nudge,
        timestamp: new Date(nudge.timestamp),
        acceptedAt: nudge.acceptedAt ? new Date(nudge.acceptedAt) : null,
        resolvedAt: nudge.resolvedAt ? new Date(nudge.resolvedAt) : null,
        status: nudge.status as "waiting" | "accepted" | "declined" | "resolved",
      }));
    },
    enabled: !!user,
  });
}
