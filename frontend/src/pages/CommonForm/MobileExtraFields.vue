<template>
  <MobileFormSection
    v-if="moreFields.length"
    :title="t`More details`"
    :fields="moreFields"
    :doc="doc"
    :errors="errors"
    collapsible
    :summary="getCount(moreFields)"
    :required-count="getRequiredCount(moreFields)"
    :open="getRequiredCount(moreFields) > 0"
    @value-change="(field, value) => $emit('value-change', field, value)"
    @row-change="
      (field, value, parentfield) =>
        $emit('row-change', field, value, parentfield)
    "
    @editrow="(row) => $emit('editrow', row)"
  />
  <MobileFormSection
    v-for="([tab, fields], index) of endTabs"
    :key="tab"
    :title="getEndTabLabel(tab)"
    :fields="fields"
    :doc="doc"
    :errors="errors"
    collapsible
    :summary="getCount(fields)"
    :required-count="getRequiredCount(fields)"
    :open="index === 0"
    @value-change="(field, value) => $emit('value-change', field, value)"
    @row-change="
      (field, value, parentfield) =>
        $emit('row-change', field, value, parentfield)
    "
    @editrow="(row) => $emit('editrow', row)"
  />
</template>
<script setup lang="ts">
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Field } from 'schemas/types';
import type { FrappeDoc } from 'src/frappe/document';
import { isMissing } from 'src/frappe/extraFields';
import { getEndTabLabel, useExtraFields } from './extraFieldsView';
import MobileFormSection from './MobileFormSection.vue';

/** Accessory mode on phones: More details and each end tab as a collapsible section. */
const props = defineProps<{
  doc: FrappeDoc;
  errors: Record<string, string>;
}>();

defineEmits<{
  'value-change': [field: Field, value: DocValue];
  'row-change': [field: Field, value: DocValue, parentfield: Field];
  editrow: [row: FrappeDoc];
}>();

const { moreFields, endTabs } = useExtraFields(() => props.doc);

function getCount(fields: Field[]): string {
  return fields.length === 1 ? t`1 field` : t`${fields.length} fields`;
}

/** Empty mandatory fields the user can still fill. */
function getRequiredCount(fields: Field[]): number {
  return fields.filter(
    (field) =>
      !props.doc.getFieldState(field).readOnly && isMissing(props.doc, field)
  ).length;
}
</script>
