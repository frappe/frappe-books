<template>
  <FrappeDialog
    :open="open"
    :title="t`Export ${label}`"
    size="4xl"
    @update:open="(value: boolean) => $emit('update:open', value)"
  >
    <!-- Export Config -->
    <div class="flex flex-wrap items-end gap-4">
      <Check
        v-if="configFields.useListFilters && listFilters.length"
        class="w-56"
        layout="field"
        :df="configFields.useListFilters"
        :show-label="true"
        :value="useListFilters"
        :border="true"
        @change="(value: boolean) => (useListFilters = value)"
      />
      <Select
        v-if="configFields.exportFormat"
        class="w-56"
        :df="configFields.exportFormat"
        :value="exportFormat"
        :border="true"
        :show-label="true"
        @change="(value: ExportFormat) => (exportFormat = value)"
      />
      <Int
        v-if="configFields.limit"
        class="w-56"
        :df="configFields.limit"
        :value="limit ?? undefined"
        :border="true"
        :show-label="true"
        :text-right="false"
        @change="(value: number) => (limit = value)"
      />
    </div>

    <!-- Fields Selection -->
    <FrappeScrollArea class="mt-4" viewport-class="max-h-80">
      <div class="space-y-4">
        <!-- Main Fields -->
        <div>
          <h2 class="text-sm-semibold text-ink-gray-8">
            {{ getSchemaLabel(schemaName) }}
          </h2>
          <div
            class="
              mt-2
              grid grid-cols-3
              gap-x-6 gap-y-2
              rounded-6
              border
              p-3
              border-outline-gray-1
            "
          >
            <Check
              v-for="ef of fields"
              :key="ef.fieldname"
              class="min-w-0"
              :df="getField(ef)"
              :show-label="true"
              :value="ef.export"
              @change="(value: boolean) => setExportFieldValue(ef, value)"
            />
          </div>
        </div>

        <!-- Table Fields -->
        <div v-for="efs of filteredTableFields" :key="efs.fieldname">
          <h2 class="text-sm-semibold text-ink-gray-8">
            {{ getSchemaLabel(efs.target) }}
          </h2>
          <div
            class="
              mt-2
              grid grid-cols-3
              gap-x-6 gap-y-2
              rounded-6
              border
              p-3
              border-outline-gray-1
            "
          >
            <Check
              v-for="ef of efs.fields"
              :key="ef.fieldname"
              class="min-w-0"
              :df="getField(ef)"
              :show-label="true"
              :value="ef.export"
              @change="(value: boolean) => setExportFieldValue(ef, value, efs.target)"
            />
          </div>
        </div>
      </div>
    </FrappeScrollArea>

    <template #actions>
      <div class="flex items-center justify-between">
        <p class="text-sm text-ink-gray-6">
          {{ t`${numSelected} fields selected` }}
        </p>
        <FrappeButton variant="solid" @click="exportData">{{
          t`Export`
        }}</FrappeButton>
      </div>
    </template>
  </FrappeDialog>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  Dialog as FrappeDialog,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { t } from 'fyo';
import { exportsOwnDocumentsOnly } from 'fyo/utils/permissions';
import { Field, FieldTypeEnum } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import { getSchema } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { saveExportData } from 'reports/commonExporter';
import {
  getCsvExportData,
  getExportFields,
  getExportTableFields,
  getJsonExportData,
} from 'src/utils/export';
import { ExportField, ExportFormat, ExportTableField } from 'src/utils/types';
import { PropType, defineComponent } from 'vue';
import Check from './Controls/Check.vue';
import Int from './Controls/Int.vue';
import Select from './Controls/Select.vue';

interface ExportWizardData {
  useListFilters: boolean;
  exportFormat: ExportFormat;
  fields: ExportField[];
  limit: number | null;
  tableFields: ExportTableField[];
  numUnfilteredEntries: number;
}

export default defineComponent({
  components: {
    FrappeDialog,
    FrappeScrollArea,
    Check,
    Select,
    FrappeButton,
    Int,
  },
  props: {
    open: { type: Boolean, default: false },
    schemaName: { type: String, required: true },
    listFilters: { type: Array as PropType<Filter[]>, default: () => [] },
    pageTitle: String,
  },
  emits: ['update:open'],
  data() {
    return {
      limit: null,
      useListFilters: true,
      exportFormat: 'csv',
      fields: getExportFields(this.schemaName),
      tableFields: getExportTableFields(this.schemaName),
    } as ExportWizardData;
  },
  computed: {
    label() {
      if (this.pageTitle) {
        return this.pageTitle;
      }

      return getSchema(this.schemaName)?.label ?? '';
    },
    filteredTableFields() {
      return this.tableFields.filter((f) => {
        const ef = this.getExportField(f.fieldname);
        return !!ef?.export;
      });
    },
    numSelected() {
      return (
        this.filteredTableFields.reduce(
          (acc, f) => f.fields.filter((f) => f.export).length + acc,
          0
        ) +
        this.fields.filter(
          (f) => f.fieldtype !== FieldTypeEnum.Table && f.export
        ).length
      );
    },
    configFields() {
      return {
        useListFilters: {
          fieldtype: 'Check',
          label: t`Use List Filters`,
          fieldname: 'useListFilters',
        } as Field,
        limit: {
          placeholder: t`No limit`,
          fieldtype: 'Int',
          label: t`Limit number of rows`,
          fieldname: 'limit',
        } as Field,
        exportFormat: {
          fieldtype: 'Select',
          label: t`Export Format`,
          fieldname: 'exportFormat',
          options: [
            { value: 'json', label: 'JSON' },
            { value: 'csv', label: 'CSV' },
          ],
        } as Field,
      };
    },
  },
  methods: {
    getSchemaLabel(schemaName: string): string {
      return getSchema(schemaName)?.label ?? schemaName;
    },
    getField(ef: ExportField): Field {
      return {
        fieldtype: 'Check',
        label: ef.label,
        fieldname: ef.fieldname,
      };
    },
    getExportField(
      fieldname: string,
      target?: string
    ): ExportField | undefined {
      let fields: ExportField[] | undefined;

      if (!target) {
        fields = this.fields;
      } else {
        fields = this.tableFields.find((f) => f.target === target)?.fields;
      }

      if (!fields) {
        return undefined;
      }

      return fields.find((f) => f.fieldname === fieldname);
    },
    setExportFieldValue(ef: ExportField, value: boolean, target?: string) {
      const field = this.getExportField(ef.fieldname, target);
      if (!field) {
        return;
      }

      field.export = value;
    },
    async exportData() {
      let filters = this.useListFilters ? this.listFilters : [];
      if (exportsOwnDocumentsOnly(fyo.store.permissions, this.schemaName)) {
        filters = [
          ...filters.filter(([fieldname]) => fieldname !== 'owner'),
          ['owner', '=', fyo.user],
        ];
      }

      const query = {
        schemaName: this.schemaName,
        fields: this.fields,
        tableFields: this.tableFields,
        limit: this.limit,
        filters,
      };
      const data =
        this.exportFormat === 'json'
          ? await getJsonExportData(query)
          : await getCsvExportData(query);

      await this.saveExportData(data);
    },
    async saveExportData(data: string) {
      const fileName = this.getFileName();
      saveExportData(
        data,
        `${fileName}.${this.exportFormat}`,
        fyo.t`Export Successful`
      );
    },
    getFileName() {
      const fileName = this.label.toLowerCase().replace(/\s/g, '-');
      const dateString = new Date().toISOString().split('T')[0];
      return `${fileName}_${dateString}`;
    },
  },
});
</script>
