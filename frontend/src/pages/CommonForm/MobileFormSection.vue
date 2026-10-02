<template>
  <section v-if="visibleFields.length" class="border-b border-outline-gray-1">
    <!-- The press state is inset, as on nav sheet rows, so it keeps clear of the fields. -->
    <div v-if="kind === 'collapsible'" class="px-2 py-1">
      <button
        class="flex h-11 w-full items-center gap-2 rounded-4 px-2 text-start text-lg-semibold text-ink-gray-8 active:bg-surface-gray-1"
        :aria-expanded="isOpen"
        @click="isOpen = !isOpen"
      >
        <span class="min-w-0 flex-1 truncate">{{ title }}</span>
        <span
          v-if="hasError"
          class="size-1.5 rounded-full bg-surface-red-7"
          :aria-label="t`Has errors`"
        />
        <span
          class="lucide-chevron-down size-4 text-ink-gray-5 transition-transform"
          :class="isOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </div>
    <template v-for="block in blocks" :key="block.key">
      <div
        v-if="block.key === 'table' && tableField"
        class="flex flex-col gap-3 p-4"
      >
        <slot name="table" />
        <Table
          :data-fieldname="tableField.fieldname"
          :df="tableField"
          :value="(doc[tableField.fieldname] ?? []) as FrappeDoc[]"
          :title="tableTitle"
          @editrow="(row: FrappeDoc) => $emit('editrow', row)"
          @change="
            (value: DocValue) => $emit('value-change', tableField!, value)
          "
          @row-change="
            (field: Field, value: DocValue, parentfield: Field) =>
              $emit('row-change', field, value, parentfield)
          "
        />
        <FrappeErrorMessage :message="errors[tableField.fieldname]" />
      </div>
      <div
        v-else-if="block.groups.length && (kind !== 'collapsible' || isOpen)"
        class="flex flex-col"
        :class="getListClass(block)"
      >
        <template v-for="group in block.groups" :key="group[0].fieldname">
          <div v-if="group.length > 1" class="grid grid-cols-2 gap-3">
            <MobileFormField
              v-for="field of group"
              :key="field.fieldname"
              :field="field"
              :doc="doc"
              :error="errors[field.fieldname]"
              @change="(value: DocValue) => $emit('value-change', field, value)"
            />
          </div>
          <template v-else-if="isTotal(group[0])">
            <div
              v-for="line in getTotalLines(group[0])"
              :key="line.label"
              class="flex justify-between gap-3"
              :class="
                line.emphasis
                  ? 'border-t border-outline-gray-1 pt-2.5 text-md-semibold text-ink-gray-8 first:border-t-0 first:pt-0'
                  : 'text-ink-gray-7'
              "
              :data-fieldname="group[0].fieldname"
            >
              <span class="min-w-0 truncate">{{ line.label }}</span>
              <span class="tabular-nums" dir="ltr">{{ line.value }}</span>
            </div>
          </template>
          <MobileFormField
            v-else
            :field="group[0]"
            :doc="doc"
            :error="errors[group[0].fieldname]"
            @change="
              (value: DocValue) => $emit('value-change', group[0], value)
            "
          />
        </template>
        <slot v-if="block.key !== 'before'" name="end" />
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field, FieldTypeEnum } from 'schemas/types';
import { getRowSummary } from 'src/components/Controls/rowSummary';
import Table from 'src/components/Controls/Table.vue';
import { getFields, getSchema } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { evaluateReadOnly, hasFieldValue } from 'src/utils/doc';
import { computed, ref, watch } from 'vue';
import MobileFormField from './MobileFormField.vue';

const props = defineProps<{
  title: string;
  fields: Field[];
  doc: FrappeDoc;
  errors: Record<string, string>;
}>();

defineEmits<{
  'value-change': [field: Field, value: DocValue];
  'row-change': [field: Field, value: DocValue, parentfield: Field];
  editrow: [row: FrappeDoc];
}>();

