<template>
  <FrappeMobileShell>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" :key="$route.path" :dark-mode="darkMode" />
      </keep-alive>
    </router-view>
    <template #nav>
      <MobileTabs v-if="!$route.meta.pushed" />
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
import { isDrawerOpenKey, openNavSheetKey } from 'src/utils/injectionKeys';
import { onMounted, provide, readonly, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isDesktopOnly } from './availability';
import InstallSheet from './InstallSheet.vue';
import MobileNavSheet from './MobileNavSheet.vue';
import MobileTabs from './MobileTabs.vue';
import { useBackClosesSheets } from './useBackClosesSheets';
import OfflineScreen from './OfflineScreen.vue';

defineProps<{ darkMode: boolean }>();

const route = useRoute();
const router = useRouter();
const isNavSheetOpen = ref(false);
useBackClosesSheets();
provide(openNavSheetKey, () => (isNavSheetOpen.value = true));
provide(isDrawerOpenKey, readonly(isNavSheetOpen));

onMounted(async () => {
  // The viewport can shrink while a desktop-only page is open.
  if (isDesktopOnly(route)) {
    await router.replace('/');
  }
});
</script>
