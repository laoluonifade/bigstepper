import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { productScreen } from '@jump/shared/product-analytics';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { organicSource } from '../lib/organic';
export function ProductAnalytics() {
  const { user } = useAuth();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const last = useRef('');
  useEffect(() => {
    if (import.meta.env.VITE_PRODUCT_ANALYTICS_ENABLED !== 'true') return;
    if (!user) {
      last.current = '';
      return;
    }
    const screen = productScreen(path);
    const key = user.id + ':' + path;
    if (!screen || last.current === key) return;
    last.current = key;
    const source = organicSource(document.referrer);
    void post('/product-analytics/screen', {
      screen,
      platform: 'web',
      ...(source ? { source } : {}),
    }).catch(() => undefined);
  }, [user?.id, path]);
  return null;
}
