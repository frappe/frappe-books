<template>
  <div class="flex flex-col" :class="isMobile ? 'min-h-full' : ''">
    <PageHeader :title="title">
      <template #mobile>
        <FrappeButton
          v-if="canCreate && !isSelectionMode"
          variant="solid"
          size="md"
          icon-left="lucide-plus"
          :label="t`New`"
          @click="handleMakeNewDoc"
        />
      </template>
      <FrappeButton
        v-if="
          schemaName === 'Item' &&
          (!isSelectionMode || (isSelectionMode && selectedItems.length === 0))
        "
        @click="toggleSelectionMode"
      >
        {{ t`Select` }}
      </FrappeButton>
      <FrappeDropdown
        v-if="isSelectionMode && schemaName === 'Item' && selectedItems.length > 0"
        :options="actionOptions"
        align="end"
      >
        <template #trigger>
          <FrappeButton>{{ t`Create` }}</FrappeButton>
        </template>
      </FrappeDropdown>
      <FrappeButton
        v-if="canExport"
        ref="exportButton"
        @click="openExportModal = true"
      >
        {{ t`Export` }}
      </FrappeButton>
      <FilterDropdown ref="filterDropdown" :schema-name="schemaName" @change="applyFilter" />
      <FrappeButton
        v-if="canCreate"
        variant="solid"
        icon-left="lucide-plus"
        :label="t`New`"
        @click="handleMakeNewDoc"
      />
    </PageHeader>
    <MobileListToolbar
      v-if="isMobile"
      ref="mobileToolbar"
      :schema-name="schemaName"
      :search-fields="searchFields"
      @change="applyFilter"
    >
      <FrappeButton
        v-if="schemaName === 'Item'"
        size="lg"
        :label="isSelectionMode ? t`Cancel` : t`Select`"
        @click="toggleSelectionMode"
      />
    </MobileListToolbar>
    <List
      ref="list"
      :schema-name="schemaName"
      :list-config="listConfig"
      :filters="filters"
      :can-create="canCreate"
      :is-selection-mode="isSelectionMode"
      class="flex-1 flex h-full"
      @open-doc="openDoc"
      @updated-data="updatedData"
      @make-new-doc="makeNewDoc"
      @clear-filters="mobileToolbar?.clear()"
      @selected-items-changed="updateSelectedItems"
    />
    <MobileFooter v-if="isMobile && isSelectionMode" class="items-center">
      <span class="min-w-0 flex-1 text-base text-ink-gray-7">
        {{ t`${selectedItems.length} selected` }}
      </span>
      <FrappeButton
        size="lg"
        variant="solid"
        :label="t`Create`"
        :disabled="!selectedItems.length"
        @click="isCreateSheetOpen = true"
      />
    </MobileFooter>
    <MobileOptionsSheet
      v-if="isMobile"
      v-model:open="isCreateSheetOpen"
      actions
      :title="t`Create`"
      :options="createOptions"
      @select="(value) => createInvoice(String(value))"
    />
    <ExportWizard
      v-model:open="openExportModal"
      :schema-name="schemaName"
      :page-title="pageTitle"
      :list-filters="listFilters"
    />
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  Dropdown as FrappeDropdown,
  type DropdownOptions,
} from 'frappe-ui';
import ExportWizard from 'src/components/ExportWizard.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import PageHeader from 'src/components/PageHeader.vue';

