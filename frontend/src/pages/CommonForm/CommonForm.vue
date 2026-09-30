<template>
  <div v-if="isMobile" class="flex min-h-full flex-col">
    <MobileForm
      v-if="hasDoc"
      v-model:active-tab="activeTab"
      :doc="doc"
      :title="title"
      :grouped-fields="groupedFields"
      :errors="errors"
      :missing-fields="missingFields"
      :can-print="canPrint"
      :can-show-links="canShowLinks"
      @value-change="onValueChange"
      @row-change="updateGroupedFields"
      @editrow="(doc: Doc) => showRowEditForm(doc)"
      @sync="sync"
      @submit="submit"
      @print="openPrintView"
      @show-links="showLinks = true"
    >
      <template v-if="canShowExchangeRate" #exchange-rate>
        <ExchangeRate v-bind="exchangeRateProps" @change="setExchangeRate" />
      </template>
      <template v-if="canShowBarcode" #barcode>
        <Barcode @item-selected="addItem" />
      </template>
    </MobileForm>
    <LinkedEntries
      v-if="showLinks && canShowLinks"
      :doc="doc"
      @close="showLinks = false"
    />
    <RowEditForm
      v-if="row && !showLinks"
      :doc="doc"
      :fieldname="row.fieldname"
      :index="row.index"
      @close="() => (row = null)"
    />
  </div>
  <FormContainer v-else :use-full-width="useFullWidth">
    <template v-if="hasDoc" #header-left>
      <Barcode v-if="canShowBarcode" @item-selected="addItem" />
      <ExchangeRate
        v-if="canShowExchangeRate"
        v-bind="exchangeRateProps"
        @change="setExchangeRate"
      />
      <p
        v-if="schema.label && !(canShowBarcode || canShowExchangeRate)"
        class="text-xl font-semibold items-center text-ink-gray-6"
      >
        {{ schema.label }}
      </p>
    </template>
    <template v-if="hasDoc" #header>
      <FrappeButton
        v-if="canShowLinks"
        icon="lucide-link"
        :label="t`View linked entries`"
        :tooltip="t`View linked entries`"
        @click="showLinks = true"
      />
      <FrappeButton
        v-if="canPrint"
        icon="lucide-printer"
        :label="t`Open Print View`"
        :tooltip="t`Open Print View`"
        @click="openPrintView"
      />
      <FrappeButton
        :icon="useFullWidth ? 'lucide-minimize-2' : 'lucide-maximize-2'"
        :label="t`Toggle between form and full width`"
        :tooltip="t`Toggle between form and full width`"
        @click="toggleWidth"
      />
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.label"
        :type="group.type"
        :actions="group.actions"
      >
        <template v-if="group.group" #default>{{ group.group }}</template>
      </DropdownWithActions>
      <FrappeButton
        v-if="doc?.canSave"
        variant="solid"
        :disabled="doc.isSyncing"
        @click="sync"
      >
        {{ t`Save` }}
      </FrappeButton>
      <FrappeButton v-else-if="doc?.canSubmit" variant="solid" @click="submit">{{ t`Submit` }}</FrappeButton>
    </template>
    <template #body>
      <FormHeader
        :form-title="title"
        class="sticky top-0 bg-surface-base border-b border-outline-gray-1"
      >
        <StatusPill v-if="hasDoc" :doc="doc" />
      </FormHeader>

      <!-- Section Container -->
      <div v-if="hasDoc" class="overflow-auto custom-scroll custom-scroll-thumb1">
        <CommonFormSection
          v-for="([n, fields], idx) in activeGroup.entries()"
          :key="n + idx"
          ref="section"
          class="p-4"
          :class="idx !== 0 && activeGroup.size > 1 ? 'border-t border-outline-gray-1' : ''"
          :show-title="activeGroup.size > 1 && n !== t`Default`"
          :title="n"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @editrow="(doc: Doc) => showRowEditForm(doc)"
          @row-remove="onRowRemove"
          @value-change="onValueChange"
          @row-change="updateGroupedFields"
        />
      </div>

      <!-- Tab Bar -->
      <div
        v-if="groupedFields && groupedFields.size > 1"
        class="sticky bottom-0 mt-auto flex-shrink-0 border-t bg-surface-base p-4 border-outline-gray-1"
      >
        <FrappeTabButtons v-model="activeTab" :options="tabOptions" variant="underline" />
      </div>
    </template>
    <template #quickedit>
      <Transition name="quickedit">
        <LinkedEntries
          v-if="showLinks && canShowLinks"
          :key="`${doc.schemaName}.${doc.name}`"
          :doc="doc"
          @close="showLinks = false"
        />
      </Transition>
      <Transition name="quickedit">
        <RowEditForm
          v-if="row && !showLinks"
          :doc="doc"
          :fieldname="row.fieldname"
          :index="row.index"
          @previous="(i: number) => (row!.index = i)"
          @next="(i: number) => (row!.index = i)"
          @close="() => (row = null)"
        />
      </Transition>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { getMissingMandatoryFields } from 'fyo/model/helpers';
