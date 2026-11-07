import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  findSidebarEntry,
  type SidebarEntry,
} from 'src/utils/sidebarNavigation';
import { findRecordSidebarEntry } from 'src/utils/sidebarRecord';
import type { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { shallowRef, watch } from 'vue';
import { useRoute, useRouter, type Router } from 'vue-router';
import { isDesktopOnly } from './availability';

/** The sidebar a phone shows, and the entry that owns the current page. */
export function usePhoneSidebar() {
  const route = useRoute();
  const groups = getPhoneSidebar(useRouter());
  const active = shallowRef<SidebarEntry>();
  watch(
    () => route.fullPath,
    async (path) => {
      active.value = findSidebarEntry(groups, route);
      const entry = await findRecordSidebarEntry(groups, route);
      if (entry && path === route.fullPath) {
        active.value = entry;
      }
    },
    { immediate: true }
  );
  return { groups, active };
}

function getPhoneSidebar(router: Router): SidebarConfig {
  const isPhonePage = (item: SidebarItem | SidebarRoot) =>
    !isDesktopOnly(router.resolve(item.route));

  return getSidebarConfig()
    .map((group) => ({ ...group, items: group.items?.filter(isPhonePage) }))
    .filter((group) =>
      group.items ? group.items.length > 0 : isPhonePage(group)
    );
}
