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
  <div v-else-if="isMobile" :style="containerStyles">
    <MobileFieldTrigger
      :label="showLabel ? df.label : undefined"
      :required="isRequired"
      :placeholder="inputPlaceholder"
      :display-value="selectedLabel"
      :invalid="invalid"
      @click="dropdownVisible = true"
    />
    <MobileOptionsSheet
      v-model:open="dropdownVisible"
      :title="df.label"
      :options="options"
      :value="selectValue"
      @select="selectOption"
    />
  </div>
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
  >
    <template v-if="inlineLabel" #prefix>
      <span class="text-ink-gray-5">{{ df.label }}</span>
    </template>
  </FrappeSelect>
</template>

<script lang="ts">
import { Select as FrappeSelect } from 'frappe-ui';
import { SelectOption } from 'schemas/types';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { defineComponent, nextTick } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  name: 'Select',
  components: {
    FrappeSelect,
    MobileFieldTrigger,
    MobileOptionsSheet,
    ReadOnlyValue,
  },
  extends: Base,
  emits: ['focus'],
  props: {
    closeDropDown: {
      type: Boolean,
      default: true,
    },
    /** Names the value inside the trigger where no label is shown. */
    inlineLabel: Boolean,
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
    selectedLabel(): string {
      const option = this.options.find((o) => o.value === this.selectValue);
      return option?.label ?? String(this.selectValue ?? '');
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
