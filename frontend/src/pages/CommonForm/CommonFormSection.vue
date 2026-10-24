<template>
  <div v-if="(fields ?? []).length > 0">
    <component :is="DefineFields">
      <p v-if="description" class="mb-4 text-p-sm text-ink-gray-5">
        {{ description }}
      </p>
      <!-- A section of calculated amounts reads as a totals block, the last one bold. -->
      <div v-if="isTotals" class="flex justify-end">
        <dl class="flex w-80 max-w-full flex-col gap-2 text-base">
          <div
            v-for="(field, index) of fields"
            :key="field.fieldname"
            class="flex justify-between gap-3"
            :class="
              index === fields.length - 1
                ? 'border-t border-outline-gray-1 pt-2 font-semibold text-ink-gray-9'
                : ''
            "
            :data-fieldname="field.fieldname"
          >
            <dt :class="index === fields.length - 1 ? '' : 'text-ink-gray-6'">
              {{ field.label }}
            </dt>
            <dd class="tabular-nums text-ink-gray-8" dir="ltr">
              {{ getTotal(field) }}
            </dd>
          </div>
        </dl>
      </div>
      <div
        v-else
        class="grid gap-4 gap-x-8 grid-cols-1 md:grid-cols-2"
        :class="{ 'lg:grid-cols-3': doc.schema.formColumns === 3 }"
      >
        <div
          v-for="group in fieldGroups"
          :key="group[0].fieldname"
          :class="
            group[0].fieldtype === 'Check'
              ? 'md:col-span-full grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2'
              : 'contents'
          "
        >
          <div
            v-for="field of group"
            :key="field.fieldname"
            :data-fieldname="field.fieldname"
            :class="[
              'min-w-0 self-start w-full',
              field.fieldtype === 'Table' ? 'md:col-span-full text-base' : '',
              isWideControl(field) ? 'md:col-span-full' : '',
              (field as TargetField).card ? 'md:col-span-full' : '',
              field.fieldtype === 'AttachImage' ? 'md:row-span-2' : '',
              field.fieldname === 'terms_and_conditions' ? 'md:col-span-full' : '',
              field.narrow ? 'md:max-w-[340px]' : '',
              field.invisible ? 'invisible' : '',
            ]"
          >
            <!-- A scan adds item rows, so its field sits above them. -->
            <div
              v-if="field.fieldname === 'items' && $slots.table"
              class="mb-4 grid grid-cols-1 gap-x-8 md:grid-cols-2"
            >
              <slot name="table" />
            </div>
            <Table
              v-if="field.fieldtype === 'Table' && !field.control"
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
              :ref="
                field.fieldname === doc.schema.titleField
                  ? 'nameField'
                  : 'fields'
              "
              class="w-full"
              :invalid="Boolean(errors?.[field.fieldname])"
              :layout="field.fieldtype === 'Check' ? 'inline' : undefined"
              :as-switch="
                (switches && field.fieldtype === 'Check') || undefined
              "
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
            <FrappeErrorMessage
              class="mt-1"
              :message="errors?.[field.fieldname]"
            />
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Field, TargetField } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import Table from 'src/components/Controls/Table.vue';
import { isCalculating } from 'src/frappe/calculated';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { focusOrSelectFormControl } from 'src/utils/ui';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  components: { FrappeAccordion, FrappeErrorMessage, FormControl, Table },
  props: {
    title: { type: String, default: '' },
    description: { type: String, default: undefined },
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
    /** Every field is an amount the server calculates, as an invoice's totals are. */
    isTotals(): boolean {
      return (
        this.fields.length > 1 &&
        this.fields.every(
          (field) => isNumeric(field) && this.doc.getFieldState(field).readOnly
        )
      );
    },
    fieldGroups(): Field[][] {
      const groups: Field[][] = [];
      for (const field of this.fields) {
        const previous = groups[groups.length - 1];
        if (
          field.fieldtype === 'Check' &&
          previous?.[0].fieldtype === 'Check'
        ) {
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
    /** Rich text and picked records span the row. */
    isWideControl({ control }: Field): boolean {
      return control === 'TextEditor' || control === 'TableMultiSelect';
    },
    getTotal(field: Field): string {
      if (isCalculating(this.doc, field)) {
        return this.t`Calculating…`;
      }

      return fyo.format(this.doc.get(field.fieldname), field, this.doc);
    },
    tableValue(value: unknown): unknown[] {
      if (Array.isArray(value)) {
        return value;
      }

      return [];
    },
  },
});
</script>
