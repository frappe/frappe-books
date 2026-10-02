<template>
  <div class="flex min-h-0 w-full flex-col overflow-hidden">
    <!-- Header -->
    <PageHeader :title="t`Import Wizard`">
      <DropdownWithActions
        v-if="hasImporter"
        :actions="actions"
        :disabled="isMakingEntries"
        :label="t`More`"
      />
      <FrappeButton
        v-if="hasImporter"
        :label="t`Add Row`"
        :tooltip="t`Add Row`"
        :disabled="isMakingEntries"
        icon="lucide-plus"
        @click="() => importer.addRow()"
      />
      <FrappeButton
        v-if="hasImporter"
        icon="lucide-download"
        :label="t`Save Template`"
        :tooltip="t`Save Template`"
        @click="saveTemplate"
      />
      <FrappeButton
        v-if="canImportData"
        variant="solid"
        :disabled="errorMessage.length > 0 || isMakingEntries"
        @click="importData"
      >
        {{ t`Import Data` }}
      </FrappeButton>
      <FrappeButton
        v-if="importType && !canImportData"
        variant="solid"
        @click="selectFile"
      >
        {{ t`Select File` }}
      </FrappeButton>
    </PageHeader>

    <!-- Main Body of the Wizard -->
    <div class="flex min-h-0 w-full flex-1 flex-col text-base">
      <!-- Select Import Type -->
      <div
        class="h-16 flex flex-row justify-start items-center w-full gap-2 border-b border-outline-gray-1 px-3 py-4 sm:px-5"
      >
        <AutoComplete
          :df="{
            fieldname: 'importType',
            label: t`Import Type`,
            fieldtype: 'AutoComplete',
            options: importTypeOptions,
          }"
          class="w-40 shrink-0"
          :border="true"
          :value="importType"
          size="small"
          @change="setImportType"
        />

        <FrappeErrorMessage
          v-if="errorMessage.length > 0"
          class="ms-2"
          :message="errorMessage"
        />
        <p
          v-else
          class="ms-2"
          :class="
            fileName
              ? 'text-base-semibold text-ink-gray-8'
              : 'text-base text-ink-gray-7'
          "
        >
          <span v-if="fileName">{{ t`Selected` }} </span>
          {{ helperMessage }}{{ fileName ? ',' : '' }}
          <span v-if="fileName"> {{ t`check values and click on` }} </span
          >{{ ' ' }}<span v-if="fileName">{{ t`Import Data.` }}</span>
          <span v-if="hasImporter && importer.valueMatrix.length > 0">{{
            ' ' +
            (importer.valueMatrix.length === 1
              ? t`${importer.valueMatrix.length} row added.`
              : t`${importer.valueMatrix.length} rows added.`)
          }}</span>
        </p>
      </div>

      <!-- Assignment Row and Value Grid container -->
      <FrappeScrollArea
        v-if="hasImporter"
        orientation="both"
        class="min-h-0 flex-1"
        viewport-class="pb-10"
      >
        <FrappeList
          v-if="importer.valueMatrix.length"
          :columns="listColumns"
          divider="full"
          class="w-max min-w-full list-gap-4 list-row-px-3 sm:list-row-px-5"
        >
          <FrappeListHeader class="sticky top-0 z-10 bg-surface-base">
            <FrappeListHeaderCell class="justify-center">#</FrappeListHeaderCell>
            <FrappeListHeaderCell v-for="index in columnIterator" :key="index">
              <Select
                class="min-w-0 flex-1"
                size="small"
                :border="true"
                :df="gridColumnTitleDf"
                :value="importer.assignedTemplateFields[index]!"
                @change="(value: string | null) => importer.setTemplateField(index, value)"
              />
            </FrappeListHeaderCell>
          </FrappeListHeader>

          <FrappeListRows :items="importer.valueMatrix" :row-key="getImportRowKey">
            <template #default="{ item: row, index: ridx, value }">
              <FrappeListRow :value="value" class="min-h-12 py-2">
                <FrappeListCell class="justify-center">
                  <FrappeButton
                    icon="lucide-x"
                    size="xs"
                    variant="ghost"
                    :tooltip="t`Remove row ${ridx + 1}`"
                    :aria-label="t`Remove row ${ridx + 1}`"
                    @click="importer.removeRow(ridx)"
                  />
                </FrappeListCell>

                <FrappeListCell
                  v-for="(val, cidx) of row.slice(0, columnCount)"
                  :key="`cell-${ridx}-${cidx}`"
                  class="min-w-0"
                >
                  <Data
                    v-if="!importer.assignedTemplateFields[cidx]"
                    class="min-w-0 flex-1"
                    :title="getFieldTitle(val)"
                    :df="{
                      fieldtype: 'Data',
                      fieldname: 'tempField',
                      label: t`Temporary`,
                      placeholder: t`Select column`,
                    }"
                    size="small"
                    :border="true"
                    :value="
                      val.value != null
                        ? String(val.value)
                        : val.rawValue != null
                          ? String(val.rawValue)
                          : ''
                    "
                    :read-only="true"
                  />

                  <FormControl
                    v-else
                    class="min-w-0 flex-1"
                    :class="
                      val.error
                        ? 'rounded-4 border border-outline-red-2'
                        : ''
                    "
                    :title="getFieldTitle(val)"
                    :df="importer.templateFieldsMap.get(importer.assignedTemplateFields[cidx]!)"
                    size="small"
                    :rows="1"
                    :border="true"
                    :value="val.error ? null : val.value"
                    :read-only="false"
                    @change="
                      (value: DocValue) => {
                        importer.valueMatrix[ridx][cidx]!.error = false;
                        importer.valueMatrix[ridx][cidx]!.value = value;
                      }
                    "
                  />
                </FrappeListCell>
              </FrappeListRow>
            </template>
          </FrappeListRows>
        </FrappeList>

        <div
          v-else
          class="ps-3 sm:ps-5 text-ink-gray-7 sticky left-0 flex items-center"
          style="height: 62.5px"
        >
          {{ t`No rows added. Select a file or add rows.` }}
        </div>
      </FrappeScrollArea>
    </div>

    <!-- Pick Column Dialog -->
    <FrappeDialog
      v-model:open="showColumnPicker"
      :title="t`Pick Import Columns`"
      size="3xl"
    >
      <FrappeScrollArea viewport-class="max-h-80">
        <div class="space-y-4">
          <div v-for="[key, value] of columnPickerFieldsMap.entries()" :key="key">
            <h2 class="text-sm-semibold text-ink-gray-8">
              {{ key }}
            </h2>
            <div
              class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 border border-outline-gray-1 rounded-6 mt-1 p-3"
            >
              <div v-for="tf of value" :key="tf.fieldKey" class="min-w-0">
                <Check
                  :df="{
                    fieldtype: 'Check',
                    fieldname: tf.fieldname,
                    label: tf.label,
                    required: tf.required,
                  }"
                  :show-label="true"
                  :read-only="tf.required"
                  :value="importer.templateFieldsPicked.get(tf.fieldKey)"
                  @change="(value: boolean) => pickColumn(tf.fieldKey, value)"
                />
              </div>
            </div>
          </div>
        </div>
      </FrappeScrollArea>
      <template #actions>
        <div class="flex items-center justify-between">
          <p class="text-sm text-ink-gray-6">
            {{ t`${numColumnsPicked} fields selected` }}
          </p>
          <FrappeButton variant="solid" @click="showColumnPicker = false">{{
            t`Done`
          }}</FrappeButton>
        </div>
      </template>
    </FrappeDialog>

    <!-- Import Completed Dialog -->
    <FrappeDialog
      :open="complete"
      :title="t`Import Complete`"
      size="2xl"
      @update:open="(open: boolean) => !open && clear()"
    >
      <div class="space-y-4 text-base text-ink-gray-9">
        <!-- Success -->
        <div v-if="success.length > 0">
          <div class="flex items-center justify-between gap-4 pb-2">
            <p class="text-base-semibold text-ink-gray-8">{{ t`Success` }}</p>
            <p class="text-sm text-ink-gray-6">
              {{
                success.length === 1
                  ? t`${success.length} entry imported`
                  : t`${success.length} entries imported`
              }}
            </p>
          </div>
          <div class="max-h-40 overflow-y-auto">
            <div
              v-for="(name, i) of success"
              :key="name"
              class="flex items-start gap-3 py-1.5"
            >
              <div class="w-6 flex-shrink-0 text-end">{{ i + 1 }}.</div>
              <p class="min-w-0 flex-1 break-words">
                {{ name }}
              </p>
            </div>
          </div>
        </div>

        <!-- Failed -->
        <div v-if="failed.length > 0">
          <div class="flex items-center justify-between gap-4 pb-2">
            <p class="text-base-semibold text-ink-gray-8">{{ t`Failed` }}</p>
            <p class="text-sm text-ink-gray-6">
              {{
                failed.length === 1
                  ? t`${failed.length} entry failed`
                  : t`${failed.length} entries failed`
              }}
            </p>
          </div>
          <div class="max-h-40 overflow-y-auto">
            <div
              v-for="(f, i) of failed"
              :key="f.name"
              class="grid grid-cols-[1.5rem_minmax(6rem,auto)_minmax(0,1fr)] gap-3 py-1.5"
            >
              <div class="text-end">{{ i + 1 }}.</div>
              <p class="min-w-0 break-words">
                {{ f.name }}
              </p>
              <p class="min-w-0 break-words text-ink-gray-6">
                {{ f.message }}
              </p>
            </div>
          </div>
        </div>

        <p v-if="failed.length === 0 && success.length === 0" class="text-ink-gray-8">
          {{ t`No entries were imported.` }}
        </p>
      </div>
      <template #actions>
        <div class="flex items-center justify-end gap-2">
          <FrappeButton v-if="failed.length > 0" @click="clearSuccessfullyImportedEntries">{{
            t`Fix Failed`
          }}</FrappeButton>
          <FrappeButton v-if="failed.length === 0 && success.length > 0" @click="showMe">{{
            t`Show Me`
          }}</FrappeButton>
          <FrappeButton variant="solid" @click="clear">{{ t`Done` }}</FrappeButton>
        </div>
      </template>
    </FrappeDialog>
  </div>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Action } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import {
  Button as FrappeButton,
  Dialog as FrappeDialog,
  ErrorMessage as FrappeErrorMessage,
  ScrollArea as FrappeScrollArea,
  toast,
} from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRow as FrappeListRow,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { ModelNameEnum } from 'models/types';
import { OptionField, RawValue, SelectOption } from 'schemas/types';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import Check from 'src/components/Controls/Check.vue';
import Data from 'src/components/Controls/Data.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import Select from 'src/components/Controls/Select.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { DataImport, MissingLink } from 'src/dataImport';
import { getDocType } from 'src/frappe/doctypes';
import { getDoctypeLabel, getSchema } from 'src/frappe/registry';
import {
  ImportFile,
  Importer,
  TemplateField,
  getColumnLabel,
  getGridRows,
  getImportableSchemaNames,
} from 'src/importer';
import { handleErrorWithDialog } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { downloadFile } from 'src/utils/browser';
import { showDialog } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { selectTextFile } from 'src/utils/ui';
import { defineComponent } from 'vue';

