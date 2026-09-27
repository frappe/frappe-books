<template>
  <FrappeMobileShell>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" :key="$route.path" :dark-mode="darkMode" />
      </keep-alive>
    </router-view>
  </FrappeMobileShell>
  <router-view v-slot="{ Component, route }" name="edit">
    <component
      :is="Component"
      v-if="route?.query?.edit"
      :key="
        String(route.query.schemaName ?? '') + String(route.query.name ?? '')
      "
    />
  </router-view>
  <MobileDrawer v-model:open="isDrawerOpen" />
  <OfflineScreen />
</template>
<script setup lang="ts">
import { useSwipe } from '@vueuse/core';
import { MobileShell as FrappeMobileShell } from 'frappe-ui';
import {
  isDrawerOpenKey,
  languageDirectionKey,
  openDrawerKey,
} from 'src/utils/injectionKeys';
import { inject, onMounted, provide, readonly, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isDesktopOnly } from './availability';
import MobileDrawer from './MobileDrawer.vue';
import { useBackClosesSheets } from './useBackClosesSheets';
import OfflineScreen from './OfflineScreen.vue';

defineProps<{ darkMode: boolean }>();

const EDGE_WIDTH = 24;
const MIN_SWIPE = 60;

const route = useRoute();
const router = useRouter();
const direction = inject(languageDirectionKey, ref<'ltr' | 'rtl'>('ltr'));
const isDrawerOpen = ref(false);
useBackClosesSheets();
provide(openDrawerKey, () => (isDrawerOpen.value = true));
provide(isDrawerOpenKey, readonly(isDrawerOpen));

const {
  coordsStart,
  direction: swipeDirection,
  lengthX,
} = useSwipe(document, { onSwipeEnd: openOnEdgeSwipe });

function openOnEdgeSwipe() {
  const isRtl = direction.value === 'rtl';
  const fromEdge = isRtl
    ? window.innerWidth - coordsStart.x <= EDGE_WIDTH
    : coordsStart.x <= EDGE_WIDTH;
  const towardsEnd = isRtl ? 'left' : 'right';
  if (
    fromEdge &&
    swipeDirection.value === towardsEnd &&
    Math.abs(lengthX.value) > MIN_SWIPE
  ) {
    isDrawerOpen.value = true;
  }
}

onMounted(async () => {
  // The viewport can shrink while a desktop-only page is open.
  if (isDesktopOnly(route)) {
    await router.replace('/');
  }
});
</script>
