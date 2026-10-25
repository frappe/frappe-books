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
      :error-panel="errorPanel"
      @dismiss-error="dismissError"
      @value-change="onValueChange"
      @row-change="updateGroupedFields"
      @editrow="(doc: FrappeDoc) => showRowEditForm(doc)"
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
    <template v-else>
      <PageHeader :title="title" />
      <FormSkeleton class="p-4" />
    </template>
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
      :errors="rowErrors"
      @close="closeRow"
    />
  </div>
  <FormContainer v-else :use-full-width="useFullWidth">
    <template #header>
      <PageHeader>
        <template #left>
          <nav :aria-label="t`Breadcrumb`" class="flex min-w-0">
            <FrappeBreadcrumbs :items="breadcrumbs" />
          </nav>
          <StatusPill v-if="hasDoc" :doc="doc" />
          <ExchangeRate
            v-if="canShowExchangeRate"
            v-bind="exchangeRateProps"
            @change="setExchangeRate"
          />
        </template>
        <template v-if="hasDoc">
          <FrappeButton
            v-if="canPrint"
            icon="lucide-printer"
            :label="t`Open print view`"
            :tooltip="t`Open print view`"
            @click="openPrintView"
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
            v-if="doc.canSave || doc.showsDisabledSave"
            variant="solid"
            :disabled="doc.isSyncing || !doc.canSave"
            @click="sync"
          >
            {{ t`Save` }}
          </FrappeButton>
          <FrappeButton
            v-else-if="doc.canSubmit"
            variant="solid"
            @click="submit"
            >{{ t`Submit` }}</FrappeButton
          >
        </template>
      </PageHeader>
    </template>
    <template #body>
      <FormSkeleton v-if="!hasDoc" class="py-5 md:grid-cols-2 md:gap-x-8" />
      <template v-else>
        <div
          v-if="tabOptions.length > 1"
          class="sticky top-0 z-10 flex border-b border-outline-gray-1 bg-surface-base pt-2"
        >
          <FrappeTabButtons
            v-model="activeTab"
            class="-mb-px flex"
            :options="tabOptions"
            variant="underline"
          />
        </div>
        <FormErrorPanel
          v-if="errorPanel"
          class="mt-4"
          :action="errorPanel.action"
          :messages="errorPanel.messages"
          @dismiss="dismissError"
        />
        <FrappeAlert
          v-else-if="doc.previewError && !isAccessory"
          class="mt-4"
          theme="red"
          :title="t`Not saved`"
          :description="doc.previewError"
        />
        <div class="divide-y divide-outline-gray-1">
          <CommonFormSection
            v-for="([n, fields], idx) in activeGroup.entries()"
            :key="n + idx"
            class="py-5"
            :show-title="activeGroup.size > 1 && n !== t`Default`"
            :title="n"
            :description="doc.getSectionDescription(n)"
            :fields="fields"
            :doc="doc"
            :errors="errors"
            @editrow="(doc: FrappeDoc) => showRowEditForm(doc)"
            @row-remove="onRowRemove"
            @value-change="onValueChange"
            @row-change="updateGroupedFields"
          >
            <template v-if="canShowBarcode" #table>
              <Barcode @item-selected="addItem" />
            </template>
          </CommonFormSection>
          <ExtraFields
            v-if="isAccessory && isFirstTab"
            v-model:active-tab="endTab"
            :doc="doc"
            :errors="errors"
            @editrow="(doc: FrappeDoc) => showRowEditForm(doc)"
            @value-change="onValueChange"
            @row-change="updateGroupedFields"
          />
          <LinkedRecordsSection
            v-if="linkedRecords && activeTab === tabOptions[0]?.value"
            :doc="doc"
            :config="linkedRecords"
          />
        </div>
      </template>
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
          :errors="rowErrors"
          @previous="showRowAt"
          @next="showRowAt"
          @close="closeRow"
        />
      </Transition>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Action, LinkedRecords } from 'fyo/model/types';
