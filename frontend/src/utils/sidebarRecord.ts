import { getList, type Filter } from 'src/frappe/api';
import { getModel } from 'src/frappe/registry';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { getFilteredLists, type SidebarEntry } from './sidebarNavigation';
import type { SidebarRoot } from './types';

/**
 * Of the filtered lists of the record the route opens, the only one that
 * lists it, as a supplier's payment belongs under Purchase Payment.
 */
export async function findRecordSidebarEntry(
  groups: SidebarRoot[],
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'params' | 'meta'>
): Promise<SidebarEntry | undefined> {
  const { schemaName, name } = route.params;
  const doctype = getModel(String(schemaName))?.doctype;
  const lists = getFilteredLists(groups, route);
  if (typeof name !== 'string' || !doctype || lists.length < 2) {
    return undefined;
  }

  const listed = await Promise.all(
    lists.map(({ item }) => isListed(doctype, name, item.filters!))
  );
  const owners = lists.filter((_, index) => listed[index]);
  return owners.length === 1 ? owners[0] : undefined;
}

/** Whether the list shows the record, matching blanks as the list does. */
async function isListed(doctype: string, name: string, filters: Filter[]) {
  const rows = await getList(doctype, {
    fields: ['name'],
    filters: [['name', '=', name], ...filters],
    limit: 1,
  });
  return rows.length > 0;
}
