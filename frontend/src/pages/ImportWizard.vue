<template>
  <div class="flex flex-col overflow-hidden w-full">
    <!-- Header -->
    <PageHeader :title="t`Import Wizard`">
      <DropdownWithActions
        v-if="hasImporter"
        :actions="actions"
        :disabled="isMakingEntries"
        :title="t`More`"
      />
      <Button
        v-if="hasImporter"
        :title="t`Add Row`"
        :disabled="isMakingEntries"
        :icon="true"
        @click="() => importer.addRow()"
      >
        <Icon name="plus" class="w-4 h-4" />
      </Button>
      <Button v-if="hasImporter" :title="t`Save Template`" :icon="true" @click="saveTemplate">
        <Icon name="download" class="w-4 h-4" />
      </Button>
      <Button
        v-if="canImportData"
        :title="t`Import Data`"
        type="primary"
        :disabled="errorMessage.length > 0 || isMakingEntries"
        @click="importData"
      >
        {{ t`Import Data` }}
      </Button>
      <Button
        v-if="importType && !canImportData"
        :title="t`Select File`"
        type="primary"
        @click="selectFile"
      >
        {{ t`Select File` }}
      </Button>
    </PageHeader>

    <!-- Main Body of the Wizard -->
    <div class="flex text-base w-full flex-col">
      <!-- Select Import Type -->
      <div
        class="h-row-largest flex flex-row justify-start items-center w-full gap-2 border-b border-outline-gray-1 p-4"
      >
        <AutoComplete
          :df="{
            fieldname: 'importType',
            label: t`Import Type`,
            fieldtype: 'AutoComplete',
            options: importableSchemaNames.map((value) => ({
              value,
              label: fyo.schemaMap[value]?.label ?? value,
            })),
          }"
          class="w-40 shrink-0"
          :border="true"
          :value="importType"
          size="small"
          @change="setImportType"
        />

        <p v-if="errorMessage.length > 0" class="text-base ms-2 text-red-500">
          {{ errorMessage }}
        </p>
        <p
          v-else
          class="text-base ms-2"
          :class="
            fileName
              ? 'text-ink-gray-9 font-semibold'
              : 'text-ink-gray-7'
          "
        >
          <span v-if="fileName" class="font-normal">{{ t`Selected` }} </span>
          {{ helperMessage }}{{ fileName ? ',' : '' }}
          <span v-if="fileName" class="font-normal"> {{ t`check values and click on` }} </span
          >{{ ' ' }}<span v-if="fileName">{{ t`Import Data.` }}</span>
          <span v-if="hasImporter && importer.valueMatrix.length > 0" class="font-normal">{{
            ' ' +
            (importer.valueMatrix.length === 1
              ? t`${importer.valueMatrix.length} row added.`
              : t`${importer.valueMatrix.length} rows added.`)
          }}</span>
        </p>
      </div>

      <!-- Assignment Row and Value Grid container -->
      <div
        v-if="hasImporter"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
        style="max-height: calc(100vh - (2 * var(--h-row-largest)) - 2px)"
      >
        <FrappeList
          v-if="importer.valueMatrix.length"
          :columns="listColumns"
          divider="full"
          class="w-max min-w-full list-gap-4"
        >
          <FrappeListHeader class="sticky top-0 z-10 !h-auto bg-surface-base px-4 py-3">
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
              <FrappeListRow :value="value" class="min-h-12 px-4 py-2">
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
          class="ps-4 text-ink-gray-7 sticky left-0 flex items-center"
          style="height: 62.5px"
        >
          {{ t`No rows added. Select a file or add rows.` }}
        </div>
      </div>
    </div>

    <!-- Loading Bar when Saving Docs -->
    <Loading
      v-if="isMakingEntries"
      :open="isMakingEntries"
      :percent="percentLoading"
      :message="messageLoading"
    />

    <!-- Pick Column Modal -->
    <Modal :open-modal="showColumnPicker" size="3xl" @closemodal="showColumnPicker = false">
      <div class="w-full">
        <!-- Pick Column Header -->
        <FormHeader :form-title="t`Pick Import Columns`" />
        <hr class="border-outline-gray-1" />

        <!-- Pick Column Checkboxes -->
        <div
          v-for="[key, value] of columnPickerFieldsMap.entries()"
          :key="key"
          class="p-4 max-h-80 overflow-auto custom-scroll custom-scroll-thumb1"
        >
          <h2 class="text-sm font-semibold text-ink-gray-8">
            {{ key }}
          </h2>
          <div
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 border border-outline-gray-1 rounded-2 mt-1 p-3"
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

        <!-- Pick Column Footer -->
        <hr class="border-outline-gray-1" />
        <div class="p-4 flex justify-between items-center">
          <p class="text-sm text-ink-gray-6">
            {{ t`${numColumnsPicked} fields selected` }}
          </p>
          <Button type="primary" @click="showColumnPicker = false">{{ t`Done` }}</Button>
        </div>
      </div>
    </Modal>

    <!-- Import Completed Modal -->
    <Modal :open-modal="complete" size="2xl" @closemodal="clear">
      <div class="w-full min-w-0">
        <!-- Import Completed Header -->
        <FormHeader :form-title="t`Import Complete`" />
        <hr class="border-outline-gray-1" />
        <!-- Success -->
        <div v-if="success.length > 0">
          <!-- Success Section Header -->
          <div class="flex items-center justify-between gap-4 px-4 pt-4 pb-2">
            <p class="text-base font-semibold text-ink-gray-8">
              {{ t`Success` }}
            </p>
            <p class="text-sm text-ink-gray-6">
              {{
                success.length === 1
                  ? t`${success.length} entry imported`
                  : t`${success.length} entries imported`
              }}
            </p>
          </div>
          <!-- Success Body -->
          <div class="max-h-40 overflow-y-auto text-ink-gray-9">
            <div
              v-for="(name, i) of success"
              :key="name"
              class="flex items-start gap-3 px-4 py-1.5 text-base"
            >
              <div class="w-6 flex-shrink-0 text-end">{{ i + 1 }}.</div>
              <p class="min-w-0 flex-1 break-words">
                {{ name }}
              </p>
            </div>
          </div>
          <hr class="border-outline-gray-1" />
        </div>

        <!-- Failed -->
        <div v-if="failed.length > 0">
          <!-- Failed Section Header -->
          <div class="flex items-center justify-between gap-4 px-4 pt-4 pb-2">
            <p class="text-base font-semibold">{{ t`Failed` }}</p>
            <p class="text-sm text-ink-gray-6">
              {{
                failed.length === 1
                  ? t`${failed.length} entry failed`
                  : t`${failed.length} entries failed`
              }}
            </p>
          </div>
          <!-- Failed Body -->
          <div class="max-h-40 overflow-y-auto text-ink-gray-9">
            <div
              v-for="(f, i) of failed"
              :key="f.name"
              class="grid grid-cols-[1.5rem_minmax(6rem,auto)_minmax(0,1fr)] gap-3 px-4 py-1.5 text-base"
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
          <hr />
        </div>

        <!-- Fallback Div -->
        <div
          v-if="failed.length === 0 && success.length === 0"
          class="p-4 text-base text-ink-gray-8"
        >
          {{ t`No entries were imported.` }}
        </div>

        <!-- Footer Button -->
        <div class="flex items-center justify-end gap-2 p-4">
          <Button v-if="failed.length > 0" @click="clearSuccessfullyImportedEntries">{{
            t`Fix Failed`
          }}</Button>
          <Button v-if="failed.length === 0 && success.length > 0" @click="showMe">{{
            t`Show Me`
          }}</Button>
          <Button type="primary" @click="clear">{{ t`Done` }}</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { Button as FrappeButton } from 'frappe-ui';
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
import Button from 'src/components/Button.vue';
import AutoComplete from 'src/components/Controls/AutoComplete.vue';
import Check from 'src/components/Controls/Check.vue';
import Data from 'src/components/Controls/Data.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import Select from 'src/components/Controls/Select.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FormHeader from 'src/components/FormHeader.vue';
import Icon from 'src/components/Icon.vue';
import Modal from 'src/components/Modal.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { Importer, TemplateField, getColumnLabel } from 'src/importer';
import { fyo } from 'src/initFyo';
import { downloadFile } from 'src/utils/browser';
import { showDialog } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { selectTextFile } from 'src/utils/ui';
import { defineComponent } from 'vue';
import Loading from '../components/Loading.vue';

