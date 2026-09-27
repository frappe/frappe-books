<template>
  <ReadOnlyValue
    v-if="isReadOnly"
    :df="df"
    :value="value"
    :doc="doc"
    :border="border"
    :show-label="showLabel"
    :required="isRequired"
    :size="size"
    :text-right="textRight"
    :container-styles="containerStyles"
  />
  <FrappeSelect
    v-else
    ref="input"
    :model-value="selectValue"
    :open="dropdownVisible"
    :options="options"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="inputPlaceholder"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :class="controlClasses"
    :style="containerStyles"
    side="bottom"
    align="start"
    @update:model-value="selectOption"
    @update:open="onOpenChange"
    @focus="onFocus"
  />
</template>

<script lang="ts">
import { Select as FrappeSelect } from 'frappe-ui';
import { SelectOption } from 'schemas/types';
import { defineComponent, nextTick } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  name: 'Select',
  components: { FrappeSelect, ReadOnlyValue },
  extends: Base,
  emits: ['focus'],
  props: {
    closeDropDown: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      dropdownVisible: false,
    };
  },
  computed: {
    options(): SelectOption[] {
      if (this.df.fieldtype !== 'Select') {
        return [];
      }

      return this.df.options;
    },
    selectValue(): string | number | undefined {
      if (typeof this.value === 'string' || typeof this.value === 'number') {
        return this.value;
      }

      return undefined;
    },
  },
  methods: {
    onOpenChange(open: boolean) {
      this.dropdownVisible = open;
    },
    selectOption(value: string | number | null | undefined) {
      this.triggerChange(value);

      if (!this.closeDropDown) {
        nextTick(() => {
          this.dropdownVisible = true;
        });
      }
    },
  },
});
</script>
