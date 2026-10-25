import type {
  RouteLocationNormalizedLoaded,
  RouteLocationRaw,
} from 'vue-router';
import type { SidebarItem, SidebarRoot } from './types';

type SidebarRoute = Pick<
  RouteLocationNormalizedLoaded,
  'path' | 'params' | 'meta'
>;

export function getSidebarPath(route: SidebarRoute): string {
  const pattern = route.meta.sidebarPath;
  if (typeof pattern !== 'string') {
    return route.path;
  }

  return pattern.replace(/:(\w+)/g, (_, key: string) =>
    encodeURIComponent(String(route.params[key] ?? ''))
  );
}

export function matchesSidebarPath(
  currentPath: string,
  itemPath: string
): boolean {
  const current = decodeURI(currentPath);
  const item = decodeURI(itemPath);
  if (current === item) {
    return true;
  }

  // List titles distinguish filtered lists, but their forms share one schema.
  if (current.startsWith('/list/') && item.startsWith('/list/')) {
    return current.split('/')[2] === item.split('/')[2];
  }

  return item !== '/' && current.startsWith(item + '/');
}

export function getSidebarLocation(
  item: SidebarItem | SidebarRoot
): RouteLocationRaw {
  const { route: path, filters } = item;
  if (!filters) {
    return path;
  }

  return { path, query: { filters: JSON.stringify(filters) } };
}

export interface SidebarEntry {
  group: SidebarRoot;
  item: SidebarRoot | SidebarItem;
}

/**
 * The entry that owns the route: its exact path first, else a list of its
 * schema, `previous` when it is one, as a payment opened from Purchase Payment
 * stays under it.
 */
export function findSidebarEntry(
  groups: SidebarRoot[],
  route: SidebarRoute,
  previous?: SidebarEntry
): SidebarEntry | undefined {
  const path = getSidebarPath(route);
  const exactPath = decodeURI(path);
  const entries = groups.flatMap((group) =>
    (group.items ?? [group]).map((item) => ({ group, item }))
  );
  const matching = entries.filter(({ item }) =>
    matchesSidebarPath(path, item.route)
  );

  return (
    entries.find(({ item }) => decodeURI(item.route) === exactPath) ??
    matching.find(({ item }) => item === previous?.item) ??
    matching[0]
  );
}
