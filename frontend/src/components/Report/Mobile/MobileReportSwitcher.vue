<template>
  <button
    v-if="options.length > 1"
    type="button"
    class="inline-flex max-w-full items-center gap-1 rounded-5 px-1 active:bg-surface-gray-2"
    aria-haspopup="dialog"
    @click="isOpen = true"
  >
    <FrappePageHeaderMobileTitle :title="title" />
    <FrappeIcon
      icon="lucide-chevron-down"
      class="size-4 shrink-0 text-ink-gray-5"
    />
  </button>
  <template v-else>{{ title }}</template>
  <MobileOptionsSheet
    v-model:open="isOpen"
    :title="t`Reports`"
    :options="options"
    :value="active?.item.route"
    @select="(route) => router.push(String(route))"
  />
</template>
<script setup lang="ts">
import {
  Icon as FrappeIcon,
  PageHeaderMobileTitle as FrappePageHeaderMobileTitle,
} from 'frappe-ui';
import { t } from 'fyo';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { usePhoneSidebar } from 'src/mobile/usePhoneSidebar';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

/** The report title, which opens the other reports of its nav group. */
defineProps<{ title: string }>();

const router = useRouter();
const { active } = usePhoneSidebar();
const isOpen = ref(false);

const options = computed(() =>
  (active.value?.group.items ?? [])
    .filter(({ route }) => route.startsWith('/report/'))
    .map(({ label, route }) => ({ label, value: route }))
);
</script>
