<template>
  <div v-if="(fields ?? []).length > 0">
    <component :is="DefineFields">
      <div class="grid gap-4 gap-x-8 grid-cols-1 md:grid-cols-2">
        <div
          v-for="group in fieldGroups"
          :key="group[0].fieldname"
          :class="
            group[0].fieldtype === 'Check'
              ? 'md:col-span-2 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2'
              : 'contents'
          "
        >
          <div
            v-for="field of group"
            :key="field.fieldname"
            :class="[
              'min-w-0 self-start w-full',
              field.fieldtype === 'Table' ? 'md:col-span-2 text-base' : '',
              field.fieldtype === 'AttachImage' ? 'md:row-span-2' : '',
              field.fieldname === 'terms_and_conditions' ? 'md:col-span-2' : '',
              field.invisible ? 'invisible' : '',
            ]"
            :style="field.invisible ? 'visibility: hidden;' : ''"
          >
            <!-- A scan adds item rows, so its field sits above them. -->
            <div
              v-if="field.fieldname === 'items' && $slots.table"
              class="mb-4 grid grid-cols-1 gap-x-8 md:grid-cols-2"
            >
              <slot name="table" />
            </div>
            <Table
              v-if="field.fieldtype === 'Table'"
              ref="fields"
              :show-label="true"
              :border="true"
              :df="field"
              :value="tableValue(doc[field.fieldname])"
              @editrow="(doc: FrappeDoc) => $emit('editrow', doc)"
              @row-remove="(doc: FrappeDoc) => $emit('row-remove', doc)"
              @change="(value: DocValue) => $emit('value-change', field, value)"
              @row-change="
                (field: Field, value: DocValue, parentfield: Field) =>
                  $emit('row-change', field, value, parentfield)
              "
            />
            <FormControl
              v-else
              :ref="field.fieldname === doc.schema.titleField ? 'nameField' : 'fields'"
              class="w-full"
              :invalid="Boolean(errors?.[field.fieldname])"
              :layout="field.fieldtype === 'Check' ? 'inline' : undefined"
              :as-switch="(switches && field.fieldtype === 'Check') || undefined"
              :size="field.fieldtype === 'AttachImage' ? 'form' : undefined"
              :show-label="true"
              :border="true"
              :df="field"
              :value="doc[field.fieldname]"
              @editrow="(doc: FrappeDoc) => $emit('editrow', doc)"
              @change="(value: DocValue) => $emit('value-change', field, value)"
              @row-change="
                (field: Field, value: DocValue, parentfield: Field) =>
                  $emit('row-change', field, value, parentfield)
              "
            />
            <FrappeErrorMessage class="mt-1" :message="errors?.[field.fieldname]" />
          </div>
        </div>
      </div>
    </component>

    <!-- The accordion is w-full, so the bleed goes on a wrapper to widen it. -->
    <div v-if="showTitle && title" class="-mx-2">
      <FrappeAccordion
        v-model="openSection"
        :items="[{ value: 'fields', title }]"
      >
        <template #item-content><component :is="ReuseFields" /></template>
      </FrappeAccordion>
    </div>
    <component :is="ReuseFields" v-else />
  </div>
</template>
<script lang="ts">
import { createReusableTemplate } from '@vueuse/core';
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import { Accordion as FrappeAccordion } from 'frappe-ui-accordion';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import Table from 'src/components/Controls/Table.vue';
import { focusOrSelectFormControl } from 'src/utils/ui';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  components: { FrappeAccordion, FrappeErrorMessage, FormControl, Table },
  props: {
    title: { type: String, default: '' },
    errors: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
    showTitle: Boolean,
    /** Checks show as switches, as settings do. */
    switches: Boolean,
    doc: { type: Object as PropType<FrappeDoc>, required: true },
    fields: { type: Array as PropType<Field[]>, required: true },
  },
  emits: ['editrow', 'row-remove', 'value-change', 'row-change'],
  setup() {
    // The fields render under an accordion header or on their own.
    const [DefineFields, ReuseFields] = createReusableTemplate();
    return { DefineFields, ReuseFields };
  },
  data() {
    return { openSection: 'fields' as string | undefined };
  },
  computed: {
    fieldGroups(): Field[][] {
      const groups: Field[][] = [];
      for (const field of this.fields) {
        const previous = groups[groups.length - 1];
        if (field.fieldtype === 'Check' && previous?.[0].fieldtype === 'Check') {
          previous.push(field);
        } else {
          groups.push([field]);
        }
      }
      return groups;
    },
  },
  mounted() {
    focusOrSelectFormControl(this.doc, this.$refs.nameField);
  },
  methods: {
    tableValue(value: unknown): unknown[] {
      if (Array.isArray(value)) {
        return value;
      }

      return [];
    },
  },
});
</script>
