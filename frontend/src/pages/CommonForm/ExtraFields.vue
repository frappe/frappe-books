<template>
  <section v-if="moreFields.length" class="py-5" data-section="more-details">
    <h3 class="mb-4 text-lg-semibold text-ink-gray-9">{{ t`More details` }}</h3>
    <CommonFormSection
      :fields="moreFields"
      :doc="doc"
      :errors="errors"
      @editrow="(row: FrappeDoc) => $emit('editrow', row)"
      @value-change="
        (field: Field, value: DocValue) => $emit('value-change', field, value)
      "
      @row-change="
        (field: Field, value: DocValue, parentfield: Field) =>
          $emit('row-change', field, value, parentfield)
      "
    />
  </section>
  <section v-if="tabOptions.length" class="py-5" data-section="end-tabs">
    <div class="mb-4 flex border-b border-outline-gray-1">
      <FrappeTabButtons
        :model-value="shownTab"
        class="-mb-px flex"
        :options="tabOptions"
        variant="underline"
        @update:model-value="(tab) => $emit('update:activeTab', String(tab))"
      />
    </div>
    <CommonFormSection
      :key="shownTab"
      :fields="endTabs.get(shownTab) ?? []"
      :doc="doc"
      :errors="errors"
      @editrow="(row: FrappeDoc) => $emit('editrow', row)"
      @value-change="
        (field: Field, value: DocValue) => $emit('value-change', field, value)
      "
      @row-change="
        (field: Field, value: DocValue, parentfield: Field) =>
          $emit('row-change', field, value, parentfield)
      "
    />
  </section>
</template>
<script setup lang="ts">
import { TabButtons as FrappeTabButtons } from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import { Field } from 'schemas/types';
import type { FrappeDoc } from 'src/frappe/document';
import { computed } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import { getEndTabOptions, useExtraFields } from './extraFieldsView';

/** Accessory mode: More details, then the end tabs, after a form's Books fields. */
const props = defineProps<{
  doc: FrappeDoc;
  errors: Record<string, string>;
  /** The selected end tab; the first one when unset or gone. */
  activeTab?: string;
}>();

defineEmits<{
  'update:activeTab': [tab: string];
  'value-change': [field: Field, value: DocValue];
  'row-change': [field: Field, value: DocValue, parentfield: Field];
  editrow: [row: FrappeDoc];
}>();

const { moreFields, endTabs } = useExtraFields(() => props.doc);
const tabOptions = computed(() => getEndTabOptions(endTabs.value));
const shownTab = computed(() =>
  props.activeTab && endTabs.value.has(props.activeTab)
    ? props.activeTab
    : (tabOptions.value[0]?.value ?? '')
);
</script>
