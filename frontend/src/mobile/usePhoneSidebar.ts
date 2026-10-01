import { getSidebarConfig } from 'src/utils/sidebarConfig';
import { findSidebarEntry } from 'src/utils/sidebarNavigation';
import type { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { computed } from 'vue';
import { useRoute, useRouter, type Router } from 'vue-router';
import { isDesktopOnly } from './availability';

/** The sidebar a phone shows, and the entry that owns the current page. */
export function usePhoneSidebar() {
  const route = useRoute();
  const groups = getPhoneSidebar(useRouter());
  const active = computed(() => findSidebarEntry(groups, route));
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
