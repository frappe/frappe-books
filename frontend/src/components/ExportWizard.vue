<template>
  <div>
    <!-- Export Wizard Header -->
    <FormHeader :form-title="label" :form-sub-title="t`Export Wizard`" />
    <hr class="border-outline-gray-1" />

    <!-- Export Config -->
    <div class="flex flex-wrap items-end gap-4 p-4">
      <Check
        v-if="configFields.useListFilters && Object.keys(listFilters).length"
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
    <hr class="border-outline-gray-1" />

    <!-- Fields Selection -->
    <div class="max-h-80 overflow-auto custom-scroll custom-scroll-thumb2">
      <!-- Main Fields -->
      <div class="p-4">
        <h2 class="text-sm font-semibold text-ink-gray-8">
          {{ fyo.schemaMap[schemaName]?.label ?? schemaName }}
        </h2>
        <div
          class="
            mt-2
            grid grid-cols-3
            gap-x-6 gap-y-2
            rounded-2
            border
            p-3
            border-outline-gray-1
          "
        >
          <Check
            v-for="ef of fields"
            :key="ef.fieldname"
            class="min-w-0"
            :class="ef.fieldtype === 'Table' ? '[&_label]:font-semibold' : ''"
            :df="getField(ef)"
            :show-label="true"
            :value="ef.export"
            @change="(value: boolean) => setExportFieldValue(ef, value)"
          />
        </div>
      </div>

      <!-- Table Fields -->
      <div v-for="efs of filteredTableFields" :key="efs.fieldname" class="p-4">
        <h2 class="text-sm font-semibold text-ink-gray-8">
          {{ fyo.schemaMap[efs.target]?.label ?? schemaName }}
        </h2>
        <div
          class="
            mt-2
            grid grid-cols-3
            gap-x-6 gap-y-2
            rounded-2
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

    <!-- Export Button -->
    <hr class="border-outline-gray-1" />
    <div class="p-4 flex justify-between items-center">
      <p class="text-sm text-ink-gray-6">
        {{ t`${numSelected} fields selected` }}
      </p>
      <FrappeButton variant="solid" @click="exportData">{{ t`Export` }}</FrappeButton>
    </div>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';
import { Field, FieldTypeEnum } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { saveExportData } from 'reports/commonExporter';
import {
  getCsvExportData,
  getExportFields,
  getExportTableFields,
  getJsonExportData,
} from 'src/utils/export';
import { ExportField, ExportFormat, ExportTableField } from 'src/utils/types';
import { QueryFilter } from 'utils/db/types';
import { PropType, defineComponent } from 'vue';
import Check from './Controls/Check.vue';
import Int from './Controls/Int.vue';
import Select from './Controls/Select.vue';
import FormHeader from './FormHeader.vue';

interface ExportWizardData {
  useListFilters: boolean;
  exportFormat: ExportFormat;
  fields: ExportField[];
  limit: number | null;
  tableFields: ExportTableField[];
  numUnfilteredEntries: number;
}

export default defineComponent({
  components: { FormHeader, Check, Select, FrappeButton, Int },
  props: {
    schemaName: { type: String, required: true },
    listFilters: { type: Object as PropType<QueryFilter>, default: () => {} },
    pageTitle: String,
  },
  data() {
    const fields = fyo.schemaMap[this.schemaName]?.fields ?? [];
    const exportFields = getExportFields(fields);
    const exportTableFields = getExportTableFields(fields, fyo);

    return {
      limit: null,
      useListFilters: true,
      exportFormat: 'csv',
      fields: exportFields,
      tableFields: exportTableFields,
    } as ExportWizardData;
  },
  computed: {
    label() {
      if (this.pageTitle) {
        return this.pageTitle;
      }

      return fyo.schemaMap?.[this.schemaName]?.label ?? '';
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
      const filters = JSON.parse(
        JSON.stringify(this.useListFilters ? this.listFilters : {})
      );

      let data: string;
      if (this.exportFormat === 'json') {
        data = await getJsonExportData(
          this.schemaName,
          this.fields,
          this.tableFields,
          this.limit,
          filters,
          fyo
        );
      } else {
        data = await getCsvExportData(
          this.schemaName,
          this.fields,
          this.tableFields,
          this.limit,
          filters,
          fyo
        );
      }

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
