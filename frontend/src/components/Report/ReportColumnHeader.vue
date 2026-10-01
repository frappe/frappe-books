<template>
  <FrappeListHeaderCell class="group relative">
    <ReportOverflowText :value="label" />
    <template #suffix>
      <span
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t`Resize ${label} column`"
        :aria-valuenow="Math.round(width)"
        :aria-valuemin="MIN_COLUMN_WIDTH"
        :aria-valuemax="MAX_COLUMN_WIDTH"
        :title="
          t`Drag to resize. Double-click or press Enter to fit contents. Use arrow keys to resize.`
        "
        class="absolute inset-y-0 -end-3 z-10 flex w-2 cursor-col-resize touch-none select-none items-center justify-center outline-none group/resize"
        @pointerdown="startResize"
        @pointermove="resize"
        @pointerup="finishResize"
        @pointercancel="cancelResize"
        @lostpointercapture="cancelResize"
        @click.stop
        @dblclick.stop.prevent="$emit('fit')"
        @keydown="onKeydown"
      >
        <span
          class="h-4 w-px bg-surface-gray-4 group-hover:bg-surface-gray-5 group-hover/resize:bg-surface-gray-6 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-surface-gray-6"
        />
      </span>
    </template>
  </FrappeListHeaderCell>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { ListHeaderCell as FrappeListHeaderCell } from 'frappe-ui/list';
import { onDeactivated } from 'vue';
import ReportOverflowText from './ReportOverflowText.vue';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './ReportColumnWidths';

const props = defineProps<{
  label: string;
  width: number;
  direction?: string;
}>();
const emit = defineEmits<{
  resize: [width: number];
  commit: [width: number];
  fit: [];
}>();
let drag: { pointerId: number; x: number; width: number } | undefined;

onDeactivated(cancelResize);

function startResize(event: PointerEvent) {
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.focus();
  handle.setPointerCapture(event.pointerId);
  drag = { pointerId: event.pointerId, x: event.clientX, width: props.width };
}

function resize(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return;
  emit('resize', getDraggedWidth(event));
}

function finishResize(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return;
  emit('commit', getDraggedWidth(event));
  drag = undefined;
}

function cancelResize() {
  if (drag) emit('resize', drag.width);
  drag = undefined;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('fit');
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const step = event.shiftKey ? 40 : 8;
    emit(
      'commit',
      props.width + direction * step * (props.direction === 'rtl' ? -1 : 1)
    );
  } else if (event.key === 'Escape' && drag) {
    event.preventDefault();
    event.stopPropagation();
    cancelResize();
  }
}

function getDraggedWidth(event: PointerEvent) {
  const delta =
    (event.clientX - drag!.x) * (props.direction === 'rtl' ? -1 : 1);
  return drag!.width + delta;
}
</script>
