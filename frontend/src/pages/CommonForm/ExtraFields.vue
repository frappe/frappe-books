<template>
  <!-- Label and value rows, as the row editor's panel lists a row's own fields. -->
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
<script setup lang="ts">
import { TabButtons as FrappeTabButtons } from 'frappe-ui';
import { t } from 'fyo';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import type { FrappeDoc } from 'src/frappe/document';
import { computed } from 'vue';
import { getEndTabOptions, useExtraFields } from './extraFieldsView';

/** Accessory mode, in the row editor's panel: a row's More details and end tabs, which a form shows as its own tabs. */
const props = defineProps<{
  doc: FrappeDoc;
  errors: Record<string, string>;
  /** The selected end tab; the first one when unset or gone. */
  activeTab?: string;
}>();

defineEmits<{ 'update:activeTab': [tab: string] }>();

const { moreFields, endTabs } = useExtraFields(() => props.doc);
const tabOptions = computed(() => getEndTabOptions(endTabs.value));
const shownTab = computed(() =>
  props.activeTab && endTabs.value.has(props.activeTab)
    ? props.activeTab
    : (tabOptions.value[0]?.value ?? '')
);
</script>
