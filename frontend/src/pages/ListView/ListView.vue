<template>
  <div class="flex flex-col" :class="isMobile ? 'min-h-full' : ''">
    <PageHeader :title="title">
      <template #mobile>
        <FrappeButton
          v-if="isSelectionMode"
          variant="ghost"
          size="md"
          :label="t`Cancel`"
          @click="toggleSelectionMode"
        />
        <template v-else>
          <FrappeButton
            v-if="schemaName === 'Item'"
            variant="ghost"
            size="md"
            icon="lucide-list-checks"
            :label="t`Select items`"
            @click="toggleSelectionMode"
          />
          <FrappeButton
            v-if="canCreate"
            variant="solid"
            size="md"
            icon-left="lucide-plus"
            :label="t`New`"
            @click="handleMakeNewDoc"
          />
        </template>
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
          <FrappeButton class="w-40">{{ t`Create` }}</FrappeButton>
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
        icon="lucide-plus"
        :label="t`Create new entry`"
        :tooltip="t`Create new entry`"
        @click="handleMakeNewDoc"
      />
    </PageHeader>
    <MobileListToolbar
      v-if="isMobile"
      ref="mobileToolbar"
      :schema-name="schemaName"
      :search-fields="searchFields"
      @change="applyFilter"
    />
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
    <div
      v-if="isMobile && isSelectionMode"
      class="sticky bottom-0 mt-auto flex items-center gap-3 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
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
    </div>
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
import { getFrappeDoc, newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap, getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { getFormRoute, openNewDoc, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { QueryFilter } from 'utils/db/types';
import { defineComponent, inject, ref } from 'vue';
import List from './List.vue';
import { getListColumns } from './listColumns';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import MobileListToolbar from './MobileListToolbar.vue';
import { getMobileRowLayout } from './mobileRowLayout';
import { Money } from 'pesa';
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
    MobileListToolbar,
    MobileOptionsSheet,
  },
  props: {
    schemaName: { type: String, required: true },
    filters: { type: Object, default: undefined },
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
      listFilters: {},
      isSelectionMode: false,
      selectedItems: [] as string[],
      isCreateSheetOpen: false,
    } as {
      listConfig: undefined | ReturnType<typeof getListConfig>;
      openExportModal: boolean;
      listFilters: QueryFilter;
      isSelectionMode: boolean;
      selectedItems: string[];
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
      ];
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
    updatedData(listFilters: QueryFilter) {
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

      const filters = getCreateFiltersFromListViewFilters(this.filters ?? {});
      await openNewDoc(this.schemaName, filters);
    },
    async handleMakeNewDoc() {
      await this.makeNewDoc();
    },
    applyFilter(filters: QueryFilter, orFilters?: QueryFilter) {
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
        const doc = newFrappeDoc(value);

        for (const itemName of this.selectedItems) {
          const itemDoc = await getFrappeDoc(ModelNameEnum.Item, itemName);

          // Invoices are Frappe-backed, so their rows use Frappe fieldnames.
          const itemRow = {
            item: itemName,
            rate: (itemDoc.rate as Money) || fyo.pesa(0),
            quantity: 1,
            transfer_quantity: 1,
          };

          await doc.append('items', itemRow);
        }

        const route = getFormRoute(value, doc.name!);
        await routeTo(route);
        this.selectedItems = [];
        this.isSelectionMode = false;
      }
    },

    updateSelectedItems(selected: string[]) {
      this.selectedItems = selected;
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