import { FrappeDoc, setFormShowsPreviewErrors } from 'src/frappe/document';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { ValidationError } from 'fyo/utils/errors';
import {
  Alert as FrappeAlert,
  Breadcrumbs as FrappeBreadcrumbs,
  Button as FrappeButton,
  TabButtons as FrappeTabButtons,
  type BreadcrumbsProps,
} from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Barcode from 'src/components/Controls/Barcode.vue';
import ExchangeRate from 'src/components/Controls/ExchangeRate.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FormContainer from 'src/components/FormContainer.vue';
import PageHeader from 'src/components/PageHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import type { EvalDoc } from 'src/frappe/dependsOn';
import { getEvalDoc } from 'src/frappe/fieldState';
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
import { isAccessoryMode } from 'src/frappe/mode';
import { noteMissingExtras, showMissingExtras } from 'src/frappe/extraFields';
import { getMissingFieldsOf } from 'src/frappe/missingMessages';
import { getServerMessages, type ServerMessage } from 'src/web/api';
import { syncOrSubmitDoc } from 'src/utils/vueUtils';
import CommonFormSection from './CommonFormSection.vue';
import ExtraFields from './ExtraFields.vue';
import { getExtraPlace, getRowBooksFields } from './extraFieldsView';
import FormErrorPanel from './FormErrorPanel.vue';
import FormSkeleton from './FormSkeleton.vue';
import LinkedEntries from './LinkedEntries.vue';
import LinkedRecordsSection from './LinkedRecordsSection.vue';
import MobileForm from './MobileForm.vue';
import RowEditForm from './RowEditForm.vue';

/** A failed save or submit, as the server said it. */
interface FormError {
  action: 'save' | 'submit';
  messages: ServerMessage[];
}

