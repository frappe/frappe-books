<template>
  <div class="flex min-h-0 flex-col">
    <PageHeader :title="doc && doc.inserted ? doc.name : ''">
      <!-- Template Name -->
      <template v-if="doc && !doc.inserted" #left>
        <FormControl
          ref="nameField"
          class="w-60 flex-shrink-0"
          size="small"
          :input-class="['text-xl-semibold']"
          :df="fields.name"
          :border="true"
          :value="doc!.name"
          @change="setTemplateName"
        />
      </template>
      <FrappeButton v-if="printDocument" @click="savePDF()">
        {{ t`Save as PDF` }}
      </FrappeButton>
      <FrappeButton v-if="printDocument" @click="savePDF(true)">
        {{ t`Print` }}
      </FrappeButton>
      <FrappeButton
        v-if="canEditTemplate && displayDoc"
        :label="t`Toggle Edit Mode`"
        :tooltip="t`Toggle Edit Mode`"
        icon="lucide-square-pen"
        @click="toggleEditMode"
      />
      <DropdownWithActions v-if="actions.length" :actions="actions" />
      <FrappeButton v-if="doc?.canSave" variant="solid" @click="sync()">
        {{ t`Save` }}
      </FrappeButton>
    </PageHeader>

    <!-- Template Builder Body -->
    <div
      v-if="doc"
      class="grid min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)] bg-surface-gray-1"
      :style="templateBuilderBodyStyles"
    >
      <!-- Template Display Area -->
      <div class="flex min-h-0 flex-col overflow-hidden">
        <!-- Template Container -->
        <FrappeScrollArea
          v-if="canDisplayPreview"
          orientation="both"
          class="min-h-0 flex-1"
          viewport-class="p-4 pb-10"
        >
          <PrintSheet
            v-if="printDocument"
            ref="printSheet"
            class="mx-auto shadow-sm border"
            :document="printDocument"
            :scale="Math.max(scale, 0.1)"
            :width="pageSize.width"
            :height="pageSize.height"
          />
          <FrappeAlert v-else class="m-4" theme="red" :title="t`Template Error`">
            <template #description>
              <p class="whitespace-pre-wrap">{{ error }}</p>
            </template>
          </FrappeAlert>
        </FrappeScrollArea>

        <!-- Display Hints -->
        <p v-else-if="helperMessage" class="text-sm text-ink-gray-7 p-4">
          {{ helperMessage }}
        </p>

        <!-- Bottom Bar -->
        <div
          class="sticky bottom-0 mt-auto flex h-11 w-full flex-shrink-0 items-center gap-2 border-t border-outline-gray-1 bg-surface-base px-3"
        >
          <!-- Entry Type -->
          <FormControl
            class="w-44 flex-shrink-0"
            :df="fields.doc_type"
            :border="true"
            :value="doc.get('doc_type')"
            @change="async (value: unknown) => await setType(value)"
          />
          <!-- Display FrappeDoc -->
          <Link
            v-if="doc.doc_type"
            class="w-48 min-w-0"
            :df="displayDocField"
            :border="true"
            :value="displayDoc?.name"
            @change="(value: string) => setDisplayDoc(value)"
          />

          <!-- Display Scale -->
          <label
            v-if="canDisplayPreview"
            class="ms-auto flex flex-shrink-0 items-center gap-2 text-sm text-ink-gray-6"
          >
            <span class="whitespace-nowrap">{{ t`Display Scale` }}</span>
            <FrappeTextInput
              type="number"
              class="w-16"
              :model-value="scale"
              :min="0.1"
              :max="10"
              :step="0.1"
              size="md"
              variant="outline"
              @update:model-value="setScale"
            />
          </label>
        </div>
      </div>

      <!-- Input Panel Resizer -->
      <HorizontalResizer
        :initial-x="panelWidth"
        :min-x="22 * 16"
        :max-x="maxWidth"
        style="z-index: 5"
        @resize="(x: number) => (panelWidth = x)"
      />

      <!-- Template Panel -->
      <div
        class="flex min-h-0 flex-col border-l border-outline-gray-1 bg-surface-base"
      >
        <!-- Template Editor -->
        <div class="min-h-0">
          <TemplateEditor
            v-if="hints"
            ref="templateEditor"
            class="h-full overflow-auto"
            :initial-value="doc.html ?? ''"
            :disabled="!canEditTemplate"
            :hints="hints"
            @input="() => (templateChanged = true)"
            @blur="setTemplate"
            @apply="setTemplate"
            @save="saveTemplate"
            @toggle-edit-mode="toggleEditMode"
            @toggle-hints="toggleShowHints"
          />
        </div>
        <div
          v-if="templateChanged"
          class="flex gap-2 p-2 text-sm text-ink-gray-6 items-center mt-auto border-t border-outline-gray-1"
        >
          <ShortcutKeys :keys="applyChangesShortcut" :simple="true" />
          {{ t` to apply changes` }}
        </div>

        <!-- Value Key Hints Container -->
        <div
          v-if="hints"
          class="border-t border-outline-gray-1 flex-shrink-0"
          :class="templateChanged ? '' : 'mt-auto'"
        >
          <FrappeAccordion
            :model-value="showHints ? 'hints' : undefined"
            :items="[{ value: 'hints', title: t`Key Hints` }]"
            @update:model-value="(value) => (showHints = value === 'hints')"
          >
            <template #item-content>
              <div
                class="overflow-auto"
                style="max-height: 30vh"
              >
                <TemplateBuilderHint :hints="hints" />
              </div>
            </template>
          </FrappeAccordion>
        </div>
      </div>
    </div>
    <SetPrintSize v-if="doc" v-model:open="showSizeModal" :doc="doc" />
    <SetType v-if="doc" v-model:open="showTypeModal" :doc="doc" />
  </div>
