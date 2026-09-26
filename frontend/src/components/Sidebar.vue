<template>
  <FrappeSidebar
    :disable-collapse="true"
    width="var(--w-sidebar)"
    class="py-2 h-full min-h-0 flex flex-col overflow-hidden bg-surface-sidebar"
  >
    <div
      class="min-h-0 flex-1 overflow-y-auto custom-scroll custom-scroll-thumb1"
    >
      <!-- Company name -->
      <div class="px-4 flex flex-row items-center justify-between mt-2 mb-4">
        <h6
          data-testid="company-name"
          class="font-semibold text-ink-gray-8 whitespace-nowrap overflow-auto no-scrollbar select-none"
        >
          {{ companyName }}
        </h6>
      </div>

      <!-- Sidebar Items -->
      <div v-for="group in groups" :key="group.label">
        <FrappeSidebarItem
          :label="group.label"
          :active="Boolean(isGroupActive(group) && !group.items)"
          class="mx-2 mb-1 [&_[data-slot='sidebar-item-suffix']]:hidden"
          @click="routeToSidebarItem(group)"
        >
          <template #prefix>
            <Icon
              class="flex-shrink-0"
              :name="group.icon"
              :size="group.iconSize || '18'"
              :height="group.iconHeight ?? 0"
              :active="!!isGroupActive(group)"
              :darkMode="darkMode"
            />
          </template>
        </FrappeSidebarItem>

        <!-- Expanded Group -->
        <div v-if="group.items && isGroupActive(group)">
          <FrappeSidebarItem
            v-for="item in group.items"
            :key="item.label"
            :label="item.label"
            :active="Boolean(isItemActive(item))"
            class="mx-2 mb-1 ps-7"
            @click="routeToSidebarItem(item)"
          >
            <template #prefix><span class="w-0" /></template>
          </FrappeSidebarItem>
        </div>
      </div>
    </div>

    <div class="flex-shrink-0 flex flex-col gap-2 py-2 px-4">
      <FrappeSidebarItem
        :label="t`Help`"
        class="!h-7"
        @click="openDocumentation"
      >
        <template #prefix>
          <Icon name="help-circle" class="h-4 w-4 flex-shrink-0" />
        </template>
      </FrappeSidebarItem>

      <FrappeSidebarItem
        :label="t`Shortcuts`"
        class="!h-7"
        @click="viewShortcuts = true"
      >
        <template #prefix>
          <Icon name="command" class="h-4 w-4 flex-shrink-0" />
        </template>
      </FrappeSidebarItem>

      <div class="flex items-center justify-end">
        <Button
          :background="false"
          :icon="true"
          :padding="false"
          :title="t`Hide sidebar`"
          :aria-label="t`Hide sidebar`"
          class="flex-shrink-0 rtl-rotate-180"
          @click="() => toggleSidebar()"
        >
          <Icon name="chevrons-left" class="w-4 h-4" />
        </Button>
      </div>
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
  SidebarItem as FrappeSidebarItem,
} from 'frappe-ui';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathRef } from 'src/utils/refs';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  getSidebarPath,
  matchesSidebarPath,
} from 'src/utils/sidebarNavigation';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Icon from './Icon.vue';
import Button from './Button.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    Button,
    FrappeSidebar,
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
    this.shortcuts?.set(COMPONENT_NAME, ['F1'], () => this.openDocumentation());
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    routeTo,
    toggleSidebar,
    openDocumentation() {
      window.open(
        'https://docs.frappe.io/' + docsPathRef.value,
        '_blank',
        'noopener,noreferrer'
      );
    },
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
    routeToSidebarItem(item: SidebarItem | SidebarRoot) {
      routeTo(this.getPath(item));
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
