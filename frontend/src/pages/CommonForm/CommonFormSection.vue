<template>
  <div v-if="(fields ?? []).length > 0">
    <component :is="DefineFields">
      <div class="grid gap-4 gap-x-8 grid-cols-2">
        <div
          v-for="group in fieldGroups"
          :key="group[0].fieldname"
          :class="
            group[0].fieldtype === 'Check'
              ? 'col-span-2 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2'
              : 'contents'
          "
        >
          <div
            v-for="field of group"
            :key="field.fieldname"
            :class="[
              'min-w-0 self-start w-full',
              field.fieldtype === 'Table' ? 'col-span-2 text-base' : '',
              field.fieldtype === 'AttachImage' ? 'row-span-2' : '',
              field.fieldname === 'termsAndConditions' ? 'col-span-2' : '',
              field.invisible ? 'invisible' : '',
            ]"
            :style="field.invisible ? 'visibility: hidden;' : ''"
          >
            <Table
              v-if="field.fieldtype === 'Table'"
              ref="fields"
              :show-label="true"
              :border="true"
              :df="field"
              :value="tableValue(doc[field.fieldname])"
              @editrow="(doc: Doc) => $emit('editrow', doc)"
              @row-remove="(doc: Doc) => $emit('row-remove', doc)"
              @change="(value: DocValue) => $emit('value-change', field, value)"
              @row-change="
                (field: Field, value: DocValue, parentfield: Field) =>
                  $emit('row-change', field, value, parentfield)
              "
            />
            <FormControl
              v-else
              :ref="field.fieldname === 'name' ? 'nameField' : 'fields'"
              class="w-full"
              :layout="field.fieldtype === 'Check' ? 'inline' : undefined"
              :size="field.fieldtype === 'AttachImage' ? 'form' : undefined"
              :show-label="true"
              :border="true"
              :df="field"
              :value="doc[field.fieldname]"
              @editrow="(doc: Doc) => $emit('editrow', doc)"
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

    <FrappeAccordion
      v-if="showTitle && title"
      v-model="openSection"
      class="-mx-2"
      :items="[{ value: 'fields', title }]"
    >
      <template #item-content><component :is="ReuseFields" /></template>
    </FrappeAccordion>
    <component :is="ReuseFields" v-else />
  </div>
</template>
<script lang="ts">
import { createReusableTemplate } from '@vueuse/core';
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import { Accordion as FrappeAccordion } from 'frappe-ui-accordion';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
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
    doc: { type: Object as PropType<Doc>, required: true },
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
