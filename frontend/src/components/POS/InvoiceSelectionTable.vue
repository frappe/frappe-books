<template>
  <template v-if="isMobile">
    <FrappeList
      v-if="rows.length"
      class="-mx-4 list-row-px-4"
      :columns="['minmax(0,1fr)', 'auto', '1rem']"
      :aria-label="t`Invoices`"
    >
      <FrappeListRow
        v-for="row in rows"
        :key="getRowName(row)"
        :value="getRowName(row)"
        class="h-17"
        :aria-current="modelValue === getRowName(row) || undefined"
        @click="select(getRowName(row))"
      >
        <FrappeListCell>
          <div class="min-w-0">
            <div class="truncate text-lg text-ink-gray-8">
              {{ getRowName(row) }}
            </div>
            <div class="mt-0.5 truncate text-md text-ink-gray-5">
              {{ getRowMeta(row) }}
            </div>
          </div>
        </FrappeListCell>
        <FrappeListCell class="justify-end">
          <span
            v-if="amountField"
            class="text-lg-medium tabular-nums text-ink-gray-8"
            dir="ltr"
          >
            {{ formatCell(row, amountField) }}
          </span>
        </FrappeListCell>
        <FrappeListCell>
          <span
            v-if="modelValue === getRowName(row)"
            class="lucide-check size-4 text-ink-gray-7"
            aria-hidden="true"
          />
        </FrappeListCell>
      </FrappeListRow>
    </FrappeList>
    <p v-else class="px-4 py-6 text-center text-base text-ink-gray-6">
      {{ emptyText }}
    </p>
  </template>
  <div v-else class="flex min-h-0 flex-1 overflow-x-auto">
    <FrappeList
      :columns="listColumns"
      :row-height="48"
      divider="full"
      class="flex min-h-0 min-w-[34rem] flex-1 flex-col overflow-hidden rounded-6 border border-outline-gray-1 list-gap-2 [--list-row-padding-x:0px]"
      :active="modelValue || undefined"
      :aria-label="t`Invoices`"
      @update:active="select"
    >
      <FrappeListHeader>
        <FrappeListHeaderCell
          v-for="field in fields"
          :key="field.fieldname"
          class="px-2"
          :class="{ 'justify-end': isNumeric(field) }"
        >
          {{ field.label }}
        </FrappeListHeaderCell>
      </FrappeListHeader>

      <div v-if="rows.length" class="min-h-0 w-full flex-1 overflow-y-auto">
        <FrappeListRows :items="rows" row-key="name">
          <template #default="{ item: row, value }">
            <FrappeListRow :value="value">
              <FrappeListCell
                v-for="field in fields"
                :key="field.fieldname"
                class="min-w-0 truncate px-2 text-base text-ink-gray-8"
                :class="{ 'justify-end text-end': isNumeric(field) }"
                :title="formatCell(row, field)"
              >
                <span class="truncate">{{ formatCell(row, field) }}</span>
              </FrappeListCell>
            </FrappeListRow>
          </template>
        </FrappeListRows>
      </div>

      <div
        v-else
        class="flex min-h-0 flex-1 items-center justify-center text-sm text-ink-gray-6"
      >
        {{ emptyText }}
      </div>
    </FrappeList>
  </div>
</template>

<script lang="ts">
import { Field } from 'schemas/types';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { isMobile } from 'src/utils/viewport';
import { defineComponent, PropType } from 'vue';

type InvoiceRow = Record<string, unknown>;

export default defineComponent({
  name: 'InvoiceSelectionTable',
  components: {
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
  },
  props: {
    rows: {
      type: Array as PropType<InvoiceRow[]>,
      default: () => [],
    },
    fields: {
      type: Array as PropType<Field[]>,
      required: true,
    },
    ratios: {
      type: Array as PropType<number[]>,
      required: true,
    },
    modelValue: {
      type: String,
      default: '',
    },
    emptyText: {
      type: String,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  setup() {
    return { isMobile };
  },
  computed: {
    amountField(): Field | undefined {
      return this.fields.findLast((field) => isNumeric(field));
    },
    listColumns(): string[] {
      return this.ratios.map((ratio) => `minmax(0, ${ratio}fr)`);
    },
  },
  methods: {
    isNumeric,
    getRowName(row: InvoiceRow): string {
      return String(row.name ?? '');
    },
    /** The row's other columns, for the second line on phones. */
    getRowMeta(row: InvoiceRow): string {
      return this.fields
        .slice(1)
        .filter((field) => field !== this.amountField)
        .map((field) => this.formatCell(row, field))
        .join(' · ');
    },
    /** Phones mark the choice with a check; the List's active surface is for desktop. */
    select(name: string | undefined) {
      this.$emit('update:modelValue', name ?? '');
    },
    formatCell(row: InvoiceRow, field: Field): string {
      try {
        return fyo.format(row[field.fieldname], field) || '—';
      } catch {
        const value = row[field.fieldname];
        return value == null || value === '' ? '—' : String(value);
      }
    },
  },
});
</script>
