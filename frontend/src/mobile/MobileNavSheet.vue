<template>
  <FrappeBottomSheet v-model:open="isOpen" :title="t`Books`">
    <div
      class="flex flex-col gap-2 px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <FrappeSidebarHeader
        data-testid="company-name"
        :title="companyName"
        :subtitle="userName"
        :logo="companyLogo || undefined"
        :menu-items="menuItems"
      />
      <nav class="flex flex-col gap-0.5" :aria-label="t`Books`">
        <template v-for="group in groups" :key="group.name">
          <FrappeItemListRow
            v-if="group.items"
            as="button"
            type="button"
            size="lg"
            class="text-start"
            :aria-expanded="openGroup === group.name"
            @click="toggleGroup(group)"
          >
            <template #prefix>
              <FrappeIcon :icon="group.icon" :class="iconClasses" />
            </template>
            <span class="block truncate">{{ group.label }}</span>
            <template #suffix>
              <FrappeIcon
                v-if="openGroup === group.name"
                icon="lucide-chevron-down"
                class="size-4 text-ink-gray-4"
              />
              <FrappeIcon
                v-else
                icon="lucide-chevron-right"
                class="size-4 text-ink-gray-4 rtl-rotate-180"
              />
            </template>
          </FrappeItemListRow>
          <FrappeItemListRow
            v-else
            :as="RouterLink"
            :to="getSidebarLocation(group)"
            size="lg"
            @click="close"
          >
            <template #prefix>
              <FrappeIcon :icon="group.icon" :class="iconClasses" />
            </template>
            <span class="block truncate">{{ group.label }}</span>
          </FrappeItemListRow>

          <template v-if="group.items && openGroup === group.name">
            <FrappeItemListRow
              v-for="item in group.items"
              :key="item.name"
              :as="RouterLink"
              :to="getSidebarLocation(item)"
              size="lg"
              @click="close"
            >
              <template #prefix><span :class="iconClasses" /></template>
              <span class="block truncate">{{ item.label }}</span>
            </FrappeItemListRow>
          </template>
        </template>
      </nav>
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Icon as FrappeIcon,
  ItemListRow as FrappeItemListRow,
  SidebarHeader as FrappeSidebarHeader,
} from 'frappe-ui';
import { t } from 'fyo';
import { getAppMenuItems } from 'src/utils/appMenu';
import { useCompanyIdentity } from 'src/utils/company';
import { getSidebarLocation } from 'src/utils/sidebarNavigation';
import type { SidebarRoot } from 'src/utils/types';
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { usePhoneSidebar } from './usePhoneSidebar';

/** The desktop sidebar on a phone: account menu and every page. */
const isOpen = defineModel<boolean>('open', { required: true });

const { companyName, companyLogo, userName } = useCompanyIdentity();
const menuItems = getAppMenuItems();
const { groups, active } = usePhoneSidebar();
const openGroup = ref('');
const iconClasses = 'size-5 shrink-0 text-ink-gray-5';

watch(isOpen, (open) => {
  if (open) {
    openGroup.value = active.value?.group.name ?? '';
  }
});

function toggleGroup(group: SidebarRoot) {
  openGroup.value = openGroup.value === group.name ? '' : group.name;
}

function close() {
  isOpen.value = false;
}
</script>
