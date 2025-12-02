import { $api } from '@/shared/api';

/**
 * Hook to fetch about page content
 * Returns HTML text that should be sanitized before rendering
 */
export function useAboutQuery() {
  return $api.useQuery('get', '/about', {
    parseAs: 'text',
  });
}
