import { useQuery } from '@tanstack/react-query';
import { fetchTemplates } from '../../../services/adminService';
import { useUser } from '../../../context/UserContext';

export function useTemplates() {
  const { user } = useUser();

  return useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: fetchTemplates,
    enabled: !!user && user.role === 'admin',
  });
}
