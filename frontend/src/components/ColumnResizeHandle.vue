<template>
  <span
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="t`Resize ${label} column`"
    :aria-valuenow="width === undefined ? undefined : Math.round(width)"
    :aria-valuemin="MIN_COLUMN_WIDTH"
    :aria-valuemax="MAX_COLUMN_WIDTH"
    :title="title"
    class="absolute inset-y-0 -end-[calc(var(--list-gap,0.5rem)/2+0.25rem)] z-10 flex w-2 cursor-col-resize touch-none select-none items-center justify-center outline-none group/resize"
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

<script setup lang="ts">
import { t } from 'fyo';
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  getFont,
  measureText,
} from 'src/utils/columnWidths';
import { onDeactivated } from 'vue';

/**
 * `width` is unset while the column keeps its default track size.
 * `keepLabel` stops the column getting narrower than its header text, so
 * the label and its description stay on one line each.
 */
const props = defineProps<{
  label: string;
  title: string;
  width?: number;
  direction?: string;
  keepLabel?: boolean;
}>();
const emit = defineEmits<{
  resize: [width: number | undefined];
  commit: [width: number];
  fit: [];
}>();
let drag:
  | {
      pointerId: number;
      x: number;
      width: number;
      minimum: number;
      initial?: number;
    }
  | undefined;

onDeactivated(cancelResize);

function startResize(event: PointerEvent) {
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.focus();
  handle.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    width: getWidth(handle),
    minimum: getMinimumWidth(handle),
    initial: props.width,
  };
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
  if (drag) emit('resize', drag.initial);
  drag = undefined;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('fit');
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const step = event.shiftKey ? 40 : 8;
    emit(
      'commit',
      Math.max(
        getMinimumWidth(handle),
        getWidth(handle) +
          direction * step * (props.direction === 'rtl' ? -1 : 1)
      )
    );
  } else if (event.key === 'Escape' && drag) {
    event.preventDefault();
    event.stopPropagation();
    cancelResize();
  }
}

function getWidth(handle: HTMLElement) {
  return props.width ?? getHeader(handle).getBoundingClientRect().width;
}

function getMinimumWidth(handle: HTMLElement) {
  const context = document.createElement('canvas').getContext('2d');
  if (!props.keepLabel || !context) return MIN_COLUMN_WIDTH;

  const header = getHeader(handle);
  const style = getComputedStyle(header);
  // The cell's gap sits between the label and this handle's slot.
  const space =
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    (parseFloat(style.columnGap) || 0);
  return Math.ceil(getTextWidth(context, header) + space + 2);
}

/** Widest text in the header, each piece measured in its own font. */
function getTextWidth(context: CanvasRenderingContext2D, header: HTMLElement) {
  const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  let width = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent!.trim();
    if (!text) continue;
    const style = getComputedStyle(walker.currentNode.parentElement!);
    context.font = getFont(style);
    width = Math.max(width, measureText(context, text, style));
  }
  return width;
}

function getHeader(handle: HTMLElement) {
  return handle.closest<HTMLElement>('[role="columnheader"]')!;
}

function getDraggedWidth(event: PointerEvent) {
  const delta =
    (event.clientX - drag!.x) * (props.direction === 'rtl' ? -1 : 1);
  return Math.max(drag!.minimum, drag!.width + delta);
}
</script>
