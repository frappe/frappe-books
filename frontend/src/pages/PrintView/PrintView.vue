<template>
  <div
    class="flex flex-col flex-1"
    :class="isMobile ? 'min-h-full bg-surface-gray-2' : 'bg-surface-gray-1'"
  >
    <PageHeader :title="isMobile ? name : t`Print View`">
      <SelectControl
        v-if="templateList.length"
        :df="{
          fieldtype: 'Select',
          fieldname: 'templateName',
          label: t`Template Name`,
          options: templateList.map((n) => ({ label: n, value: n })),
        }"
        input-class="text-base py-0 h-8"
        class="w-40"
        :border="true"
        :value="templateName ?? ''"
        @change="onTemplateNameChange"
      />
      <DropdownWithActions :actions="actions" :label="t`More`" />
      <template v-if="doc?.can('print')">
        <FrappeButton variant="solid" @click="savePDF()">
          {{ t`Save as PDF` }}
        </FrappeButton>
        <FrappeButton variant="solid" @click="openPrintDialog()">
          {{ t`Print` }}
        </FrappeButton>
      </template>
    </PageHeader>

    <div
      v-if="isMobile && templateList.length"
      class="sticky top-0 z-10 bg-surface-base px-4 py-3"
    >
      <MobilePrintTemplatePicker
        :model-value="templateName"
        :templates="templateList"
        @update:model-value="onTemplateNameChange"
      />
    </div>

    <!-- Template Display Area -->
    <div
      class="overflow-auto p-4"
      :class="isMobile ? 'flex-1' : ''"
    >
      <!-- Display Hints -->
      <div
        v-if="helperMessage"
        class="text-sm text-ink-gray-7"
      >
        {{ helperMessage }}
      </div>

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
    </div>

    <MobileFooter v-if="isMobile">
      <template v-if="canShare">
        <FrappeButton
          size="lg"
          icon="lucide-download"
          :label="t`Save as PDF`"
          :disabled="!printDocument"
          @click="savePDF()"
        />
        <FrappeButton
          class="flex-1"
          size="lg"
          icon-left="lucide-share"
          :label="t`Share`"
          :loading="isSharing"
          :disabled="!printDocument"
          @click="sharePDF()"
        />
      </template>
      <FrappeButton
        v-else
        class="flex-1"
        size="lg"
        icon-left="lucide-download"
        :label="t`Save as PDF`"
        :disabled="!printDocument"
        @click="savePDF()"
      />
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        icon-left="lucide-printer"
        :label="t`Print`"
        :disabled="!printDocument"
        @click="openPrintDialog()"
      />
    </MobileFooter>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import type { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { snakeCase } from 'lodash';
import { PrintFormat } from 'models/baseModels/PrintFormat';
import { ModelNameEnum } from 'models/types';
import SelectControl from 'src/components/Controls/Select.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
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
import { showSidebar } from 'src/utils/refs';
import { getFormRoute, openSettings, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { defineComponent } from 'vue';
import MobilePrintTemplatePicker from './MobilePrintTemplatePicker.vue';
import { usePinchZoom } from './pinchZoom';

export default defineComponent({
  name: 'PrintView',
  components: {
    PageHeader,
    FrappeButton,
    SelectControl,
    PrintSheet,
    DropdownWithActions,
    MobileFooter,
    MobilePrintTemplatePicker,
  },
  props: {
    schemaName: { type: String, required: true },
    name: { type: String, required: true },
  },
  setup() {
    return { isMobile, canShare: canSharePDF(), ...usePinchZoom() };
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
      sharedPDF: null,
      isSharing: false,
    } as {
      doc: null | FrappeDoc;
      scale: number;
      print: null | PrintHTML;
      templateDoc: null | PrintFormat;
      templateName: null | string;
      templateList: string[];
      templateRequest: number;
      sharedPDF: null | { key: string; file: File };
      isSharing: boolean;
    };
  },
  computed: {
    helperMessage() {
      if (!this.templateList.length) {
        const label = getSchema(this.schemaName)?.label ?? this.schemaName;

        return this.t`No Print Templates found for entry type ${label}`;
      }

      if (!this.templateDoc) {
        return this.t`Please select a Print Template`;
      }

      return '';
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
          label: this.t`New Template`,
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
          label: this.t`Duplicate Template`,
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
      this.doc = await getFrappeDoc(this.schemaName, this.name);
      await this.setTemplateList();
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
      this.sharedPDF = null;
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
      if (!this.templateName) {
        return;
      }

      this.isSharing = true;
      try {
        const file = await this.getSharedPDF(this.templateName);
        await navigator.share({ files: [file], title: this.name });
      } catch (error) {
        await this.handleShareError(error);
      } finally {
        this.isSharing = false;
      }
    },
    async getSharedPDF(templateName: string): Promise<File> {
      const key = [this.doctype, this.name, templateName].join('/');
      if (this.sharedPDF?.key === key) {
        return this.sharedPDF.file;
      }

      const file = await getPDF(this.doctype, this.name, templateName);
      this.sharedPDF = { key, file };
      return file;
    },
    async handleShareError(error: unknown) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') {
        return;
      }

      // Fetching the PDF can outlast the tap the browser needs to share; the
      // PDF is kept, so the next tap shares at once.
      if (name === 'NotAllowedError') {
        showToast({ message: this.t`PDF ready. Tap Share again.` });
        return;
      }

      await handleErrorWithDialog(error as Error);
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

        const posProfileName = this.fyo.singles.POSSettings?.pos_profile;
        const profileTemplate =
          posProfileName &&
          (await getValue(
            'Books Pos Profile',
            posProfileName,
            'pos_print_template'
          ));
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
