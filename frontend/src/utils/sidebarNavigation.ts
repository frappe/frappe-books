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
  const exactPath = decodeURI(getSidebarPath(route));
  const entries = getEntries(groups);
  const matching = getMatchingEntries(groups, route);

  return (
    entries.find(({ item }) => decodeURI(item.route) === exactPath) ??
    matching.find(({ item }) => item === previous?.item) ??
    matching[0]
  );
}

/** The filtered lists of the route's doctype, e.g. Sales and Purchase Payment. */
export function getFilteredLists(
  groups: SidebarRoot[],
  route: SidebarRoute
): SidebarEntry[] {
  return getMatchingEntries(groups, route).filter(
    ({ item }) => item.filters?.length
  );
}

function getEntries(groups: SidebarRoot[]): SidebarEntry[] {
  return groups.flatMap((group) =>
    (group.items ?? [group]).map((item) => ({ group, item }))
  );
}

function getMatchingEntries(
  groups: SidebarRoot[],
  route: SidebarRoute
): SidebarEntry[] {
  const path = getSidebarPath(route);
  return getEntries(groups).filter(({ item }) =>
    matchesSidebarPath(path, item.route)
  );
}
