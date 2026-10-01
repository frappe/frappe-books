<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal :to="portalTarget">
      <DialogOverlay
        class="mobile-drawer-overlay fixed inset-0 z-40 bg-black-overlay-200 dark:bg-black-overlay-700"
      />
      <DialogContent
        ref="content"
        :aria-describedby="undefined"
        class="mobile-drawer fixed inset-y-0 start-0 z-40 flex w-[85%] max-w-[332px] border-e border-outline-gray-1 bg-surface-base shadow-xl focus:outline-none"
      >
        <!-- The sidebar colour is see-through in dark mode, so it sits on the page colour as on desktop. -->
        <div
          class="flex min-w-0 flex-1 flex-col bg-surface-sidebar pt-[env(safe-area-inset-top)]"
        >
          <DialogTitle class="sr-only">{{ t`Books` }}</DialogTitle>
          <div class="px-2 pt-1.5">
            <FrappeSidebarHeader
              data-testid="company-name"
              :title="companyName"
              :subtitle="userName"
              :logo="companyLogo || undefined"
              :menu-items="menuItems"
            />
          </div>
          <div class="px-2 pb-2 pt-1">
            <button
              type="button"
              class="flex h-10 w-full items-center gap-2 rounded-5 bg-surface-gray-3 px-3 text-start text-lg text-ink-gray-6 active:bg-surface-gray-4"
              @click="openSearch"
            >
              <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
              {{ t`Search` }}
            </button>
          </div>

          <nav
            class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-10 pt-1"
            :aria-label="t`Books`"
          >
            <div
              v-for="group in groups"
              :key="group.name"
              class="flex flex-col gap-0.5"
            >
              <button
                v-if="group.items"
                class="flex h-11 w-full items-center gap-2.5 rounded-4 px-2.5 text-start text-lg active:bg-surface-gray-3"
                :class="
                  isGroupActive(group) ? 'text-ink-gray-9' : 'text-ink-gray-7'
                "
                :aria-expanded="openGroup === group.name"
                @click="toggleGroup(group)"
              >
                <FrappeIcon
                  :icon="group.icon"
                  class="size-5"
                  :class="iconClasses(isGroupActive(group))"
                />
                <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
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
              </button>
              <RouterLink
                v-else
                :to="getSidebarLocation(group)"
                class="flex h-11 items-center gap-2.5 rounded-4 px-2.5 text-lg"
                :class="linkClasses(isGroupActive(group))"
                @click="close"
              >
                <FrappeIcon
                  :icon="group.icon"
                  class="size-5"
                  :class="iconClasses(isGroupActive(group))"
                />
                <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
              </RouterLink>

              <div
                v-if="group.items && openGroup === group.name"
                class="flex flex-col gap-0.5 pb-1"
              >
                <RouterLink
                  v-for="item in group.items"
                  :key="item.name"
                  :to="getSidebarLocation(item)"
                  class="flex h-10 items-center rounded-4 pe-2.5 ps-10 text-lg"
                  :class="linkClasses(isItemActive(item))"
                  @click="close"
                >
                  <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                </RouterLink>
              </div>
            </div>
          </nav>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup lang="ts">
import { useSwipe } from '@vueuse/core';
import {
  Icon as FrappeIcon,
  SidebarHeader as FrappeSidebarHeader,
  usePortalTarget,
} from 'frappe-ui';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { getAppMenuItems } from 'src/utils/appMenu';
import { useCompanyIdentity } from 'src/utils/company';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import {
  getSidebarLocation,
  getSidebarPath,
  matchesSidebarPath,
} from 'src/utils/sidebarNavigation';
import type { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { computed, inject, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isDesktopOnly } from './availability';

const isOpen = defineModel<boolean>('open', { required: true });

const portalTarget = usePortalTarget();
const route = useRoute();
const router = useRouter();
const direction = inject(languageDirectionKey, ref<'ltr' | 'rtl'>('ltr'));
const { companyName, companyLogo, userName } = useCompanyIdentity();
const menuItems = getAppMenuItems();

const openGroup = ref('');
const groups = computed(getPhoneSidebar);

watch(isOpen, (open) => {
  if (open) {
    openGroup.value =
      groups.value.find((group) => group.items?.some(isItemActive))?.name ?? '';
  }
});

const content = ref<{ $el: HTMLElement } | null>(null);
const { direction: swipeDirection, lengthX } = useSwipe(
  computed(() => content.value?.$el ?? null),
  {
    onSwipeEnd() {
      const towardsStart = direction.value === 'rtl' ? 'right' : 'left';
      if (
        swipeDirection.value === towardsStart &&
        Math.abs(lengthX.value) > 60
      ) {
        close();
      }
    },
  }
);

function getPhoneSidebar(): SidebarConfig {
  const isPhonePage = (item: SidebarItem | SidebarRoot) =>
    !isDesktopOnly(router.resolve(item.route));

  return getSidebarConfig()
    .map((group) => ({ ...group, items: group.items?.filter(isPhonePage) }))
    .filter((group) =>
      group.items ? group.items.length > 0 : isPhonePage(group)
    );
}

function isItemActive(item: SidebarItem | SidebarRoot) {
  return matchesSidebarPath(getSidebarPath(route), item.route);
}

function isGroupActive(group: SidebarRoot) {
  return group.items ? group.items.some(isItemActive) : isItemActive(group);
}

function toggleGroup(group: SidebarRoot) {
  openGroup.value = openGroup.value === group.name ? '' : group.name;
}

// The drawer is temporary, so the current page only darkens its label.
function linkClasses(active: boolean) {
  return [
    'active:bg-surface-gray-3',
    active ? 'text-ink-gray-9' : 'text-ink-gray-7',
  ];
}

function iconClasses(active: boolean) {
  return active ? 'text-ink-gray-9' : 'text-ink-gray-6';
}

function close() {
  isOpen.value = false;
}

async function openSearch() {
  close();
  await router.push('/search');
}
</script>
<style scoped>
@keyframes mobile-drawer-in {
  from {
    transform: translateX(var(--mobile-drawer-offset));
  }
}

@keyframes mobile-drawer-out {
  to {
    transform: translateX(var(--mobile-drawer-offset));
  }
}

@keyframes mobile-drawer-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes mobile-drawer-fade-out {
  to {
    opacity: 0;
  }
}

:global(.mobile-drawer) {
  --mobile-drawer-offset: -100%;
}

:global([dir='rtl'] .mobile-drawer) {
  --mobile-drawer-offset: 100%;
}

:global(.mobile-drawer[data-state='open']) {
  animation: mobile-drawer-in 200ms ease-out;
}

:global(.mobile-drawer[data-state='closed']) {
  animation: mobile-drawer-out 200ms ease-in;
}

:global(.mobile-drawer-overlay[data-state='open']) {
  animation: mobile-drawer-fade-in 200ms ease-out;
}

:global(.mobile-drawer-overlay[data-state='closed']) {
  animation: mobile-drawer-fade-out 200ms ease-in;
}
</style>