import { getField, getModel, getSchema, getSearchFields } from 'src/frappe/registry';
import { newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap, getNewDocValues } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { getFormRoute, openNewDoc, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import type { Filter } from 'src/frappe/api';
import { defineComponent, inject, ref, type PropType } from 'vue';
import List from './List.vue';
import { getListColumns } from './listColumns';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import MobileListToolbar from './MobileListToolbar.vue';
import { getMobileRowLayout } from './mobileRowLayout';
import type { Invoice } from 'models/invoices/Invoice';
import { Item } from 'models/baseModels/Item/Item';
import { ModelNameEnum } from 'models/types';

export default defineComponent({
  name: 'ListView',
  components: {
    PageHeader,
    List,
    FilterDropdown,
    FrappeButton,
    ExportWizard,
    FrappeDropdown,
    MobileFooter,
    MobileListToolbar,
    MobileOptionsSheet,
  },
  props: {
    schemaName: { type: String, required: true },
    filters: { type: Array as PropType<Filter[]>, default: () => [] },
    pageTitle: { type: String, default: '' },
  },
  setup() {
    return {
      isMobile,
      shortcuts: inject(shortcutsKey),
      list: ref<InstanceType<typeof List> | null>(null),
      exportButton: ref<InstanceType<typeof FrappeButton> | null>(null),
      filterDropdown: ref<InstanceType<typeof FilterDropdown> | null>(null),
      mobileToolbar: ref<InstanceType<typeof MobileListToolbar> | null>(null),
    };
  },
  data() {
    return {
      listConfig: undefined,
      openExportModal: false,
      listFilters: [],
      isSelectionMode: false,
      selectedItems: [] as string[],
      invoiceSchemaNames: [] as string[],
      isCreateSheetOpen: false,
    } as {
      listConfig: undefined | ReturnType<typeof getListConfig>;
      openExportModal: boolean;
      listFilters: Filter[];
      isSelectionMode: boolean;
      selectedItems: string[];
      invoiceSchemaNames: string[];
      isCreateSheetOpen: boolean;
    };
  },
  computed: {
    context(): string {
      return 'ListView-' + this.schemaName;
    },
    title(): string {
      if (this.pageTitle) {
        return this.pageTitle;
      }

      return getSchema(this.schemaName)?.label ?? this.schemaName;
    },
    /** The row title and the schema's search fields, as stored columns. */
    searchFields(): string[] {
      const columns = getListColumns(this.schemaName, this.listConfig);
      const title = getMobileRowLayout(this.schemaName, columns).title.fieldname;
      const keywords = getSearchFields(this.schemaName);
      return [...new Set(['name', title, ...keywords])].filter((fieldname) => {
        const field = getField(this.schemaName, fieldname);
        return field && !field.computed;
      });
    },
    canExport(): boolean {
      return fyo.can(this.schemaName, 'export');
    },
    canCreate(): boolean {
      return (
        getSchema(this.schemaName)?.create !== false &&
        fyo.can(this.schemaName, 'create')
      );
    },
    /** Documents that can be made from the selected items. */
    createOptions(): { value: string; label: string }[] {
      return [
        { value: ModelNameEnum.SalesQuote, label: this.t`Sales Quote` },
        { value: ModelNameEnum.SalesInvoice, label: this.t`Sales Invoice` },
        { value: ModelNameEnum.PurchaseInvoice, label: this.t`Purchase Invoice` },
      ].filter(
        (option) =>
          this.invoiceSchemaNames.includes(option.value) &&
          fyo.can(option.value, 'create')
      );
    },
    actionOptions(): DropdownOptions {
      return this.createOptions.map((option) => ({
        ...option,
        onClick: () => this.createInvoice(option.value),
      }));
    },
  },
  activated() {
    this.listConfig = getListConfig(this.schemaName);
    docsPathRef.value = docsPathMap[this.schemaName] ?? docsPathMap.Entries ?? '';

    this.setShortcuts();
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.context);
  },
  methods: {
    setShortcuts() {
      if (!this.shortcuts) {
        return;
      }

      this.shortcuts.pmod.set(this.context, ['KeyN'], () => this.makeNewDoc());
      this.shortcuts.pmod.set(this.context, ['KeyE'], () => this.exportButton?.$el.click());
    },
    updatedData(listFilters: Filter[]) {
      this.listFilters = listFilters;
    },
    async openDoc(name: string) {
      const route = getFormRoute(this.schemaName, name);
      await routeTo(route);
    },
    async makeNewDoc() {
      if (!this.canCreate) {
        return;
      }

      const values = getNewDocValues(this.schemaName, this.filters);
      await openNewDoc(this.schemaName, values);
    },
    async handleMakeNewDoc() {
      await this.makeNewDoc();
    },
    applyFilter(filters: Filter[], orFilters?: Filter[]) {
      this.list?.updateData(filters, orFilters);
    },
    toggleSelectionMode() {
      this.isSelectionMode = !this.isSelectionMode;
      if (!this.isSelectionMode) {
        this.selectedItems = [];
      }
    },
    async createInvoice(value: string) {
      if (
        value === ModelNameEnum.SalesQuote ||
        value === ModelNameEnum.SalesInvoice ||
        value === ModelNameEnum.PurchaseInvoice
      ) {
        // The server prices the rows, as when the items are added in the form.
        const doc = newFrappeDoc(value) as Invoice;
        for (const itemName of this.selectedItems) {
          await doc.addItem(itemName);
        }

        const route = getFormRoute(value, doc.name!);
        await routeTo(route);
        this.selectedItems = [];
        this.isSelectionMode = false;
      }
    },

    async updateSelectedItems(selected: string[]) {
      this.selectedItems = selected;
      this.invoiceSchemaNames = [];
      if (this.schemaName !== ModelNameEnum.Item || !selected.length) {
        return;
      }

      const schemaNames = await Item.getInvoiceSchemaNames(fyo, selected);
      // A later selection may have been answered first.
      if (this.selectedItems === selected) {
        this.invoiceSchemaNames = schemaNames;
      }
    },
  },
});

function getListConfig(schemaName: string) {
  const listConfig = getModel(schemaName)?.getListViewSettings?.(fyo);
  if (listConfig?.columns === undefined) {
    return {
      columns: ['name'],
    };
  }
  return listConfig;
}
</script>
