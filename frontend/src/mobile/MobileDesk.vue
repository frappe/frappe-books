<template>
  <FrappeMobileShell>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" :key="$route.path" />
      </keep-alive>
    </router-view>
    <template #nav>
      <div ref="footerTarget" />
      <MobileTabs v-if="showTabs" />
    </template>
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
  <MobileNavSheet v-model:open="isNavSheetOpen" />
  <InstallSheet />
  <OfflineScreen />
</template>
<script setup lang="ts">
import { MobileShell as FrappeMobileShell } from 'frappe-ui';
import { openNavSheetKey } from 'src/utils/injectionKeys';
import { computed, onMounted, provide, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isDesktopOnly } from './availability';
import InstallSheet from './InstallSheet.vue';
import MobileNavSheet from './MobileNavSheet.vue';
import MobileTabs from './MobileTabs.vue';
import { useBackClosesSheets } from './useBackClosesSheets';
import OfflineScreen from './OfflineScreen.vue';
import { provideMobileFooter } from './provideMobileFooter';

const route = useRoute();
const router = useRouter();
const isNavSheetOpen = ref(false);
useBackClosesSheets();
provide(openNavSheetKey, () => (isNavSheetOpen.value = true));

const { target: footerTarget, hasFooter } = provideMobileFooter();
const showTabs = computed(() => !route.meta.pushed && !hasFooter.value);

onMounted(async () => {
  // The viewport can shrink while a desktop-only page is open.
  if (isDesktopOnly(route)) {
    await router.replace('/');
  }
});
</script>
