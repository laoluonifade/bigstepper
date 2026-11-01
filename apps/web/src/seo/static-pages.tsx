import { renderToStaticMarkup } from 'react-dom/server';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { BusinessSection } from '../components/BusinessSection';
import { LandingHero } from '../components/LandingHero';
export async function renderStatic(path: string) {
  const component = path === '/business' ? BusinessSection : LandingHero;
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