export default defineComponent({
  components: {
    ExtraFields,
    FormErrorPanel,
    FrappeAlert,
    FormContainer,
    CommonFormSection,
    FormSkeleton,
    FrappeBreadcrumbs,
    FrappeButton,
    PageHeader,
    DropdownWithActions,
    Barcode,
    ExchangeRate,
    LinkedEntries,
    LinkedRecordsSection,
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
    // Accessory forms save through their own checks and error panel.
    const formActions: { syncOrSubmit?: () => Promise<unknown> } = {};
    let context = 'CommonForm';
    if (shortcuts) {
      context = useDocShortcuts(
        shortcuts,
        docOrNull,
        'CommonForm',
        true,
        (doc) => formActions.syncOrSubmit?.() ?? syncOrSubmitDoc(doc)
      );
    }

    return {
      docOrNull,
      loadDoc,
      shortcuts,
      context,
      isMobile,
      formActions,
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
      rowErrors: {},
      endTab: '',
      formError: null,
      dismissedPreviewError: '',
    } as {
      errors: Record<string, string>;
      missingFields: Field[];
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      isPrintable: boolean;
      showLinks: boolean;
      useFullWidth: boolean;
      row: null | { index: number; fieldname: string };
      rowErrors: Record<string, string>;
      endTab: string;
      formError: FormError | null;
      dismissedPreviewError: string;
    };
  },
  computed: {
    isAccessory(): boolean {
      return isAccessoryMode();
    },
    /** The values the fields' conditions read; a preview's fills change them after an edit, or with none. */
    conditionValues(): EvalDoc | null {
      return this.hasDoc ? getEvalDoc(this.doc) : null;
    },
    isFirstTab(): boolean {
      const [first] = this.tabOptions;
      return (
        !first || this.activeGroup === this.groupedFields?.get(first.value)
      );
    },
    /** Accessory mode: why the last save, submit or preview failed, until dismissed. */
    errorPanel(): FormError | null {
      if (!this.isAccessory || !this.hasDoc) {
        return null;
      }

      if (this.formError) {
        return this.formError;
      }

      const { previewError, previewErrorMessages } = this.doc;
      if (!previewError || previewError === this.dismissedPreviewError) {
        return null;
      }

      const messages = previewErrorMessages ?? [{ message: previewError }];
      return { action: 'save', messages };
    },
    canShowBarcode(): boolean {
      if (!this.fyo.isFeatureOn('show_barcode_field')) {
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
      if (!this.hasDoc || typeof this.doc.conversion_rate !== 'number') {
        return 0;
      }

      return this.doc.conversion_rate;
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
      return this.docOrNull instanceof FrappeDoc;
    },
    doc(): FrappeDoc {
      const doc = this.docOrNull;
      if (!doc) {
        throw new ValidationError(
          this.t`Doc ${this.schema.label} ${this.name} not set`
        );
      }
      return doc;
    },
    /** Empty while the document loads. */
    title(): string {
      if (!this.docOrNull) {
        return '';
      }

      // A random temporary name means nothing to the user.
      const { isSubmittable, naming } = this.schema;
      if (this.docOrNull.notInserted && (isSubmittable || naming === 'random')) {
        return this.t`New entry`;
      }

      return this.docOrNull.formTitle || this.t`New entry`;
    },
    breadcrumbs(): BreadcrumbsProps['items'] {
      const list = {
        label: this.schema.label,
        route: `/list/${this.schemaName}`,
      };
      return this.title ? [list, { label: this.title }] : [list];
    },
    schema(): Schema {
      const schema = this.docOrNull?.schema ?? getSchema(this.schemaName);
      if (!schema) {
        throw new ValidationError(`no schema found with ${this.schemaName}`);
      }

      return schema;
    },
    /** Records the model lists on its saved documents, e.g. an item's prices. */
    linkedRecords(): LinkedRecords | undefined {
      const Model = this.docOrNull?.constructor as typeof FrappeDoc | undefined;
      return Model?.getLinkedRecords(this.fyo);
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

      const groups = getGroupedActionsForDoc(this.doc);
      const more = groups.find(({ group }) => !group)?.actions ?? [];
      return [
        ...groups.filter(({ group }) => group),
        {
          group: '',
          label: '',
          type: 'secondary',
          actions: [...this.viewActions, ...more],
        },
      ];
    },
    /** Linked entries and the width toggle lead the … menu, as on phones. */
    viewActions(): Action[] {
      const width: Action = {
        label: this.useFullWidth ? this.t`Form width` : this.t`Full width`,
        action: () => this.toggleWidth(),
      };
      if (!this.canShowLinks) {
        return [width];
      }

      const links: Action = {
        label: this.t`Linked entries`,
        action: () => (this.showLinks = true),
      };
      return [links, width];
    },
  },
  watch: {
    'docOrNull.schema': 'updateGroupedFields',
    conditionValues: 'updateGroupedFields',
    // The form shows a failed preview as an Alert, so the document need not toast it.
    docOrNull(doc: FrappeDoc | null, previous: FrappeDoc | null) {
      if (previous) {
        setFormShowsPreviewErrors(previous, false);
      }
      if (doc) {
        setFormShowsPreviewErrors(doc, true);
      }
      if (doc && this.isAccessory) {
        noteMissingExtras(doc);
      }
    },
  },
  created() {
    if (this.isAccessory) {
      this.formActions.syncOrSubmit = () =>
        this.doc.canSave
          ? this.sync(true)
          : this.doc.canSubmit
            ? this.submit()
            : syncOrSubmitDoc(this.doc);
    }
  },
  beforeMount() {
    this.useFullWidth = !!this.fyo.singles.Misc?.use_full_width;
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
    this.useFullWidth = !!this.fyo.singles.Misc?.use_full_width;
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
      await this.doc.set('conversion_rate', exchangeRate);
    },
    async openPrintView() {
      await routeTo(`/print/${this.doc.schemaName}/${this.doc.name}`);
    },
    async toggleWidth() {
      const value = !this.useFullWidth;
      if (this.fyo.can('Misc', 'write')) {
        await this.fyo.singles.Misc?.setAndSync('use_full_width', value);
      }
      this.useFullWidth = value;
    },
    updateGroupedFields(): void {
      if (!this.hasDoc) {
        return;
      }

      this.groupedFields = getFieldsGroupedByTabAndSection(
        this.schema,
        this.doc
      );
      if (!this.groupedFields.has(this.activeTab)) {
        this.activeTab = [...this.groupedFields.keys()][0] ?? this.t`Default`;
      }
    },
    async sync(useDialog?: boolean) {
      if (this.isAccessory) {
        await this.runAccessoryAction('save', useDialog);
        return;
      }

      if (this.isMobile && !this.checkRequiredFields()) {
        return;
      }

      if (await commonDocSync(this.doc, useDialog)) {
        this.updateGroupedFields();
      }
    },
    async submit() {
      if (this.isAccessory) {
        await this.runAccessoryAction('submit');
        return;
      }

      if (this.isMobile && !this.checkRequiredFields()) {
        return;
      }

      if (await commonDocSubmit(this.doc)) {
        this.updateGroupedFields();
      }
    },
    /** Accessory mode: saves or submits after its mandatory check; ERPNext's refusal shows in the error panel. */
    async runAccessoryAction(action: FormError['action'], useDialog?: boolean) {
      this.formError = null;
      this.dismissedPreviewError = '';
      if (!(await this.checkMandatory())) {
        return;
      }

      const onError = (error: unknown) => this.showActionError(action, error);
      const done =
        action === 'submit'
          ? await commonDocSubmit(this.doc, onError)
          : await commonDocSync(this.doc, useDialog, onError);
      if (done) {
        this.updateGroupedFields();
      }
    },
    /**
     * Shows the first empty mandatory field the form or a row editor shows,
     * with no server call: its tab or section opens and it says it is required.
     */
    async checkMandatory(): Promise<boolean> {
      await this.doc.whenFilled().catch(() => undefined);
      const [missing] = this.getShownMissing(this.doc);
      if (missing) {
        this.errors[missing.fieldname] = this.t`${missing.label} is required`;
        await this.revealField(missing.fieldname);
        return false;
      }

      for (const { fieldname } of this.doc.tableFields) {
        for (const row of (this.doc.get(fieldname) ?? []) as FrappeDoc[]) {
          const fields = this.getShownMissing(row);
          if (fields.length) {
            this.openRowWithErrors(row, fields);
            return false;
          }
        }
      }

      return true;
    },
    /** A document's or row's empty mandatory fields its form shows, More details taking back those that had left. */
    getShownMissing(doc: FrappeDoc): Field[] {
      const missing = doc.missingFields;
      showMissingExtras(
        doc,
        missing.map(({ fieldname }) => fieldname)
      );
      const shown = doc.parentdoc
        ? getRowBooksFields(doc)
        : [...(this.groupedFields?.values() ?? [])].flatMap((tab) =>
            [...tab.values()].flat()
          );
      return missing.filter(
        ({ fieldname }) =>
          shown.some((field) => field.fieldname === fieldname) ||
          !!getExtraPlace(doc, fieldname)
      );
    },
    openRowWithErrors(row: FrappeDoc, fields: Field[]) {
      this.rowErrors = Object.fromEntries(
        fields.map((field) => [
          field.fieldname,
          this.t`${field.label} is required`,
        ])
      );
      this.row = { index: row.idx!, fieldname: row.parentFieldname! };
    },
    closeRow() {
      this.row = null;
      this.rowErrors = {};
    },
    showRowAt(index: number) {
      this.row!.index = index;
      this.rowErrors = {};
    },
    /** Selects the tab holding a field, then scrolls to it. */
    async revealField(fieldname: string) {
      const tab = [...(this.groupedFields ?? [])].find(([, sections]) =>
        [...sections.values()].flat().some((f) => f.fieldname === fieldname)
      )?.[0];
      const place = tab ? undefined : getExtraPlace(this.doc, fieldname);
      this.activeTab = tab ?? this.tabOptions[0]?.value ?? this.activeTab;
      if (place?.tab) {
        this.endTab = place.tab;
      }

      await nextTick();
      document
        .querySelector(`[data-fieldname="${fieldname}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    /** Shows ERPNext's refusal; a mandatory field it names says so too. */
    showActionError(action: FormError['action'], error: unknown) {
      const messages = getServerMessages(error);
      this.formError = { action, messages };
      for (const { doc, fieldname } of getMissingFieldsOf(this.doc, messages)) {
        if (doc === this.doc) {
          showMissingExtras(doc, [fieldname]);
          const label = doc.fieldMap[fieldname]?.label ?? fieldname;
          this.errors[fieldname] = this.t`${label} is required`;
        }
      }
    },
    dismissError() {
      this.formError = null;
      this.dismissedPreviewError = this.doc.previewError ?? '';
    },
    /** Phones mark missing fields in place instead of in a dialog. */
    checkRequiredFields(): boolean {
      const missing = new Set(
        this.doc.missingFields.map(({ fieldname }) => fieldname)
      );
      this.missingFields = [...(this.groupedFields?.values() ?? [])]
        .flatMap((tab) => [...tab.values()].flat())
        .filter((field) => missing.has(field.fieldname));
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
    async showRowEditForm(doc: FrappeDoc) {
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
    onRowRemove({ idx, parentFieldname }: FrappeDoc) {
      const row = this.row;
      if (
        !row ||
        row.fieldname !== parentFieldname ||
        typeof idx !== 'number'
      ) {
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
