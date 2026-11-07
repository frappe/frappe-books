<template>
  <div
    class="flex flex-1 flex-col bg-surface-gray-1"
    :class="{ 'min-h-full': isMobile }"
  >
    <PageHeader :title="isMobile ? name : t`Print view`">
      <SelectControl
        v-for="picker in pickers"
        :key="picker.title"
        :df="{
          fieldtype: 'Select',
          fieldname: picker.title,
          label: picker.name,
          options: picker.options,
        }"
        size="small"
        class="w-40"
        :border="true"
        :value="picker.value ?? ''"
        @change="(value: string | null) => picker.select(value ?? '')"
      />
      <DropdownWithActions :actions="actions" :label="t`More`" />
      <template v-if="doc?.can('print')">
        <FrappeButton @click="savePDF()">
          {{ t`Save as PDF` }}
        </FrappeButton>
        <FrappeButton variant="solid" @click="openPrintDialog()">
          {{ t`Print` }}
        </FrappeButton>
      </template>
    </PageHeader>

    <div
      v-if="isMobile && pickers.length"
      class="sticky top-0 z-10 flex flex-col gap-2 bg-surface-base px-4 py-3"
    >
      <MobilePrintPicker
        v-for="picker in pickers"
        :key="picker.title"
        :label="picker.label"
        :title="picker.title"
        :options="picker.options"
        :model-value="picker.value"
        @update:model-value="picker.select"
      />
    </div>

    <EmptyState
      v-if="helperMessage"
      class="flex-1"
      icon="lucide-printer"
      :title="helperMessage"
    />
    <!-- Template Display Area -->
    <FrappeScrollArea
      v-else
      orientation="both"
      class="min-h-0 flex-1"
      viewport-class="p-4 pb-10"
    >
      <!-- Template Container -->
      <div :class="isMobile ? 'relative w-max min-w-full' : ''">
        <PrintSheet
          v-if="printDocument"
          class="mx-auto shadow-sm border"
          :document="printDocument"
          :scale="Math.max(scale * zoom, 0.1)"
          :width="pageSize.width"
          :height="pageSize.height"
        />
        <!-- Takes the touches the preview frame would swallow. -->
        <div
          v-if="isMobile"
          class="absolute inset-0 touch-pan-x touch-pan-y"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        />
      </div>
    </FrappeScrollArea>

    <MobileFooter v-if="isMobile">
      <template v-if="canShare">
        <FrappeButton
          size="lg"
          icon="lucide-download"
          :label="t`Save as PDF`"
          :disabled="!canPrint"
          @click="savePDF()"
        />
        <FrappeButton
          class="flex-1"
          size="lg"
          icon-left="lucide-share"
          :label="t`Share`"
          :loading="isSharing"
          :disabled="!canPrint"
          @click="sharePDF()"
        />
      </template>
      <FrappeButton
        v-else
        class="flex-1"
        size="lg"
        icon-left="lucide-download"
        :label="t`Save as PDF`"
        :disabled="!canPrint"
        @click="savePDF()"
      />
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        icon-left="lucide-printer"
        :label="t`Print`"
        :disabled="!canPrint"
        @click="openPrintDialog()"
      />
    </MobileFooter>
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import type { FrappeDoc } from 'src/frappe/document';
import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { snakeCase } from 'lodash';
import { PrintFormat } from 'models/baseModels/PrintFormat';
import { ModelNameEnum } from 'models/types';
import SelectControl from 'src/components/Controls/Select.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import EmptyState from 'src/components/EmptyState.vue';
import PageHeader from 'src/components/PageHeader.vue';
import PrintSheet from 'src/components/PrintSheet.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import { getAllDocuments, getValue } from 'src/frappe/api';
import { getSchema } from 'src/frappe/registry';
import { getFrappeDoc, newFrappeDoc } from 'src/frappe/documents';
import { showToast } from 'src/utils/interactive';
import {
  canSharePDF,
  downloadPDF,
  getPDF,
  getPrintHTML,
  openPrintView,
} from 'src/utils/printFormatApi';
import {
  getPageSize,
  getPrintDocument,
  PageSize,
  PrintHTML,
} from 'src/utils/printFormats';
import { getPOSProfileName } from 'src/utils/posSetup';
import { showSidebar } from 'src/utils/refs';
import { getFormRoute, openSettings, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { defineComponent } from 'vue';
import MobilePrintPicker from './MobilePrintPicker.vue';
import { usePDFShare } from './pdfShare';
import { usePinchZoom } from './pinchZoom';

/** A print choice the header (desktop) or the sticky bar (phone) offers. */
/** A choice of the print, as the desktop select and the phone sheet both take it. */
type PickerOption = { label: string; value: string };

interface PrintPicker {
  /** What the desktop select is called. */
  name: string;
  /** The phone trigger's label and its sheet's title. */
  label: string;
  title: string;
  options: PickerOption[];
  value: string | null;
  select: (value: string) => unknown;
}

function toOptions(names: string[]): PickerOption[] {
  return names.map((name) => ({ label: name, value: name }));
}

export default defineComponent({
  name: 'PrintView',
  components: {
    PageHeader,
    FrappeButton,
    FrappeScrollArea,
    SelectControl,
    PrintSheet,
    DropdownWithActions,
    EmptyState,
    MobileFooter,
    MobilePrintPicker,
  },
  props: {
    schemaName: { type: String, required: true },
    name: { type: String, required: true },
  },
  setup() {
    return {
      isMobile,
      canShare: canSharePDF(),
      ...usePinchZoom(),
      ...usePDFShare(t`PDF ready. Tap Share again.`),
    };
  },
  data() {
    return {
      doc: null,
      scale: 1,
      print: null,
      templateDoc: null,
      templateName: null,
      templateList: [],
      templateRequest: 0,
    } as {
      doc: null | FrappeDoc;
      scale: number;
      print: null | PrintHTML;
      templateDoc: null | PrintFormat;
      templateName: null | string;
      templateList: string[];
      templateRequest: number;
    };
  },
  computed: {
    helperMessage() {
      if (!this.doc) {
        return '';
      }

      if (!this.templateList.length) {
        const label = getSchema(this.schemaName)?.label ?? this.schemaName;

        return this.t`No print templates found for entry type ${label}`;
      }

      if (!this.templateName) {
        return this.t`Please select a Print Template`;
      }

      return '';
    },
    canPrint(): boolean {
      return !!this.printDocument;
    },
    pickers(): PrintPicker[] {
      if (!this.templateList.length) {
        return [];
      }

      return [
        {
          name: this.t`Template Name`,
          label: this.t`Template`,
          title: this.t`Print Template`,
          options: toOptions(this.templateList),
          value: this.templateName,
          select: this.onTemplateNameChange,
        },
      ];
    },
    printDocument(): string | null {
      return this.print && getPrintDocument(this.print);
    },
    pageSize(): PageSize {
      return getPageSize(this.print?.style);
    },
    doctype(): string {
      return this.fyo.store.permissions?.doctypes[this.schemaName] ?? '';
    },
    actions(): Action[] {
      const actions: Action[] = [
        {
          label: this.t`Print Settings`,
          group: this.t`View`,
          async action() {
            await openSettings(ModelNameEnum.PrintSettings);
          },
        },
      ];

      const templateDocName = this.templateDoc?.name;
      if (templateDocName) {
        actions.push({
          label: templateDocName,
          group: this.t`View`,
          action: async () => {
            const route = getFormRoute(
              ModelNameEnum.PrintFormat,
              templateDocName
            );
            await routeTo(route);
          },
        });
      }

      if (this.fyo.can(ModelNameEnum.PrintFormat, 'create')) {
        actions.push(...this.createTemplateActions());
      }

      return actions;
    },
  },
  async activated() {
    await this.initialize();
  },
  unmounted() {
    this.reset();
  },
  deactivated() {
    this.reset();
  },
  methods: {
    createTemplateActions(): Action[] {
      const actions: Action[] = [
        {
          label: this.t`New template`,
          group: this.t`Create`,
          action: async () => {
            const doc = newFrappeDoc(ModelNameEnum.PrintFormat, {
              doc_type: this.doctype,
            });

            const route = getFormRoute(doc.schemaName, doc.name!);
            await routeTo(route);
          },
        },
      ];

      if (this.templateDoc?.name) {
        actions.push({
          label: this.t`Duplicate template`,
          group: this.t`Create`,
          action: async () => {
            const doc = newFrappeDoc(ModelNameEnum.PrintFormat, {
              doc_type: this.doctype,
              html: this.templateDoc?.html,
              css: this.templateDoc?.css,
            });

            const route = getFormRoute(doc.schemaName, doc.name!);
            await routeTo(route);
          },
        });
      }

      return actions;
    },
    async initialize() {
      // The hints wait for the doc, so they don't flash while the list loads.
      await this.setTemplateList();
      this.doc = await getFrappeDoc(this.schemaName, this.name);
      await this.setTemplateFromDefault();
      if (!this.templateDoc && this.templateList.length) {
        await this.onTemplateNameChange(this.templateList[0]);
      }
    },
    setScale() {
      this.scale = 1;
      const width = this.pageSize.width * 37.8;
      let containerWidth = window.innerWidth - 32;
      if (showSidebar.value && !isMobile.value) {
        containerWidth -= 12 * 16;
      }

      this.scale = Math.min(containerWidth / width, 1);
    },
    reset() {
      this.templateRequest += 1;
      this.doc = null;
      this.print = null;
      this.templateList = [];
      this.templateDoc = null;
      this.scale = 1;
      this.zoom = 1;
      this.clearKeptPDF();
    },
    async onTemplateNameChange(value: string | null): Promise<void> {
      if (!value) {
        this.templateRequest += 1;
        this.templateName = null;
        this.templateDoc = null;
        this.print = null;
        return;
      }

      if (value === this.templateName && this.templateDoc?.name === value) {
        return;
      }

      const request = ++this.templateRequest;
      this.templateName = value;
      try {
        const [templateDoc, print] = await Promise.all([
          getFrappeDoc(ModelNameEnum.PrintFormat, value),
          getPrintHTML(this.doctype, this.name, value),
        ]);
        if (request !== this.templateRequest) {
          return;
        }

        this.templateDoc = templateDoc as PrintFormat;
        this.print = print;
        this.setScale();
      } catch (error) {
        if (request === this.templateRequest) {
          await handleErrorWithDialog(error);
        }
      }
    },
    async setTemplateList(): Promise<void> {
      const list = await getAllDocuments('Print Format', {
        fields: ['name'],
        filters: [
          ['doc_type', '=', this.doctype],
          ['disabled', '=', 0],
        ],
      });
      this.templateList = list.map(({ name }) => name as string);
    },
    async savePDF() {
      if (!this.templateName) {
        return;
      }

      try {
        await downloadPDF(this.doctype, this.name, this.templateName);
      } catch (error) {
        await handleErrorWithDialog(error);
      }
    },
    /** Hands the PDF to the system share sheet, as messaging apps expect a file. */
    async sharePDF() {
      const { templateName } = this;
      if (!templateName) {
        return;
      }

      await this.share(
        [this.doctype, this.name, templateName].join('/'),
        this.name,
        () => getPDF(this.doctype, this.name, templateName)
      );
    },
    openPrintDialog() {
      if (!this.templateName) {
        return;
      }

      const opened = openPrintView(this.doctype, this.name, this.templateName);
      showToast(
        opened
          ? { message: this.t`Print dialog opened`, type: 'success' }
          : { message: this.t`Pop-up blocked`, type: 'error' }
      );
    },
    async setTemplateFromDefault() {
      const defaultName = `${snakeCase(this.schemaName)}_print_template`;

      let templateName;

      if (this.schemaName == ModelNameEnum.SalesInvoice && this.doc?.is_pos) {
        templateName = this.fyo.singles.Defaults?.pos_print_template;

        const posProfileName = await getPOSProfileName();
        const profileTemplate =
          posProfileName &&
          (await getValue('Books POS Profile', posProfileName, 'print_format'));
        if (profileTemplate) {
          templateName = profileTemplate;
        }
      } else {
        templateName = this.fyo.singles.Defaults?.get(defaultName);
      }

      if (typeof templateName !== 'string') {
        return;
      }

      await this.onTemplateNameChange(templateName);
    },
  },
});
</script>
