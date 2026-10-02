<template>
  <div
    class="books-check min-w-0 text-base"
    :class="{
      'grid grid-rows-[1lh_auto] gap-y-1.5': showLabel && layout === 'field',
    }"
    :style="containerStyles"
  >
    <!-- A field reserves the label line other fields have, even without a neighbor. -->
    <div class="row-start-2 flex min-w-0 items-center" :class="controlHeight">
      <!-- The box stays beside the first line of a wrapped label. -->
      <component
        :is="asSwitch ? 'FrappeSwitch' : 'FrappeCheckbox'"
        ref="input"
        class="min-w-0 [&_[data-slot=control]]:self-start"
        :class="[
          asSwitch ? 'w-full' : 'max-w-full',
          { '[&_[data-slot=label]]:text-ink-red-7': showMandatory },
        ]"
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
import {
  Checkbox as FrappeCheckbox,
  Switch as FrappeSwitch,
} from 'frappe-ui';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';

export default defineComponent({
  name: 'Check',
  components: { FrappeCheckbox, FrappeSwitch },
  extends: Base,
  props: {
    layout: {
      default: 'inline',
      type: String as PropType<'inline' | 'field'>,
    },
    /** Settings turn things on and off with a switch. */
    asSwitch: { type: Boolean, default: false },
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
