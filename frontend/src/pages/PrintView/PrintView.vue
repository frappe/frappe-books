<template>
  <div
    class="flex flex-col flex-1"
    :class="isMobile ? 'min-h-full bg-surface-gray-2' : 'bg-surface-gray-1'"
  >
    <PageHeader :border="true" :title="isMobile ? name : t`Print View`">
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
      class="overflow-auto custom-scroll custom-scroll-thumb1 p-4"
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
          class="mx-auto shadow-lg border"
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

    <div
      v-if="isMobile"
      class="sticky bottom-0 flex gap-2 border-t border-outline-gray-1 bg-surface-base px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <FrappeButton
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
    </div>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import { snakeCase } from 'lodash';
import { PrintFormat } from 'models/baseModels/PrintFormat';
import { ModelNameEnum } from 'models/types';
import SelectControl from 'src/components/Controls/Select.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import PrintSheet from 'src/components/PrintSheet.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  downloadPDF,
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
    MobilePrintTemplatePicker,
  },
  props: {
    schemaName: { type: String, required: true },
    name: { type: String, required: true },
  },
  setup() {
    return { isMobile, ...usePinchZoom() };
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
      doc: null | Doc;
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
      if (!this.templateList.length) {
        const label =
          this.fyo.schemaMap[this.schemaName]?.label ?? this.schemaName;

        return this.t`No Print Templates not found for entry type ${label}`;
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
            const doc = this.fyo.doc.getNewDoc(ModelNameEnum.PrintFormat, {
              docType: this.schemaName,
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
            const doc = this.fyo.doc.getNewDoc(ModelNameEnum.PrintFormat, {
              docType: this.schemaName,
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
      this.doc = await fyo.doc.getDoc(this.schemaName, this.name);
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
          this.fyo.doc.getDoc(ModelNameEnum.PrintFormat, value),
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
      const list = (await this.fyo.db.getAllRaw(ModelNameEnum.PrintFormat, {
        filters: { docType: this.schemaName, disabled: false },
      })) as { name: string }[];

      this.templateList = list.map(({ name }) => name);
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

      if (
        this.schemaName == ModelNameEnum.SalesInvoice &&
        (this.doc as Doc).isPOS
      ) {
        templateName = this.fyo.singles.Defaults?.pos_print_template;

        const posProfileName = this.fyo.singles.POSSettings?.pos_profile;

        if (posProfileName) {
          const posProfile = await this.fyo.doc.getDoc(
            ModelNameEnum.POSProfile,
            posProfileName
          );

          if (posProfile.posPrintTemplate) {
            templateName = posProfile.posPrintTemplate;
          }
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
