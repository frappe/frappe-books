<template>
  <FrappeSidebar
    :collapsible="false"
    width="var(--w-sidebar)"
    :aria-label="t`Books`"
  >
    <FrappeSidebarHeader
      data-testid="company-name"
      :title="companyName"
      :subtitle="subtitle"
      :logo="companyLogo || undefined"
      :menu-items="menuItems"
    />

    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="px-2 pt-0.5 pb-10">
      <!-- Pages first, then every group open under its label. -->
      <div class="space-y-0.5">
        <FrappeSidebarItem
          v-for="page in pages"
          :key="page.label"
          :label="page.label"
          :route="getPath(page)"
          :active="isActive(page)"
          :icon="page.icon"
        />
      </div>
      <FrappeSidebarSection
        v-for="group in sections"
        :key="group.label"
        :label="group.label"
      >
        <FrappeSidebarItem
          v-for="item in group.items"
          :key="item.label"
          :label="item.label"
          :route="getPath(item)"
          :active="isActive(item)"
          :icon="item.icon"
        />
      </FrappeSidebarSection>
    </FrappeScrollArea>

    <div class="flex-shrink-0 px-2 py-2">
      <FrappeSidebarItem
        :label="t`Hide sidebar`"
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
      :title="t`Keyboard shortcuts`"
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
  SidebarSection as FrappeSidebarSection,
  type DropdownOptions,
} from 'frappe-ui';
import { getAppMenuItems, openDocumentation } from 'src/utils/appMenu';
import { useCompanyIdentity } from 'src/utils/company';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  findSidebarEntry,
  getSidebarLocation,
  type SidebarEntry,
} from 'src/utils/sidebarNavigation';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { toggleSidebar } from 'src/utils/ui';
import { defineComponent, inject } from 'vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    FrappeSidebar,
    FrappeSidebarHeader,
    FrappeSidebarItem,
    FrappeSidebarSection,
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
      currentEntry: undefined,
    } as {
      groups: SidebarConfig;
      viewShortcuts: boolean;
      /** The one current entry, even where two lists share a doctype, as the payments do. */
      currentEntry: SidebarEntry | undefined;
    };
  },
  watch: {
    $route: 'setCurrentEntry',
    groups: 'setCurrentEntry',
  },
  computed: {
    pages(): SidebarConfig {
      return this.groups.filter((group) => !group.items);
    },
    sections(): SidebarConfig {
      return this.groups.filter((group) => group.items);
    },
    menuItems(): DropdownOptions {
      return getAppMenuItems(() => (this.viewShortcuts = true));
    },
  },
  async mounted() {
    this.groups = await getSidebarConfig();

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
    setCurrentEntry() {
      this.currentEntry = findSidebarEntry(
        this.groups,
        this.$route,
        this.currentEntry
      );
    },
    isActive(entry: SidebarRoot | SidebarItem): boolean {
      return this.currentEntry?.item === entry;
    },
    getPath: getSidebarLocation,
  },
});
</script>