type ImportWizardData = {
  showColumnPicker: boolean;
  complete: boolean;
  success: string[];
  failed: { name: string; message: string }[];
  /** Grid rows of the failed documents, which Fix Failed keeps. */
  failedRows: number[];
  /** The Data Import the next import runs, until it has run. */
  dataImport: DataImport | null;
  file: null | { name: string; filePath: string; text: string };
  nullOrImporter: null | Importer;
  importType: string;
  isMakingEntries: boolean;
};

export default defineComponent({
  components: {
    FrappeErrorMessage,
    PageHeader,
    FormControl,
    DropdownWithActions,
    AutoComplete,
    Data,
    FrappeDialog,
    Check,
    Select,
    FrappeButton,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
    FrappeScrollArea,
  },
  data() {
    return {
      showColumnPicker: false,
      complete: false,
      success: [],
      failed: [],
      failedRows: [],
      dataImport: null,
      file: null,
      nullOrImporter: null,
      importType: '',
      isMakingEntries: false,
    } as ImportWizardData;
  },
  computed: {
    listColumns(): string[] {
      return ['4rem', ...this.columnIterator.map(() => '10rem')];
    },
    duplicates(): string[] {
      return this.hasImporter ? this.importer.getDuplicateColumns() : [];
    },
    requiredNotSelected(): string[] {
      return this.hasImporter ? this.importer.getMissingRequiredColumns() : [];
    },
    errorMessage(): string {
      if (this.duplicates.length) {
        return this.t`Duplicate columns found: ${this.duplicates.join(', ')}`;
      }

      if (this.requiredNotSelected.length) {
        return this.t`Required fields not selected: ${this.requiredNotSelected.join(', ')}`;
      }

      return '';
    },
    canImportData(): boolean {
      if (!this.hasImporter) {
        return false;
      }

      return this.importer.valueMatrix.length > 0;
    },
    canSelectFile(): boolean {
      return !this.file;
    },
    columnCount(): number {
      if (!this.hasImporter) {
        return 0;
      }

      if (!this.file) {
        return this.numColumnsPicked;
      }

      if (!this.importer.valueMatrix.length) {
        return this.importer.assignedTemplateFields.length;
      }

      return Math.min(
        this.importer.assignedTemplateFields.length,
        this.importer.valueMatrix[0].length,
      );
    },
    columnIterator(): number[] {
      return Array(this.columnCount)
        .fill(null)
        .map((_, i) => i);
    },
    hasImporter(): boolean {
      return !!this.nullOrImporter;
    },
    numColumnsPicked(): number {
      return [...this.importer.templateFieldsPicked.values()].filter(Boolean).length;
    },
    columnPickerFieldsMap(): Map<string, TemplateField[]> {
      const map: Map<string, TemplateField[]> = new Map();

      for (const value of this.importer.templateFieldsMap.values()) {
        let label = value.schemaLabel;
        if (value.parentSchemaChildField) {
          label = `${value.parentSchemaChildField.label} (${value.schemaLabel})`;
        }

        if (!map.has(label)) {
          map.set(label, []);
        }

        map.get(label)!.push(value);
      }

      return map;
    },
    importer(): Importer {
      if (!this.nullOrImporter) {
        throw new ValidationError(this.t`Importer not set, reload tool`, false);
      }

      return this.nullOrImporter as Importer;
    },
    importableSchemaNames(): ModelNameEnum[] {
      return getImportableSchemaNames(fyo);
    },
    importTypeOptions(): SelectOption[] {
      return this.importableSchemaNames.map((value) => ({
        value,
        label: getSchema(value)?.label ?? value,
      }));
    },
    actions(): Action[] {
      const actions: Action[] = [];

      let selectFileLabel = this.t`Select File`;
      if (this.file) {
        selectFileLabel = this.t`Change File`;
      }

      if (this.canImportData) {
        actions.push({
          label: selectFileLabel,
          action: this.selectFile.bind(this),
        });
      }

      const pickColumnsAction = {
        label: this.t`Pick Import Columns`,
        action: () => (this.showColumnPicker = true),
      };

      const cancelAction = {
        label: this.t`Cancel`,
        theme: 'red' as const,
        action: this.clear.bind(this),
      };
      actions.push(pickColumnsAction, cancelAction);

      return actions;
    },
    fileName(): string {
      if (!this.file) {
        return '';
      }

      return this.file.name;
    },
    helperMessage(): string {
      if (!this.importType) {
        return this.t`Set an Import Type`;
      } else if (!this.fileName) {
        return '';
      }

      return this.fileName;
    },
    isSubmittable(): boolean {
      return !!getSchema(this.importer.schemaName)?.isSubmittable;
    },
    gridColumnTitleDf(): OptionField {
      const options: SelectOption[] = [];
      for (const field of this.importer.templateFieldsMap.values()) {
        const value = field.fieldKey;
        if (!this.importer.templateFieldsPicked.get(value)) {
          continue;
        }

        const label = getColumnLabel(field);

        options.push({ value, label });
      }

      options.push({ value: '', label: this.t`None` });
      return {
        fieldname: 'col',
        fieldtype: 'Select',
        options,
      } as OptionField;
    },
    pickedArray(): string[] {
      return [...this.importer.templateFieldsPicked.entries()]
        .filter(([, picked]) => picked)
        .map(([key]) => key);
    },
  },
  watch: {
    columnCount(val) {
      if (!this.hasImporter) {
        return;
      }

      const possiblyAssigned = this.importer.assignedTemplateFields.length;
      if (val >= this.importer.assignedTemplateFields.length) {
        return;
      }

      for (let i = val; i < possiblyAssigned; i++) {
        this.importer.assignedTemplateFields[i] = null;
      }
    },
  },
  activated(): void {
    docsPathRef.value = docsPathMap.ImportWizard ?? '';
  },
  deactivated(): void {
    docsPathRef.value = '';
    if (!this.complete) {
      return;
    }

    this.clear();
  },
  methods: {
    getImportRowKey(_row: unknown, index: number): number {
      return index;
    },
    getFieldTitle(vmi: { value?: DocValue; rawValue?: RawValue; error?: boolean }): string {
      const title: string[] = [];
      if (vmi.value != null) {
        title.push(this.t`Value: ${String(vmi.value)}`);
      }

      if (vmi.rawValue != null) {
        title.push(this.t`Raw Value: ${String(vmi.rawValue)}`);
      }

      if (vmi.error) {
        title.push(this.t`Conversion Error`);
      }

      if (!title.length) {
        return this.t`No Value`;
      }

      return title.join(', ');
    },
    pickColumn(fieldKey: string, value: boolean): void {
      this.importer.pickColumn(fieldKey, value);
    },
    async showMe(): Promise<void> {
      const schemaName = this.importer.schemaName;
      this.clear();
      await this.$router.push(`/list/${schemaName}`);
    },
    clear(): void {
      this.file = null;
      this.success = [];
      this.failed = [];
      this.failedRows = [];
      this.dataImport = null;
      this.nullOrImporter = null;
      this.importType = '';
      this.complete = false;
      this.isMakingEntries = false;
    },
    async saveTemplate(): Promise<void> {
      const template = this.importer.getCSVTemplate();
      const templateName = this.importType + ' ' + this.t`Template`;
      downloadFile(template, `${templateName}.csv`, 'text/csv;charset=utf-8');
    },
    async preImportValidations(): Promise<boolean> {
      if (this.errorMessage.length) {
        return await this.showCannotImport(this.errorMessage);
      }

      const cellErrors = this.importer.checkCellErrors();
      if (cellErrors.length) {
        return await this.showCannotImport(
          this.t`Following cells have errors: ${cellErrors.join(', ')}.`
        );
      }

      return true;
    },
    /** Shows why the entries cannot be imported; resolves false. */
    async showCannotImport(detail: string): Promise<false> {
      await showDialog({ title: this.t`Cannot Import`, type: 'error', detail });
      return false;
    },
    async importData(): Promise<void> {
      const isValid = await this.preImportValidations();
      if (!isValid || this.isMakingEntries || this.complete) {
        return;
      }

      this.isMakingEntries = true;
      try {
        await this.importFile(this.importer.getImportFile());
      } finally {
        this.isMakingEntries = false;
      }
    },
    /** Frappe's Data Import checks and saves the grid's rows. */
    async importFile(file: ImportFile): Promise<void> {
      const dataImport = await this.getDataImport(await this.askShouldSubmit());
      await dataImport.setFile(file.csv, `${this.importType}.csv`);
      if (!(await this.checkImportFile(dataImport))) {
        return;
      }

      const warnings = await this.runImport(dataImport);
      if (warnings.length) {
        await this.showCannotImport(warnings.join('\n'));
        return;
      }

      await this.setResults(dataImport, file);
      this.dataImport = null;
      this.complete = true;
    },
    /** A file Frappe refused is fixed and sent again to the same Data Import, which keeps its submit choice. */
    async getDataImport(submit: boolean): Promise<DataImport> {
      if (this.dataImport?.submit !== submit) {
        this.dataImport = await DataImport.insert(this.getDoctype(), submit);
      }

      return this.dataImport;
    },
    getDoctype(): string {
      return getDocType(this.importType).doctype;
    },
    async checkImportFile(dataImport: DataImport): Promise<boolean> {
      const { missingLinks } = dataImport;
      if (missingLinks.length) {
        const links = this.getLinkLabels(missingLinks).join(', ');
        return await this.showCannotImport(
          this.t`Following links do not exist: ${links}.`
        );
      }

      const warnings = await dataImport.getWarnings();
      if (warnings.length) {
        return await this.showCannotImport(warnings.join('\n'));
      }

      return true;
    },
    /** Missing links as (schema, name), grouped by schema. */
    getLinkLabels(links: MissingLink[]): string[] {
      const doctypes = [...new Set(links.map(({ doctype }) => doctype))];
      return doctypes.flatMap((doctype) => {
        const names = links
          .filter((link) => link.doctype === doctype)
          .map(({ name }) => name);
        const label = getDoctypeLabel(doctype);
        return [...new Set(names)].map((name) => `(${label}, ${name})`);
      });
    },
    async runImport(dataImport: DataImport): Promise<string[]> {
      const progress = toast.loading(this.t`Importing entries...`);
      try {
        return await dataImport.run(({ processed, total }) => {
          toast.loading(
            this.t`${processed} entries made out of ${total}...`,
            { id: progress }
          );
        });
      } finally {
        toast.dismiss(progress);
      }
    },
    async setResults(dataImport: DataImport, file: ImportFile): Promise<void> {
      const [imported, failed] = await Promise.all([
        dataImport.getLogs('success'),
        dataImport.getLogs('failed'),
      ]);
      const failedRows = failed.map(({ rows }) => getGridRows(file, rows));
      this.success = imported.map(({ docname }) => docname ?? '');
      this.failed = failed.map(({ message }, index) => ({
        name: this.importer.getRowName(failedRows[index][0]),
        message,
      }));
      this.failedRows = failedRows.flat();
    },
    async askShouldSubmit(): Promise<boolean> {
      if (!getSchema(this.importType)?.isSubmittable) {
        return false;
      }

      let shouldSubmit = false;
      await showDialog({
        title: this.t`Submit entries?`,
        type: 'info',
        detail: this.t`Should entries be submitted after syncing?`,
        buttons: [
          {
            label: this.t`Yes`,
            action() {
              shouldSubmit = true;
            },
            isPrimary: true,
          },
          {
            label: this.t`No`,
            action() {
              return null;
            },
            isEscape: true,
          },
        ],
      });

      return shouldSubmit;
    },
    clearSuccessfullyImportedEntries() {
      const importer = this.importer;
      importer.keepRows(this.failedRows);
      this.clear();
      this.importType = importer.schemaName;
      this.nullOrImporter = importer;
    },
    setImportType(importType: string): void {
      this.clear();
      if (!importType) {
        return;
      }

      this.importType = importType;
      this.nullOrImporter = new Importer(importType, fyo);
    },
    async selectFile(): Promise<void> {
      const { text, name, filePath } = await selectTextFile([
        { name: 'CSV', extensions: ['csv'] },
      ]);

      if (!text) {
        return;
      }

      try {
        this.importer.selectFile(text);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true);
        return;
      }

      this.file = {
        name,
        filePath,
        text,
      };
    },
  },
});
</script>
<style scoped>
.index-cell {
  @apply flex pe-4 justify-end items-center border-e last:border-b border-outline-gray-1 bg-surface-base sticky left-0 -my-4 text-ink-gray-6;
}
</style>
