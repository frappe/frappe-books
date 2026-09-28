<template>
  <FrappeBottomSheet v-model:open="open" :title="title">
    <div class="px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <MobileDetailList data-testid="report-row-details" :details="details" />
      <FrappeButton
        v-if="reference"
        class="mt-4 w-full"
        size="lg"
        :label="t`Open ${reference.name}`"
        @click="openReference"
      />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import type { Report } from 'reports/Report';
import MobileDetailList from 'src/mobile/MobileDetailList.vue';
import type { ReportRow } from 'reports/types';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { computed } from 'vue';
import { getRowDetails, getRowReference } from './mobileRows';

const props = defineProps<{
  report: Report;
  row: ReportRow | null;
  title: string;
}>();
const open = defineModel<boolean>('open', { required: true });

const details = computed(() =>
  props.row ? getRowDetails(props.report, props.row) : []
);
const reference = computed(() =>
  props.row ? getRowReference(props.report, props.row) : null
);

async function openReference() {
  if (!reference.value) return;
  const { schemaName, name } = reference.value;
  open.value = false;
  await routeTo(getFormRoute(schemaName, name));
}
</script>
