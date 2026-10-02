<template>
  <div v-if="isStacked" class="space-y-1 py-3.5">
    <Table
      v-if="field.fieldtype === 'Table'"
      :show-label="true"
      :border="true"
      :df="field"
      :value="tableValue"
      @change="(value: DocValue) => $emit('change', value)"
    />
    <FormControl
      v-else
      class="w-full"
      :show-label="true"
      :border="true"
      :df="field"
      :value="doc[field.fieldname]"
      @change="(value: DocValue) => $emit('change', value)"
    />
    <FrappeErrorMessage :message="error" />
  </div>
  <FrappeSettingsRow v-else :title="field.label" :description="field.sub_label">
    <div class="space-y-1" :class="{ 'w-60': hasInputWidth }">
      <FormControl
        :class="{ 'w-full': hasInputWidth }"
        size="small"
        :border="true"
        :as-switch="field.fieldtype === 'Check' || undefined"
        :df="field"
        :value="doc[field.fieldname]"
        @change="(value: DocValue) => $emit('change', value)"
      />
      <FrappeErrorMessage :message="error" />
    </div>
  </FrappeSettingsRow>
</template>
<script lang="ts">
import {
  ErrorMessage as FrappeErrorMessage,
  SettingsRow as FrappeSettingsRow,
} from 'frappe-ui';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import Table from 'src/components/Controls/Table.vue';
import { defineComponent, PropType } from 'vue';

/** Wide fields take the row's full width under their label. */
const STACKED_FIELDTYPES = ['Table', 'Text'];
/** Fields that size themselves rather than fill an input's width. */
const SELF_SIZED_FIELDTYPES = ['Check', 'AttachImage'];

export default defineComponent({
  components: { FormControl, FrappeErrorMessage, FrappeSettingsRow, Table },
  props: {
    field: { type: Object as PropType<Field>, required: true },
    doc: { type: Object as PropType<FrappeDoc>, required: true },
    error: { type: String, default: '' },
  },
  emits: ['change'],
  computed: {
    isStacked(): boolean {
      return STACKED_FIELDTYPES.includes(this.field.fieldtype);
    },
    hasInputWidth(): boolean {
      return !SELF_SIZED_FIELDTYPES.includes(this.field.fieldtype);
    },
    tableValue(): unknown[] {
      const value = this.doc[this.field.fieldname];
      return Array.isArray(value) ? value : [];
    },
  },
});
</script>