import { ValidationError } from 'fyo/utils/errors';
import { TabButtons as FrappeTabButtons, Button as FrappeButton } from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Barcode from 'src/components/Controls/Barcode.vue';
import ExchangeRate from 'src/components/Controls/ExchangeRate.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getSchema } from 'src/frappe/registry';
import { useBooksDoc } from 'src/frappe/useBooksDoc';
import { getErrorMessage } from 'src/utils';
import { loadDocPermissions } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup, UIGroupedFields } from 'src/utils/types';
import {
  commonDocSubmit,
  commonDocSync,
  getFieldsGroupedByTabAndSection,
  getFormRoute,
  getGroupedActionsForDoc,
  isPrintable,
  routeTo,
} from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, nextTick } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import LinkedEntries from './LinkedEntries.vue';
import MobileForm from './MobileForm.vue';
import RowEditForm from './RowEditForm.vue';

export default defineComponent({
  components: {
    FormContainer,
    FormHeader,
    CommonFormSection,
    FrappeButton,
    DropdownWithActions,
    Barcode,
    ExchangeRate,
    LinkedEntries,
    MobileForm,
    RowEditForm,
    StatusPill,
    FrappeTabButtons,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  props: {
    name: { type: String, default: '' },
    schemaName: { type: String, default: ModelNameEnum.SalesInvoice },
  },
  setup() {
    const shortcuts = inject(shortcutsKey);
    const { doc: docOrNull, load: loadDoc } = useBooksDoc();
    let context = 'CommonForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, docOrNull, 'CommonForm', true);
    }

    return {
      docOrNull,
      loadDoc,
      shortcuts,
      context,
      isMobile,
    };
  },
  data() {
    return {
      errors: {},
      missingFields: [],
      activeTab: this.t`Default`,
      groupedFields: null,
      isPrintable: false,
      showLinks: false,
      useFullWidth: false,
      row: null,
    } as {
      errors: Record<string, string>;
      missingFields: Field[];
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      isPrintable: boolean;
      showLinks: boolean;
      useFullWidth: boolean;
      row: null | { index: number; fieldname: string };
    };
  },
  computed: {
    canShowBarcode(): boolean {
      if (!this.fyo.singles.InventorySettings?.enableBarcodes) {
        return false;
      }

      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.isSubmitted || this.doc.isCancelled) {
        return false;
      }

      return typeof this.doc?.addItem === 'function';
    },
    canShowExchangeRate(): boolean {
      return this.hasDoc && !!this.doc.isMultiCurrency;
    },
    exchangeRate(): number {
      // 0 shows the rate as missing, to be entered by the user.
      if (!this.hasDoc || typeof this.doc.exchangeRate !== 'number') {
        return 0;
      }

      return this.doc.exchangeRate;
    },
    exchangeRateProps() {
      return {
        disabled: this.doc.isSubmitted || this.doc.isCancelled,
        fromCurrency: this.fromCurrency,
        toCurrency: this.toCurrency,
        exchangeRate: this.exchangeRate,
      };
    },
    fromCurrency(): string {
      const currency = this.doc?.currency;
      if (typeof currency !== 'string') {
        return this.toCurrency;
      }

      return currency;
    },
    toCurrency(): string {
      const currency = this.fyo.singles.SystemSettings?.currency;
      if (typeof currency !== 'string') {
        return DEFAULT_CURRENCY;
      }

      return currency;
    },
    canPrint(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      return (
        this.doc.can('print') &&
        !this.doc.isCancelled &&
        !this.doc.dirty &&
        this.isPrintable
      );
    },
    canShowLinks(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.schema.isSubmittable && !this.doc.isSubmitted) {
        return false;
      }

      return this.doc.inserted;
    },
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    doc(): Doc {
      const doc = this.docOrNull;
      if (!doc) {
        throw new ValidationError(this.t`Doc ${this.schema.label} ${this.name} not set`);
      }
      return doc;
    },
    title(): string {
      if (this.schema.isSubmittable && this.docOrNull?.notInserted) {
        return this.t`New Entry`;
      }

      return this.docOrNull?.name || this.t`New Entry`;
    },
    schema(): Schema {
      const schema = this.docOrNull?.schema ?? getSchema(this.schemaName);
      if (!schema) {
        throw new ValidationError(`no schema found with ${this.schemaName}`);
      }

      return schema;
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        const tab = [...this.groupedFields.keys()][0];
        return this.groupedFields.get(tab) ?? new Map<string, Field[]>();
      }

      return group;
    },
    tabOptions(): { value: string; label: string }[] {
      return [...(this.groupedFields?.keys() ?? [])].map((value) => ({
        value,
        label: value,
      }));
    },
    groupedActions(): ActionGroup[] {
      if (!this.hasDoc) {
        return [];
      }

      return getGroupedActionsForDoc(this.doc);
    },
  },
  watch: {
    'docOrNull.schema': 'updateGroupedFields',
  },
  beforeMount() {
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
  },
  async mounted() {
    await this.setDoc();
    this.replacePathAfterSync();
    this.updateGroupedFields();
    if (this.groupedFields) {
      this.activeTab = [...this.groupedFields.keys()][0];
    }
    this.isPrintable = await isPrintable(this.schemaName);
  },
  activated(): void {
    if (this.hasDoc) {
      void this.refreshDoc();
    }
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
    docsPathRef.value = docsPathMap[this.schemaName] ?? '';
    this.shortcuts?.pmod.set(this.context, ['KeyP'], () => {
      if (!this.canPrint) {
        return;
      }

      void this.openPrintView();
    });
    this.shortcuts?.pmod.set(this.context, ['KeyL'], () => {
      if (!this.canShowLinks && !this.showLinks) {
        return;
      }

      this.showLinks = !this.showLinks;
    });
  },
  deactivated(): void {
    docsPathRef.value = '';
    this.showLinks = false;
    this.row = null;
  },
  methods: {
    routeTo,
    async addItem(name: string, quantity?: number) {
      // @ts-expect-error only invoices and transfers have addItem
      await this.doc.addItem(name, quantity);
    },
    async setExchangeRate(exchangeRate: number) {
      await this.doc.set('exchangeRate', exchangeRate);
    },
    async openPrintView() {
      await routeTo(`/print/${this.doc.schemaName}/${this.doc.name}`);
    },
    async toggleWidth() {
      const value = !this.useFullWidth;
      if (this.fyo.can('Misc', 'write')) {
        await this.fyo.singles.Misc?.setAndSync('useFullWidth', value);
      }
      this.useFullWidth = value;
    },
    updateGroupedFields(): void {
      if (!this.hasDoc) {
        return;
      }

      this.groupedFields = getFieldsGroupedByTabAndSection(this.schema, this.doc);
      if (!this.groupedFields.has(this.activeTab)) {
        this.activeTab = [...this.groupedFields.keys()][0] ?? this.t`Default`;
      }
    },
    async sync(useDialog?: boolean) {
      if (this.isMobile && !this.checkRequiredFields()) {
        return;
      }

      if (await commonDocSync(this.doc, useDialog)) {
        this.updateGroupedFields();
      }
    },
    async submit() {
      if (this.isMobile && !this.checkRequiredFields()) {
        return;
      }

      if (await commonDocSubmit(this.doc)) {
        this.updateGroupedFields();
      }
    },
    /** Phones mark missing fields in place instead of in a dialog. */
    checkRequiredFields(): boolean {
      const shown = new Set(
        [...(this.groupedFields?.values() ?? [])].flatMap((tab) =>
          [...tab.values()].flat()
        )
      );
      this.missingFields = [...new Set(getMissingMandatoryFields(this.doc))].filter(
        (field) => shown.has(field)
      );
      for (const field of this.missingFields) {
        this.errors[field.fieldname] = this.t`${field.label} is required`;
      }

      return !this.missingFields.length;
    },
    async setDoc() {
      if (this.hasDoc) {
        return;
      }

      try {
        await this.loadDoc(this.schemaName, this.name, true);
      } catch (error) {
        await handleErrorWithDialog(error);
      }
    },
    async refreshDoc() {
      try {
        await Promise.all([this.doc.refresh(), loadDocPermissions(this.doc)]);
        this.updateGroupedFields();
      } catch (error) {
        await handleErrorWithDialog(error, this.doc, true);
      }
    },
    replacePathAfterSync() {
      if (!this.hasDoc || this.doc.inserted) {
        return;
      }

      this.doc.once('afterSync', async () => {
        const route = getFormRoute(this.schemaName, this.doc.name!);
        await this.$router.replace(route);
      });
    },
    async showRowEditForm(doc: Doc) {
      if (this.showLinks) {
        this.showLinks = false;
        await nextTick();
      }

      const index = doc.idx;
      const fieldname = doc.parentFieldname;

      if (typeof index === 'number' && typeof fieldname === 'string') {
        this.row = { index, fieldname };
      }
    },
    onRowRemove({ idx, parentFieldname }: Doc) {
      const row = this.row;
      if (!row || row.fieldname !== parentFieldname || typeof idx !== 'number') {
        return;
      }

      if (row.index === idx) {
        this.row = null;
      } else if (row.index > idx) {
        row.index -= 1;
      }
    },
    async onValueChange(field: Field, value: DocValue) {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc.set(fieldname, value);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc);
      }

      this.updateGroupedFields();
    },
  },
});
</script>
