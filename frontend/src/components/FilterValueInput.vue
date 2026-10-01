<template>
  <FrappeSelect
    v-if="field?.fieldtype === 'Select' || field?.fieldtype === 'Check'"
    :options="options"
    :model-value="selectValue"
    v-bind="controlProps"
    :placeholder="t`Select a value`"
    side="bottom"
    align="start"
    @update:model-value="(value) => $emit('change', value ?? '')"
  />
  <FrappeTextInput
    v-else-if="isNativeDate"
    :type="field?.fieldtype === 'Date' ? 'date' : 'datetime-local'"
    :model-value="nativeDateValue"
    v-bind="controlProps"
    @update:model-value="onNativeDateChange"
  />
  <component
    :is="
      field?.fieldtype === 'Date' ? 'FrappeDatePicker' : 'FrappeDateTimePicker'
    "
    v-else-if="['Date', 'Datetime'].includes(field?.fieldtype ?? '')"
    :model-value="String(value ?? '')"
    v-bind="controlProps"
    :clearable="true"
    side="bottom"
    align="start"
    @change="(value: string) => $emit('change', value)"
  />
  <FilterLinkInput
    v-else-if="linkTarget && ['=', '!='].includes(condition)"
    :key="linkTarget"
    :target="linkTarget"
    v-bind="controlProps"
    :value="String(value ?? '')"
    @change="(value) => $emit('change', value)"
  />
  <AutoComplete
    v-else-if="field?.fieldtype === 'AutoComplete'"
    :df="{ ...field, label: t`Value`, readOnly: false, required: false }"
    :value="value ?? undefined"
    :border="true"
    :show-label="true"
    :show-clear-button="true"
    @change="(value: string) => $emit('change', value)"
  />
  <FrappeTextInput
    v-else
    :model-value="String(value ?? '')"
    v-bind="controlProps"
    :placeholder="t`Value`"
    :inputmode="
      field?.fieldtype === 'Int' ? 'numeric' : numeric ? 'decimal' : undefined
    "
    @update:model-value="(value) => $emit('change', value)"
    @keydown.enter.stop.prevent="$emit('apply')"
  />
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, type PropType } from 'vue';
import { t } from 'fyo';
import { getOptionList } from 'fyo/utils';
import {
  Select as FrappeSelect,
  DatePicker as FrappeDatePicker,
  DateTimePicker as FrappeDateTimePicker,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import type { Field } from 'schemas/types';
import type { FilterRow, FilterValue } from 'src/utils/filterQuery';
import { toSchemaName } from 'src/frappe/registry';
import { isMobile } from 'src/utils/viewport';
import FilterLinkInput from './FilterLinkInput.vue';

export default defineComponent({
  components: {
    FrappeSelect,
    FrappeDatePicker,
    FrappeDateTimePicker,
    FrappeTextInput,
    AutoComplete: defineAsyncComponent(
      () => import('./Controls/AutoComplete.vue')
    ),
    FilterLinkInput,
  },
  props: {
    field: Object as PropType<Field>,
    condition: { type: String, required: true },
    value: [String, Number, Boolean] as PropType<FilterValue>,
    filters: { type: Array as PropType<FilterRow[]>, required: true },
  },
  emits: ['change', 'apply'],
  computed: {
    controlProps() {
      const label = t`Value`;
      return isMobile.value
        ? ({ label, size: 'lg', variant: 'subtle' } as const)
        : ({ label, size: 'md', variant: 'outline' } as const);
    },
    options() {
      if (this.field?.fieldtype === 'Check')
        return [
          { label: t`Yes`, value: '1' },
          { label: t`No`, value: '0' },
        ];
      return this.field ? getOptionList(this.field, undefined) : [];
    },
    selectValue() {
      if (this.value === true) return '1';
      if (this.value === false) return '0';
      return this.value == null || this.value === ''
        ? undefined
        : String(this.value);
    },
    linkTarget(): string {
      if (this.field?.fieldtype === 'Link') return this.field.target;
      if (this.field?.fieldtype !== 'DynamicLink') return '';
      const reference = this.field.references;
      const values = this.filters.filter(
        (row) =>
          row.fieldname === reference && row.condition === '=' && row.value
      );
      const targets = new Set(values.map((row) => String(row.value)));
      // The type filter holds a DocType, e.g. `Books Lead`; links search its schema.
      const target = targets.size === 1 ? [...targets][0] : '';
      return toSchemaName(target) ?? '';
    },
    /** Phones use the native date and time picker. */
    isNativeDate(): boolean {
      return (
        isMobile.value &&
        ['Date', 'Datetime'].includes(this.field?.fieldtype ?? '')
      );
    },
    nativeDateValue(): string {
      const value = String(this.value ?? '');
      return this.field?.fieldtype === 'Date'
        ? value.slice(0, 10)
        : value.replace(' ', 'T').slice(0, 16);
    },
    numeric() {
      return ['Int', 'Float', 'Currency'].includes(this.field?.fieldtype ?? '');
    },
  },
  methods: {
    onNativeDateChange(value: string) {
      const isDatetime = this.field?.fieldtype === 'Datetime';
      this.$emit(
        'change',
        value && isDatetime ? `${value.replace('T', ' ')}:00` : value
      );
    },
  },
});
</script>
