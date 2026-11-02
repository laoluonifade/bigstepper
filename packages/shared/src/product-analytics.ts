/** Only coarse product areas cross the analytics boundary; never return raw paths or query strings. */
export function productScreen(path: string): string | null {
  if (/[?#]/.test(path)) return null;
  if (path === '/' || path === '/dashboard') return 'home';
  if (path === '/events') return 'event_list';
  if (/^\/events\/(?!edit$|guests$|scan$)[a-zA-Z0-9_-]+$/.test(path))
    return 'event_detail';
  if (path === '/clubs') return 'club_list';
  if (/^\/clubs\/[a-zA-Z0-9_-]+$/.test(path)) return 'club_detail';
  if (path === '/competitions') return 'competition_list';
  if (/^\/competitions\/(?!new$)[a-zA-Z0-9_-]+$/.test(path))
    return 'competition_detail';
  if (path === '/activities') return 'activity';
  if (path === '/business') return 'business';
  if (path === '/learn' || /^\/learn\/[a-z0-9-]+$/.test(path)) return 'guides';
  return null;
}