</template>
<script lang="ts">
import { EditorView } from '@codemirror/view';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { PrintFormat } from 'models/baseModels/PrintFormat';
import { ModelNameEnum } from 'models/types';
import { saveExportData } from 'reports/commonExporter';
import { Field, TargetField } from 'schemas/types';
import {
  Alert as FrappeAlert,
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { Accordion as FrappeAccordion } from 'frappe-ui-accordion';
import FormControl from 'src/components/Controls/FormControl.vue';
import Link from 'src/components/Controls/Link.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import HorizontalResizer from 'src/components/HorizontalResizer.vue';
import PageHeader from 'src/components/PageHeader.vue';
import PrintSheet from 'src/components/PrintSheet.vue';
import ShortcutKeys from 'src/components/ShortcutKeys.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog, showToast } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { getPrintHints } from 'src/utils/printFormatApi';
import {
  PageSize,
  PrintHints,
  PrintHTML,
  baseTemplate,
  getPageSize,
  getPrintDocument,
  getTemplateNameFromFile,
} from 'src/utils/printFormats';
import { docsPathRef, showSidebar } from 'src/utils/refs';
import { DocRef } from 'src/utils/types';
import {
  ShortcutKey,
  focusOrSelectFormControl,
  getActionsForDoc,
  openSettings,
  selectTextFile,
} from 'src/utils/ui';
import { syncOrSubmitDoc, useDocShortcuts } from 'src/utils/vueUtils';
import { getDocuments } from 'src/frappe/api';
import { getSchema } from 'src/frappe/registry';
import { getFrappeDocOrNew } from 'src/frappe/documents';
import { getMapFromList } from 'utils/index';
import { computed, defineComponent, inject, ref } from 'vue';
import SetPrintSize from './SetPrintSize.vue';
import SetType from './SetType.vue';
import TemplateBuilderHint from './TemplateBuilderHint.vue';
import TemplateEditor from './TemplateEditor.vue';

export default defineComponent({
  components: {
    PageHeader,
    FrappeButton,
    FrappeAccordion,
    FrappeAlert,
    FrappeScrollArea,
    DropdownWithActions,
    PrintSheet,
    HorizontalResizer,
    TemplateEditor,
    FormControl,
    TemplateBuilderHint,
    ShortcutKeys,
    Link,
    SetPrintSize,
    SetType,
    FrappeTextInput,
  },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  props: { name: { type: String, required: true } },
  setup() {
    const doc = ref(null) as DocRef<PrintFormat>;
    const shortcuts = inject(shortcutsKey);

    let context = 'TemplateBuilder';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, doc, context, false);
    }

    return {
      doc,
      context,
      shortcuts,
    };
  },
  data() {
    return {
      editMode: false,
      showHints: false,
      hints: undefined,
      print: null,
      error: '',
      previewRequest: 0,
      displayDoc: null,
      scale: 0.6,
      panelWidth: 22 /** rem */ * 16 /** px */,
      templateChanged: false,
      showTypeModal: false,
      showSizeModal: false,
      preEditMode: {
        scale: 0.6,
        showSidebar: true,
        panelWidth: 22 * 16,
      },
    } as {
      editMode: boolean;
      showHints: boolean;
      hints?: PrintHints;
      print: null | PrintHTML;
      error: string;
      previewRequest: number;
      displayDoc: FrappeDoc | null;
      showTypeModal: boolean;
      showSizeModal: boolean;
      scale: number;
      panelWidth: number;
      templateChanged: boolean;
      preEditMode: {
        scale: number;
        showSidebar: boolean;
        panelWidth: number;
      };
    };
  },
  computed: {
    canEditTemplate(): boolean {
      return !!this.doc?.canEditTemplate;
    },
    canDisplayPreview(): boolean {
      return !!this.printDocument || !!this.error;
    },
    printDocument(): string | null {
      return this.print && getPrintDocument(this.print);
    },
    pageSize(): PageSize {
      return getPageSize(this.doc?.css);
    },
    doctype(): string {
      return this.doc?.doc_type ?? '';
    },
    previewSource(): unknown[] {
      return [this.doc?.html, this.doc?.css, this.displayDoc];
    },
    applyChangesShortcut() {
      return [ShortcutKey.ctrl, ShortcutKey.enter];
    },
    view(): EditorView | null {
      // @ts-expect-error template refs are untyped
      const { view } = this.$refs.templateEditor ?? {};
      if (view instanceof EditorView) {
        return view;
      }

      return null;
    },
    maxWidth() {
      return window.innerWidth - 12 * 16 - 100;
    },
    actions() {
      if (!this.doc) {
        return [];
      }

      const actions = getActionsForDoc(this.doc as FrappeDoc);
      actions.push({
        label: this.t`Print Settings`,
        group: this.t`View`,
        action: async () => {
          await openSettings(ModelNameEnum.PrintSettings);
        },
      });

      if (this.canEditTemplate && !this.showTypeModal) {
        actions.push({
          label: this.t`Set Template Type`,
          group: this.t`Action`,
          action: () => (this.showTypeModal = true),
        });
      }

      if (this.canEditTemplate && !this.showSizeModal) {
        actions.push({
          label: this.t`Set Print Size`,
          group: this.t`Action`,
          action: () => (this.showSizeModal = true),
        });
      }

      if (this.canEditTemplate) {
        actions.push({
          label: this.t`Select Template File`,
          group: this.t`Action`,
          action: this.selectFile.bind(this),
        });
      }

      actions.push({
        label: this.t`Save Template File`,
        group: this.t`Action`,
        action: this.saveFile.bind(this),
      });

      return actions;
    },
    fields(): Record<string, Field> {
      const fields = getSchema(ModelNameEnum.PrintFormat)?.fields ?? [];
      return getMapFromList(fields, 'fieldname');
    },
    displayDocField(): TargetField {
      const target = this.doc?.printedSchemaName ?? ModelNameEnum.SalesInvoice;
      return {
        fieldname: 'displayDoc',
        label: this.t`Display Doc`,
        fieldtype: 'Link',
        target,
      };
    },
    helperMessage() {
      if (!this.doc) {
        return '';
      }

      if (!this.doc.doc_type) {
        return this.t`Select a Template type`;
      }

      if (!this.displayDoc) {
        return this.t`Select a Display Doc to view the Template`;
      }

      if (this.doc.isEditable && !this.doc.html) {
        return this.t`Set a Template value to see the Print Template`;
      }

      return '';
    },
    templateBuilderBodyStyles(): Record<string, string> {
      return { 'grid-template-columns': `auto 0px ${this.panelWidth}px` };
    },
  },
  watch: {
    previewSource() {
      void this.setPreview();
    },
  },
  async mounted() {
    await this.initialize();
  },
  async activated(): Promise<void> {
    await this.initialize();
    docsPathRef.value = docsPathMap.PrintFormat ?? '';
    this.setShortcuts();
  },
  deactivated(): void {
    docsPathRef.value = '';
    if (this.editMode) {
      this.disableEditMode();
    }

    if (this.doc?.dirty) {
      return;
    }
    this.reset();
  },
  methods: {
    async setTemplateName(value: DocValue) {
      await this.doc?.set('name', value);
    },
    setShortcuts() {
      /**
       * Node: Doc Save and Delete shortcuts are in the setup.
       */
      if (!this.shortcuts) {
        return;
      }

      this.shortcuts.ctrl.set(this.context, ['KeyE'], this.toggleEditMode.bind(this));
      this.shortcuts.ctrl.set(this.context, ['KeyH'], this.toggleShowHints.bind(this));
      this.shortcuts.ctrl.set(this.context, ['Equal'], () => this.setScale(this.scale + 0.1));
      this.shortcuts.ctrl.shift.set(this.context, ['Equal'], () =>
        this.setScale(this.scale + 0.1),
      );
      this.shortcuts.ctrl.set(this.context, ['Minus'], () => this.setScale(this.scale - 0.1));
    },
    async initialize() {
      await this.setDoc();
      // The editor takes the template once, when the hints mount it.
      if (this.doc?.notInserted && !this.doc.html) {
        await this.doc.set('html', baseTemplate);
      }

      await this.setHints();
      focusOrSelectFormControl(this.doc as FrappeDoc, this.$refs.nameField, false);
      await this.setDisplayInitialDoc();
    },
    async setHints() {
      if (this.doctype) {
        this.hints = await getPrintHints(this.doctype);
      }
    },
    async setPreview() {
      const request = ++this.previewRequest;
      try {
        const print = await this.getPreview();
        if (request === this.previewRequest) {
          this.print = print;
          this.error = '';
        }
      } catch (error) {
        if (request === this.previewRequest) {
          this.print = null;
          this.error = (error as Error).message;
        }
      }
    },
    async getPreview(): Promise<PrintHTML | null> {
      const name = this.displayDoc?.name;
      if (!this.doc || !name) {
        return null;
      }

      return await this.doc.getPrint(name);
    },
    reset() {
      this.doc = null;
      this.displayDoc = null;
      this.print = null;
      this.error = '';
    },
    getTemplateEditorState() {
      const fallback = this.doc?.html ?? '';

      if (!this.view) {
        return fallback;
      }

      return this.view.state.doc.toString();
    },
    async setTemplate(value: string) {
      this.templateChanged = false;
      if (!this.canEditTemplate) {
        return;
      }

      await this.doc?.set('html', value);
    },
    async saveTemplate(value: string) {
      await this.setTemplate(value);
      if (this.doc) {
        await syncOrSubmitDoc(this.doc);
      }
    },
    setScale(e: Event | number | string) {
      let value = this.scale;
      if (typeof e === 'number' || typeof e === 'string') {
        value = Number(e);
      }

      if (typeof e === 'number') {
        value = Number(e.toFixed(2));
      } else if (e instanceof Event && e.target instanceof HTMLInputElement) {
        value = Number(e.target.value);
      }

      this.scale = Math.max(Math.min(value, 10), 0.15);
    },
    toggleShowHints() {
      this.showHints = !this.showHints;
    },
    toggleEditMode() {
      if (!this.canEditTemplate) {
        return;
      }

      let message = this.t`Please set a Display Doc`;
      if (!this.displayDoc) {
        return showToast({ type: 'warning', message, duration: 'short' });
      }

      this.editMode = !this.editMode;

      if (this.editMode) {
        return this.enableEditMode();
      }

      this.disableEditMode();
    },
    enableEditMode() {
      this.preEditMode.showSidebar = showSidebar.value;
      this.preEditMode.panelWidth = this.panelWidth;
      this.preEditMode.scale = this.scale;

      this.panelWidth = Math.max(window.innerWidth / 2, this.panelWidth);
      showSidebar.value = false;
      this.scale = this.getEditModeScale();
      this.view?.focus();
    },
    disableEditMode() {
      showSidebar.value = this.preEditMode.showSidebar;
      this.panelWidth = this.preEditMode.panelWidth;
      this.scale = this.preEditMode.scale;
    },
    getEditModeScale(): number {
      // @ts-expect-error template refs are untyped
      const div = this.$refs.printSheet?.$el as unknown;
      if (!(div instanceof HTMLDivElement)) {
        return this.scale;
      }

      const padding = 16 * 2; /** p-4 */
      const targetWidth = window.innerWidth / 2 - padding;
      const currentWidth = div.getBoundingClientRect().width;
      const targetScale = (targetWidth * this.scale) / currentWidth;

      return Number(targetScale.toFixed(2));
    },
    savePDF(shouldPrint?: boolean) {
      const printSheet = this.$refs.printSheet as { print?: () => void };
      if (!printSheet?.print) {
        return;
      }

      // Unsaved edits print from the preview, so the browser saves the PDF.
      showToast({
        message: shouldPrint
          ? this.t`Print dialog opened`
          : this.t`Save as PDF dialog opened`,
        type: 'success',
      });
      printSheet.print();
    },
    async setDisplayInitialDoc() {
      const schemaName = this.doc?.printedSchemaName;
      if (!schemaName || this.displayDoc?.schemaName === schemaName) {
        return;
      }

      const [latest] = await getDocuments(this.doctype, {
        fields: ['name'],
        filters: [['docstatus', '!=', 2]],
        orderBy: 'creation desc',
        limit: 1,
      });

      const name = latest?.name as string | undefined;
      if (!name) {
        const label = getSchema(schemaName)?.label ?? schemaName;
        await showDialog({
          title: this.t`No Display Entries Found`,
          detail: this.t`Please create a ${label} entry to view Template Preview.`,
          type: 'warning',
        });

        return;
      }

      await this.setDisplayDoc(name);
    },
    async sync() {
      const doc = this.doc;
      if (!doc) {
        return;
      }

      try {
        await doc.sync();
      } catch (error) {
        await handleErrorWithDialog(error, doc as FrappeDoc);
      }
    },
    async setDoc() {
      if (this.doc) {
        return;
      }

      this.doc = (await getFrappeDocOrNew(
        ModelNameEnum.PrintFormat,
        this.name,
      )) as PrintFormat;
    },
    async setType(value: unknown) {
      if (typeof value !== 'string') {
        return;
      }

      await this.doc?.set('doc_type', value);
      await this.setHints();
      await this.setDisplayInitialDoc();
    },
    async setDisplayDoc(value: string) {
      if (!value) {
        this.displayDoc = null;
        return;
      }

      const schemaName = this.doc?.printedSchemaName;
      if (!schemaName) {
        return;
      }

      this.displayDoc = await getFrappeDocOrNew(schemaName, value);
    },
    async selectFile() {
      const { name: fileName, text } = await selectTextFile([
        { name: 'Template', extensions: ['template.html', 'html'] },
      ]);

      if (!text) {
        return;
      }

      await this.doc?.set('html', text);
      this.view?.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: text },
      });

      const name = getTemplateNameFromFile(fileName);
      if (name && !this.doc?.inserted) {
        await this.doc?.set('name', name);
      }
    },
    async saveFile() {
      const name = this.doc?.name;
      const template = this.getTemplateEditorState();

      if (!name) {
        return showToast({
          type: 'warning',
          message: this.t`Print Template Name not set`,
        });
      }

      if (!template) {
        return showToast({
          type: 'warning',
          message: this.t`Print Template is empty`,
        });
      }

      saveExportData(template, `${name}.template.html`, this.t`Template file saved`);
    },
  },
});
</script>
