export type SeoMetadata = {
  title: string;
  description: string;
  path: string;
  indexable: boolean;
  image?: string | null;
  jsonLd: Record<string, unknown>[];
  status: number;
};
export function isSeoPath(path: string) {
  return (
    [
      '/',
      '/business',
      '/brands',
      '/competitions',
      '/events',
      '/running-events',
      '/running-clubs',
      '/step-challenges',
      '/virtual-fitness-challenges',
    ].includes(path) ||
    (/^\/(events|clubs|competitions)\/[a-zA-Z0-9_-]+$/.test(path) &&
      path !== '/competitions/new') ||
    /^\/running-(clubs|events)\/in\/[a-z0-9-]+$/.test(path)
  );
}
