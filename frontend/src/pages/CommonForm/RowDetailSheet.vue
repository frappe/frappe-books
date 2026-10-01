<template>
  <FrappeBottomSheet
    :open="true"
    :title="title"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <div
      class="flex flex-col gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <MobileDetailList :details="details" />
      <FrappeButton size="lg" :label="t`Close`" @click="$emit('close')" />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import type { FrappeDoc } from 'src/frappe/document';
import { getRowDetails } from 'src/components/Controls/rowDetails';
import MobileDetailList from 'src/mobile/MobileDetailList.vue';
import { computed } from 'vue';

/** A read-only row, opened from a submitted document's table. */
const props = defineProps<{ row: FrappeDoc; title: string }>();
defineEmits<{ close: [] }>();

const details = computed(() => getRowDetails(props.row));
</script>