type ImportWizardData = {
  showColumnPicker: boolean;
  complete: boolean;
  success: string[];
  successOldName: string[];
  failed: { name: string; message: string }[];
  file: null | { name: string; filePath: string; text: string };
  nullOrImporter: null | Importer;
  importType: string;
  isMakingEntries: boolean;
  percentLoading: number;
  messageLoading: string;
};

export default defineComponent({
  components: {
    PageHeader,
    FormControl,
    Button,
    DropdownWithActions,
    Loading,
    AutoComplete,
    Data,
    Modal,
    FormHeader,
    Icon,
    Check,
    Select,
    FrappeButton,
    FrappeList,
    FrappeListCell,
    FrappeListHeader,
    FrappeListHeaderCell,
    FrappeListRow,
    FrappeListRows,
  },
  data() {
    return {
      showColumnPicker: false,
      complete: false,
      success: [],
      successOldName: [],
      failed: [],
      file: null,
      nullOrImporter: null,
      importType: '',
      isMakingEntries: false,
      percentLoading: 0,
      messageLoading: '',
    } as ImportWizardData;
  },
  computed: {
    listColumns(): string[] {
      return ['4rem', ...this.columnIterator.map(() => '10rem')];
    },
    duplicates(): string[] {
      if (!this.hasImporter) {
        return [];
      }

      const dupes = new Set<string>();
      const assignedSet = new Set<string>();

      for (const key of this.importer.assignedTemplateFields) {
        if (!key) {
          continue;
        }

        const tf = this.importer.templateFieldsMap.get(key);
        if (assignedSet.has(key) && tf) {
          dupes.add(getColumnLabel(tf));
        }

        assignedSet.add(key);
      }

      return Array.from(dupes);
    },
    requiredNotSelected(): string[] {
      if (!this.hasImporter) {
        return [];
      }

      const assigned = new Set(this.importer.assignedTemplateFields);
      return [...this.importer.templateFieldsMap.values()]
        .filter((f) => {
          if (assigned.has(f.fieldKey) || !f.required) {
            return false;
          }

          if (f.parentSchemaChildField && !f.parentSchemaChildField.required) {
            return false;
          }

          return f.required;
        })
        .map((f) => getColumnLabel(f));
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
      const importables = [
        ModelNameEnum.SalesInvoice,
        ModelNameEnum.PurchaseInvoice,
        ModelNameEnum.Payment,
        ModelNameEnum.Party,
        ModelNameEnum.Item,
        ModelNameEnum.JournalEntry,
        ModelNameEnum.Tax,
        ModelNameEnum.Account,
        ModelNameEnum.Address,
        ModelNameEnum.NumberSeries,
      ];

      const hasInventory = fyo.doc.singles.AccountingSettings?.enableInventory;
      if (hasInventory) {
        importables.push(
          ModelNameEnum.StockMovement,
          ModelNameEnum.Shipment,
          ModelNameEnum.PurchaseReceipt,
          ModelNameEnum.Location,
        );
      }

      return importables;
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
      const schemaName = this.importer.schemaName;
      return fyo.schemaMap[schemaName]?.isSubmittable ?? false;
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
  mounted() {
    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.iw = this;
    }
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
      this.importer.templateFieldsPicked.set(fieldKey, value);
      if (value) {
        return;
      }

      const idx = this.importer.assignedTemplateFields.findIndex((f) => f === fieldKey);

      if (idx >= 0) {
        this.importer.assignedTemplateFields[idx] = null;
        this.reassignTemplateFields();
      }
    },
    reassignTemplateFields(): void {
      if (this.importer.valueMatrix.length) {
        return;
      }

      for (let idx = 0; idx < this.importer.assignedTemplateFields.length; idx++) {
        this.importer.assignedTemplateFields[idx] = null;
      }

      let idx = 0;
      for (const [fieldKey, value] of this.importer.templateFieldsPicked) {
        if (!value) {
          continue;
        }

        this.importer.assignedTemplateFields[idx] = fieldKey;
        idx += 1;
      }
    },
    async showMe(): Promise<void> {
      const schemaName = this.importer.schemaName;
      this.clear();
      await this.$router.push(`/list/${schemaName}`);
    },
    clear(): void {
      this.file = null;
      this.success = [];
      this.successOldName = [];
      this.failed = [];
      this.nullOrImporter = null;
      this.importType = '';
      this.complete = false;
      this.isMakingEntries = false;
      this.percentLoading = 0;
      this.messageLoading = '';
    },
    async saveTemplate(): Promise<void> {
      const template = this.importer.getCSVTemplate();
      const templateName = this.importType + ' ' + this.t`Template`;
      downloadFile(template, `${templateName}.csv`, 'text/csv;charset=utf-8');
    },
    async preImportValidations(): Promise<boolean> {
      const title = this.t`Cannot Import`;
      if (this.errorMessage.length) {
        await showDialog({
          title,
          type: 'error',
          detail: this.errorMessage,
        });
        return false;
      }

      const cellErrors = this.importer.checkCellErrors();
      if (cellErrors.length) {
        await showDialog({
          title,
          type: 'error',
          detail: this.t`Following cells have errors: ${cellErrors.join(', ')}.`,
        });
        return false;
      }

      const absentLinks = await this.importer.checkLinks();
      if (absentLinks.length) {
        await showDialog({
          title,
          type: 'error',
          detail: this.t`Following links do not exist: ${absentLinks
            .map((l) => `(${l.schemaLabel ?? l.schemaName}, ${l.name})`)
            .join(', ')}.`,
        });
        return false;
      }

      return true;
    },
    async importData(): Promise<void> {
      const isValid = await this.preImportValidations();
      if (!isValid || this.isMakingEntries || this.complete) {
        return;
      }

      this.isMakingEntries = true;
      this.importer.populateDocs();

      const shouldSubmit = await this.askShouldSubmit();

      const { docs } = this.importer;
      for (const [index, doc] of docs.entries()) {
        this.setLoadingStatus(index, docs.length);
        await this.importDoc(doc, shouldSubmit);
      }

      this.isMakingEntries = false;
      this.complete = true;
    },
    async importDoc(doc: Doc, shouldSubmit: boolean): Promise<void> {
      const oldName = doc.name ?? '';
      try {
        await doc.sync();
      } catch (error) {
        this.failed.push({ name: doc.name!, message: getMessage(error) });
        return;
      }

      // A saved draft must not be imported again by Fix Failed.
      this.successOldName.push(oldName);
      try {
        if (shouldSubmit) {
          await doc.submit();
        }
      } catch (error) {
        const message = getMessage(error);
        this.failed.push({
          name: doc.name!,
          message: this.t`Saved as draft, but submit failed: ${message}`,
        });
        return;
      }

      this.success.push(doc.name!);
    },
    async askShouldSubmit(): Promise<boolean> {
      if (!this.fyo.schemaMap[this.importType]?.isSubmittable) {
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
      const schemaName = this.importer.schemaName;
      const nameFieldKey = `${schemaName}.name`;
      const nameIndex = this.importer.assignedTemplateFields.findIndex((n) => n === nameFieldKey);

      const failedEntriesValueMatrix = this.importer.valueMatrix.filter((row) => {
        const value = row[nameIndex].value;
        if (typeof value !== 'string') {
          return false;
        }

        return !this.successOldName.includes(value);
      });

      this.setImportType(this.importType);
      this.importer.valueMatrix = failedEntriesValueMatrix;
    },
    setImportType(importType: string): void {
      this.clear();
      if (!importType) {
        return;
      }

      this.importType = importType;
      this.nullOrImporter = new Importer(importType, fyo);
    },
    setLoadingStatus(entriesMade: number, totalEntries: number): void {
      this.percentLoading = entriesMade / totalEntries;
      this.messageLoading = this.isMakingEntries
        ? `${entriesMade} entries made out of ${totalEntries}...`
        : '';
    },
    async selectFile(): Promise<void> {
      const { text, name, filePath } = await selectTextFile([
        { name: 'CSV', extensions: ['csv'] },
      ]);

      if (!text) {
        return;
      }

      const isValid = this.importer.selectFile(text);
      if (!isValid) {
        await showDialog({
          title: this.t`Cannot read file`,
          detail: this.t`Bad import data, could not read file.`,
          type: 'error',
        });
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

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>
<style scoped>
.index-cell {
  @apply flex pe-4 justify-end items-center border-e last:border-b border-outline-gray-1 bg-surface-base sticky left-0 -my-4 text-ink-gray-6;
}
</style>
