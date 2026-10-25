<template>
  <!-- The row editor's panel lists fields as label and value rows, as it does a row's own. -->
  <template v-if="compact">
    <section v-if="moreFields.length">
      <h3 class="px-3 pb-1 pt-5 text-sm text-ink-gray-5">
        {{ t`More details` }}
      </h3>
      <TwoColumnForm
        :doc="doc"
        :fields="moreFields"
        :field-errors="errors"
        :column-ratio="[1.1, 2]"
      />
    </section>
    <section v-if="tabOptions.length" class="pt-3">
      <div class="flex border-b border-outline-gray-1 px-3">
        <FrappeTabButtons
          :model-value="shownTab"
          class="-mb-px flex"
          :options="tabOptions"
          variant="underline"
          @update:model-value="(tab) => $emit('update:activeTab', String(tab))"
        />
      </div>
      <TwoColumnForm
        :key="shownTab"
        :doc="doc"
        :fields="endTabs.get(shownTab) ?? []"
        :field-errors="errors"
        :column-ratio="[1.1, 2]"
      />
    </section>
  </template>
  <template v-else>
    <CommonFormSection
      class="py-5"
      show-title
      :title="t`More details`"
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
    <section v-if="tabOptions.length" class="py-5">
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
</template>
<script setup lang="ts">
import { TabButtons as FrappeTabButtons } from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Field } from 'schemas/types';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import type { FrappeDoc } from 'src/frappe/document';
import { computed } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import { getEndTabOptions, useExtraFields } from './extraFieldsView';

/** Accessory mode: More details, then the end tabs, after a form's or a row's Books fields. */
const props = defineProps<{
  doc: FrappeDoc;
  errors: Record<string, string>;
  /** The selected end tab; the first one when unset or gone. */
  activeTab?: string;
  /** Label and value rows, as the row editor's panel shows a row's fields. */
  compact?: boolean;
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
