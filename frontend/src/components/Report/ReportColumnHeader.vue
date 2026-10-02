<template>
  <FrappeListHeaderCell class="group relative">
    <ReportOverflowText :value="label" />
    <template #suffix>
      <ColumnResizeHandle
        :label="label"
        :title="
          t`Drag to resize. Double-click or press Enter to fit contents. Use arrow keys to resize.`
        "
        :width="width"
        :direction="direction"
        @resize="$emit('resize', $event)"
        @commit="$emit('commit', $event)"
        @fit="$emit('fit')"
      />
    </template>
  </FrappeListHeaderCell>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { ListHeaderCell as FrappeListHeaderCell } from 'frappe-ui/list';
import ColumnResizeHandle from '../ColumnResizeHandle.vue';
import ReportOverflowText from './ReportOverflowText.vue';

defineProps<{
  label: string;
  width: number;
  direction?: string;
}>();
defineEmits<{
  resize: [width: number | undefined];
  commit: [width: number];
  fit: [];
}>();
</script>
