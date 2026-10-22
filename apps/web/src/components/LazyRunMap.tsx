import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { cx } from './ui';

// MapLibre is large; load it only on screens that show a map.
const RunMapImpl = lazy(() => import('./RunMap').then((module) => ({ default: module.RunMap })));

export type { LatLng, LivePosition } from './RunMap';

/** A map problem (no WebGL, chunk failed to load) must never take the run screen down with it. */
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RunMap(props: ComponentProps<typeof RunMapImpl>) {
  const blank = <div className={cx('bg-[#e8e6e1]', props.className)} />;
  return <MapBoundary fallback={blank}>
    <Suspense fallback={<div className={cx('animate-pulse bg-[#e8e6e1]', props.className)} />}>
      <RunMapImpl {...props} />
    </Suspense>
  </MapBoundary>;
}

/** The route drawn on the map as an image, for share cards; loads the map code on first use. */
export async function renderRouteMap(...args: Parameters<typeof import('./RunMap').renderRouteMap>) {
  const module = await import('./RunMap');
  return module.renderRouteMap(...args);
}
