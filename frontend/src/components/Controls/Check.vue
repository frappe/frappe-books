<template>
  <div
    class="books-check min-w-0 text-base"
    :class="{
      'books-check-field': showLabel && layout === 'field',
      'books-check-required': showMandatory,
    }"
    :style="containerStyles"
  >
    <div
      class="books-check-control flex min-w-0 items-center"
      :class="controlHeight"
    >
      <FrappeCheckbox
        ref="input"
        class="min-w-0 max-w-full"
        :model-value="getChecked(value)"
        :label="showLabel ? df.label : undefined"
        :aria-label="showLabel ? undefined : df.label"
        :required="isRequired"
        :disabled="isReadOnly"
        :size="frappeSize === 'lg' ? 'md' : frappeSize"
        @update:model-value="onChange"
        @focus="onFocus"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Checkbox as FrappeCheckbox } from 'frappe-ui';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';

export default defineComponent({
  name: 'Check',
  components: { FrappeCheckbox },
  extends: Base,
  props: {
    layout: {
      default: 'inline',
      type: String as PropType<'inline' | 'field'>,
    },
  },
  emits: ['focus'],
  computed: {
    controlHeight(): string {
      return { sm: 'min-h-7', md: 'min-h-8', lg: 'min-h-11' }[this.frappeSize];
    },
  },
  methods: {
    getChecked(value: unknown) {
      return Boolean(value);
    },
    onChange(value: boolean | 0 | 1) {
      if (!this.isReadOnly) {
        this.triggerChange(Boolean(value));
      }
    },
  },
});
</script>

<style scoped>
/* Reserve the same label line and gap as other fields, even without a neighbor. */
.books-check-field {
  @apply grid gap-y-1.5;
  grid-template-rows: 1lh auto;
}

.books-check-field > .books-check-control {
  grid-row: 2;
}

.books-check :deep(input) {
  flex-shrink: 0;
}

.books-check :deep(.inline-flex.items-center) {
  align-items: flex-start;
}

.books-check :deep([data-slot='label']) {
  min-width: 0;
  overflow-wrap: anywhere;
}

.books-check-required :deep([data-slot='label']) {
  @apply text-ink-red-7;
}
</style>
