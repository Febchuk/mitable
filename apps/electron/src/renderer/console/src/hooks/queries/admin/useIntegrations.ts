import { useQuery } from '@tanstack/react-query';
import { fetchIntegrations } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useIntegrations() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: fetchIntegrations,
    enabled: !!user && user.role === 'admin',
  });
}
