<template>
  <FrappeSidebar
    :collapsible="false"
    width="var(--w-sidebar)"
    :aria-label="t`Books`"
  >
    <FrappeSidebarHeader
      data-testid="company-name"
      :title="companyName"
      :subtitle="userName"
      :logo="companyLogo || undefined"
      :menu-items="menuItems"
    />

    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="px-2 pt-0.5 pb-10">
      <div class="space-y-0.5">
        <template v-for="group in groups" :key="group.label">
          <FrappeSidebarItem
            :label="group.label"
            :route="getPath(group)"
            :active="Boolean(isGroupActive(group) && !group.items)"
            :icon="group.icon"
          />
          <template v-if="group.items && isGroupActive(group)">
            <FrappeSidebarItem
              v-for="item in group.items"
              :key="item.label"
              :label="item.label"
              :route="getPath(item)"
              :active="Boolean(isItemActive(item))"
              class="ps-6"
            />
          </template>
        </template>
      </div>
    </FrappeScrollArea>

    <div class="flex-shrink-0 px-2 py-2">
      <FrappeSidebarItem
        :label="t`Hide Sidebar`"
        @click="() => toggleSidebar()"
      >
        <template #prefix>
          <span
            class="lucide-chevrons-left size-4 text-ink-gray-6 rtl-rotate-180"
            aria-hidden="true"
          />
        </template>
      </FrappeSidebarItem>
    </div>

    <FrappeKeyboardShortcutsDialog
      v-model:open="viewShortcuts"
      :title="t`Keyboard Shortcuts`"
    >
      <ShortcutsHelper />
    </FrappeKeyboardShortcutsDialog>
  </FrappeSidebar>
</template>
<script lang="ts">
import {
  KeyboardShortcutsDialog as FrappeKeyboardShortcutsDialog,
  ScrollArea as FrappeScrollArea,
  Sidebar as FrappeSidebar,
  SidebarHeader as FrappeSidebarHeader,
  SidebarItem as FrappeSidebarItem,
  type DropdownOptions,
} from 'frappe-ui';
import { getAppMenuItems, openDocumentation } from 'src/utils/appMenu';
import { useCompanyIdentity } from 'src/utils/company';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  getSidebarLocation,
  getSidebarPath,
  matchesSidebarPath,
} from 'src/utils/sidebarNavigation';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { toggleSidebar } from 'src/utils/ui';
import { defineComponent, inject } from 'vue';
import router from '../router';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    FrappeSidebar,
    FrappeSidebarHeader,
    FrappeSidebarItem,
    FrappeKeyboardShortcutsDialog,
    FrappeScrollArea,
    ShortcutsHelper,
  },
  setup() {
    return { shortcuts: inject(shortcutsKey), ...useCompanyIdentity() };
  },
  data() {
    return {
      groups: [],
      viewShortcuts: false,
      activeGroup: null,
    } as {
      groups: SidebarConfig;
      viewShortcuts: boolean;
      activeGroup: null | SidebarRoot;
    };
  },
  computed: {
    menuItems(): DropdownOptions {
      return getAppMenuItems(() => (this.viewShortcuts = true));
    },
  },
  async mounted() {
    this.groups = await getSidebarConfig();

    this.setActiveGroup();
    router.afterEach(() => {
      this.setActiveGroup();
    });

    this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyH'], () => {
      if (document.body === document.activeElement) {
        this.toggleSidebar();
      }
    });
    this.shortcuts?.set(COMPONENT_NAME, ['F1'], openDocumentation);
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    toggleSidebar,
    setActiveGroup() {
      const { path } = this.$route;
      const fallBackGroup = this.activeGroup;
      this.activeGroup =
        this.groups.find((g) => {
          if (path.startsWith(g.route + '/') && g.route !== '/') {
            return true;
          }

          if (g.route === path) {
            return true;
          }

          if (g.items) {
            let activeItem = g.items.filter(
              ({ route }) =>
                route === decodeURI(path) || path.startsWith(route + '/')
            );

            if (activeItem.length) {
              return true;
            }
          }
        }) ??
        (fallBackGroup?.items?.some(this.isItemActive)
          ? fallBackGroup
          : this.groups.find((group) =>
              group.items?.some(this.isItemActive)
            )) ??
        fallBackGroup ??
        this.groups[0];
    },
    isItemActive(item: SidebarItem) {
      return matchesSidebarPath(getSidebarPath(this.$route), item.route);
    },
    isGroupActive(group: SidebarRoot) {
      return this.activeGroup && group.label === this.activeGroup.label;
    },
    getPath: getSidebarLocation,
  },
});
</script>
