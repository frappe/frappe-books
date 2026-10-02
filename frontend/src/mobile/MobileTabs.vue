<template>
  <FrappeMobileNav>
    <FrappeMobileNavItem
      v-for="tab in tabs"
      :key="tab.name"
      :label="tab.label"
      :icon="tab.icon"
      :active="tab.name === activeTab"
      @click="openTab(tab)"
    />
  </FrappeMobileNav>
</template>
<script setup lang="ts">
import {
  MobileNav as FrappeMobileNav,
  MobileNavItem as FrappeMobileNavItem,
  shellScrollContainer,
} from 'frappe-ui';
import { t } from 'fyo';
import type { SidebarRoot } from 'src/utils/types';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePhoneSidebar } from './usePhoneSidebar';

const TAB_GROUPS = ['dashboard', 'sales', 'purchases', 'reports'];

const route = useRoute();
const router = useRouter();
const { groups, active } = usePhoneSidebar();
const searchTab: SidebarRoot = {
  name: 'search',
  label: t`Search`,
  icon: 'lucide-search',
  route: '/search',
};
const tabs = [
  ...groups.filter((group) => TAB_GROUPS.includes(group.name)),
  searchTab,
];
const activeTab = computed(() =>
  route.path === searchTab.route ? searchTab.name : active.value?.group.name
);

// MobileNavItem's `route` matches by route name, so any two lists are one page
// (frappe/frappe-ui#1245).
async function openTab(tab: SidebarRoot) {
  if (router.resolve(tab.route).path !== route.path) {
    await router.push(tab.route);
    return;
  }

  shellScrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>
