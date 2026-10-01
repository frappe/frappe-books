<script setup lang="ts">
import { settingsDialog, showSidebar } from 'src/utils/refs';
</script>
<template>
  <FrappeDesktopShell :scroll="false">
    <template #sidebar>
      <!-- frappe-ui's Sidebar can't hide fully (frappe/frappe-ui#1251). -->
      <Transition name="sidebar">
        <Sidebar
          v-show="showSidebar"
          class="flex-shrink-0 border-e border-outline-gray-1 whitespace-nowrap"
        />
      </Transition>
    </template>

    <div class="flex min-h-0 flex-1 overflow-hidden bg-surface-base">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component
            :is="Component"
            :key="$route.path"
            class="min-w-0 flex-1"
          />
        </keep-alive>
      </router-view>

      <!-- The settings dialog shows the records its fields create. -->
      <router-view v-slot="{ Component, route }" name="edit">
        <Transition name="quickedit">
          <div v-if="route?.query?.edit && !settingsDialog.open">
            <component
              :is="Component"
              :key="
                String(route.query.schemaName ?? '') +
                String(route.query.name ?? '')
              "
            />
          </div>
        </Transition>
      </router-view>
    </div>
    <SettingsDialog />
  </FrappeDesktopShell>
</template>
<script lang="ts">
import { DesktopShell as FrappeDesktopShell } from 'frappe-ui';
import { defineComponent } from 'vue';
import Sidebar from '../components/Sidebar.vue';
import SettingsDialog from './Settings/SettingsDialog.vue';
export default defineComponent({
  name: 'Desk',
  components: {
    FrappeDesktopShell,
    SettingsDialog,
    Sidebar,
  },
  async mounted() {
    // The viewport can grow while a phone-only page is open.
    if (this.$route.meta.phoneOnly) {
      await this.$router.replace('/');
    }
  },
});
</script>

<style scoped>
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
  transform: translateX(calc(-1 * var(--w-sidebar)));
  width: 0px;
}
[dir='rtl'] .sidebar-leave-to {
  opacity: 0;
  transform: translateX(calc(1 * var(--w-sidebar)));
  width: 0px;
}

.sidebar-enter-to,
.sidebar-leave-from {
  opacity: 1;
  transform: translateX(0px);
  width: var(--w-sidebar);
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition: all 150ms ease-out;
}
</style>
