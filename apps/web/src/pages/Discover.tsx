import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { api } from '../lib/api';
import { ErrorNotice, Skeleton } from '../components/ui';
export function DiscoverPage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const page = useQuery({
    queryKey: ['public-discovery', path],
    queryFn: () =>
      api<{ body: string }>('/pages/data?path=' + encodeURIComponent(path)),
  });
  if (page.isLoading) return <Skeleton className="h-48" />;
  if (page.error) return <ErrorNotice error={page.error} />;
  // The API emits only escaped, allowlisted public markup; no user HTML, scripts, account data or tokens.
  return <div dangerouslySetInnerHTML={{ __html: page.data?.body ?? '' }} />;
}