const dateTypes: string[] = [FieldTypeEnum.Date, FieldTypeEnum.Datetime];

// Line tables (items) show as rows; read-only summary tables (taxes) as totals.
const tableField = computed(() => props.fields.find(isLineTable));
const kind = computed(() => {
  if (tableField.value) {
    return 'table';
  }

  if (props.title === 'Default') {
    return 'plain';
  }

  return props.fields.every(isTotal) ? 'totals' : 'collapsible';
});

const hasError = computed(() =>
  props.fields.some((field) => props.errors[field.fieldname])
);

// Collapsed sections open when they hold a value or an error.
const isOpen = ref(
  props.fields.some((field) => hasFieldValue(props.doc, field))
);
watch(hasError, (value) => value && (isOpen.value = true), { immediate: true });

interface FieldBlock {
  key: 'before' | 'table' | 'after' | 'fields';
  groups: Field[][];
}

/** Fields keep their schema order around the table. */
const blocks = computed<FieldBlock[]>(() => {
  const fields = visibleFields.value;
  const index = tableField.value ? fields.indexOf(tableField.value) : -1;
  if (index === -1) {
    return [{ key: 'fields', groups: groupFields(fields) }];
  }

  return [
    { key: 'before', groups: groupFields(fields.slice(0, index)) },
    { key: 'table', groups: [] },
    { key: 'after', groups: groupFields(fields.slice(index + 1)) },
  ];
});

const tableTitle = computed(() =>
  props.title === 'Default' ? tableField.value?.label : props.title
);

/** Consecutive date fields sit two to a row. */
function groupFields(fields: Field[]): Field[][] {
  const groups: Field[][] = [];
  for (const field of fields) {
    const previous = groups.at(-1);
    const isDate = dateTypes.includes(field.fieldtype);
    if (
      isDate &&
      previous?.length === 1 &&
      dateTypes.includes(previous[0].fieldtype)
    ) {
      previous.push(field);
    } else {
      groups.push([field]);
    }
  }

  return groups;
}

function getListClass(block: FieldBlock) {
  if (kind.value === 'collapsible') {
    return 'gap-4 px-4 pb-4 pt-2';
  }

  const onlyTotals = block.groups.flat().every(isTotal);
  return [
    'p-4',
    onlyTotals ? 'gap-2.5 text-md tabular-nums' : 'gap-4',
    { 'border-t border-outline-gray-1': block.key === 'after' },
  ];
}

// A finished document hides its empty fields.
const visibleFields = computed(() => {
  if (!props.doc.isSubmitted && !props.doc.isCancelled) {
    return props.fields;
  }

  return props.fields.filter((field) => hasFieldValue(props.doc, field));
});

function isLineTable(field: Field) {
  return field.fieldtype === FieldTypeEnum.Table && !field.readOnly;
}

function isTotal(field: Field) {
  if (field.fieldtype === FieldTypeEnum.Table) {
    return !!field.readOnly;
  }

  return isNumeric(field) && evaluateReadOnly(field, props.doc);
}

function getTotalLines(field: Field) {
  const emphasis =
    kind.value === 'totals' &&
    field ===
      visibleFields.value
        .filter((f) => f.fieldtype === FieldTypeEnum.Currency)
        .at(-1);

  if (field.fieldtype !== FieldTypeEnum.Table) {
    const value = fyo.format(props.doc.get(field.fieldname), field, props.doc);
    return [{ label: field.label ?? field.fieldname, value, emphasis }];
  }

  const target = (field as { target?: string }).target ?? '';
  const columns = getFields(target, getSchema(target)?.tableFields ?? []);
  return (props.doc.get(field.fieldname) as FrappeDoc[]).map((row) => {
    const { title, meta, amount } = getRowSummary(row, columns);
    return {
      label: [title, meta].filter(Boolean).join(' '),
      value: amount,
      emphasis: false,
    };
  });
}
</script>
