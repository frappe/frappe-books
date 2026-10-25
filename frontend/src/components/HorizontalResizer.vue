<template>
  <FrappePopover :open="resizing" :side="growsTo" :offset="8">
    <template #trigger>
      <div
        ref="hr"
        class="h-full bg-surface-gray-4 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        :class="resizing ? 'opacity-100' : 'opacity-0'"
        style="width: 3px; cursor: col-resize; margin-inline-start: -3px"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="label ?? t`Resize editor panel`"
        :aria-valuenow="initialX"
        :aria-valuemin="minX"
        :aria-valuemax="maxX"
        @keydown.left.prevent="resizeWithKeyboard(8 * direction)"
        @keydown.right.prevent="resizeWithKeyboard(-8 * direction)"
        @mousedown="onMouseDown"
      />
    </template>
    <div class="min-w-8 text-center text-sm tabular-nums">
      {{ value }}
    </div>
  </FrappePopover>
</template>
<script lang="ts">
import { Popover as FrappePopover } from 'frappe-ui';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  components: { FrappePopover },
  props: {
    initialX: { type: Number, required: true },
    minX: Number,
    maxX: Number,
    label: { type: String, default: undefined },
    /** The side dragging towards widens the panel: left for a panel on the right, right for a sidebar. */
    growsTo: {
      type: String as PropType<'left' | 'right'>,
      default: 'left',
    },
  },
  emits: ['resize', 'resizing'],
  data() {
    return {
      x: 0,
      delta: 0,
      xOnMouseDown: 0,
      resizing: false,
      listener: null,
    };
  },
  computed: {
    direction(): number {
      return this.growsTo === 'left' ? 1 : -1;
    },
    value() {
      let value = this.delta + this.xOnMouseDown;
      if (typeof this.minX === 'number') {
        value = Math.max(this.minX, value);
      }

      if (typeof this.maxX === 'number') {
        value = Math.min(this.maxX, value);
      }

      return value;
    },
    minDelta() {
      if (typeof this.minX !== 'number') {
        return null;
      }

      return this.initialX - this.minX;
    },
    maxDelta() {
      if (typeof this.maxX !== 'number') {
        return null;
      }

      return this.maxX - this.initialX;
    },
  },
  beforeUnmount() {
    this.removeListeners();
    if (this.resizing) document.body.style.cursor = '';
  },
  methods: {
    resizeWithKeyboard(delta: number) {
      const value = Math.min(
        this.maxX ?? Infinity,
        Math.max(this.minX ?? 0, this.initialX + delta)
      );
      this.$emit('resize', value);
    },
    onMouseDown(e: MouseEvent) {
      e.preventDefault();

      this.x = e.clientX;
      this.xOnMouseDown = this.initialX;
      this.setResizing(true);

      document.addEventListener('mousemove', this.mouseMoveListener);
      document.addEventListener('mouseup', this.mouseUpListener);
    },
    mouseUpListener(e: MouseEvent) {
      e.preventDefault();

      this.x = e.clientX;
      this.setResizing(false);

      this.$emit('resize', this.value);
      this.removeListeners();
    },
    mouseMoveListener(e: MouseEvent) {
      e.preventDefault();
      this.delta = (this.x - e.clientX) * this.direction;
      this.$emit('resize', this.value);
    },
    removeListeners() {
      document.removeEventListener('mousemove', this.mouseMoveListener);
      document.removeEventListener('mouseup', this.mouseUpListener);
    },
    setResizing(value: boolean) {
      this.resizing = value;
      this.$emit('resizing', value);

      if (value) {
        this.delta = 0;
        document.body.style.cursor = 'col-resize';
      } else {
        document.body.style.cursor = '';
      }
    },
  },
});
</script>
