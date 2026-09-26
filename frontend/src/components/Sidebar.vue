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
      :menu-items="menuItems"
    />

    <div
      class="min-h-0 flex-1 overflow-y-auto px-2 pb-2 custom-scroll custom-scroll-thumb1"
    >
      <div v-for="group in groups" :key="group.label">
        <FrappeSidebarItem
          :label="group.label"
          :route="getPath(group)"
          :active="Boolean(isGroupActive(group) && !group.items)"
          class="mb-0.5"
        >
          <template #prefix>
            <Icon
              class="flex-shrink-0"
              :name="group.icon"
              :size="group.iconSize || '18'"
              :height="group.iconHeight ?? 0"
              :active="!!isGroupActive(group)"
              :dark-mode="darkMode"
            />
          </template>
        </FrappeSidebarItem>

        <div v-if="group.items && isGroupActive(group)" class="mb-1">
          <FrappeSidebarItem
            v-for="item in group.items"
            :key="item.label"
            :label="item.label"
            :route="getPath(item)"
            :active="Boolean(isItemActive(item))"
            class="mb-0.5 ps-6"
          >
            <template #prefix><span class="w-0" /></template>
          </FrappeSidebarItem>
        </div>
      </div>
    </div>

    <div class="flex-shrink-0 px-2 py-2">
      <FrappeSidebarItem
        :label="t`Hide Sidebar`"
        @click="() => toggleSidebar()"
      >
        <template #prefix>
          <Icon name="chevrons-left" class="h-4 w-4 rtl-rotate-180" />
        </template>
      </FrappeSidebarItem>
    </div>

    <Modal
      :open-modal="viewShortcuts"
      size="2xl"
      @closemodal="viewShortcuts = false"
    >
      <ShortcutsHelper class="w-full" />
    </Modal>
  </FrappeSidebar>
</template>
<script lang="ts">
import {
  Sidebar as FrappeSidebar,
  SidebarHeader as FrappeSidebarHeader,
  SidebarItem as FrappeSidebarItem,
  type DropdownOptions,
} from 'frappe-ui';
import { fyo } from 'src/initFyo';
import { getAppMenuItems, openDocumentation } from 'src/utils/appMenu';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  getSidebarPath,
  matchesSidebarPath,
} from 'src/utils/sidebarNavigation';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { toggleSidebar } from 'src/utils/ui';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    FrappeSidebar,
    FrappeSidebarHeader,
    FrappeSidebarItem,
    Icon,
    Modal,
    ShortcutsHelper,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  setup() {
    return { shortcuts: inject(shortcutsKey) };
  },
  data() {
    return {
      companyName: '',
      groups: [],
      viewShortcuts: false,
      activeGroup: null,
    } as {
      companyName: string;
      groups: SidebarConfig;
      viewShortcuts: boolean;
      activeGroup: null | SidebarRoot;
    };
  },
  computed: {
    userName(): string {
      const user = window.frappe.boot?.user?.name ?? '';
      return window.frappe.boot?.user_info?.[user]?.fullname ?? user;
    },
    menuItems(): DropdownOptions {
      return getAppMenuItems(() => (this.viewShortcuts = true));
    },
  },
  async mounted() {
    const { companyName } = await fyo.doc.getDoc('AccountingSettings');
    this.companyName = companyName as string;
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
    getPath(item: SidebarItem | SidebarRoot) {
      const { route: path, filters } = item;
      if (!filters) {
        return path;
      }

      return { path, query: { filters: JSON.stringify(filters) } };
    },
  },
});
</script>
