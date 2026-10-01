<template>
  <component :is="DefineEntries">
    <FrappeLoadingText
      v-if="loading"
      class="p-4"
      :text="t`Loading linked entries...`"
    />
    <FrappeAlert
      v-else-if="loadFailed"
      class="m-4"
      theme="red"
      :title="t`Could not load linked entries. Please try again.`"
      :primary-action="{ label: t`Try again`, onClick: () => setLinkedEntries() }"
    />

    <!-- Linked Entry List -->
    <FrappeAccordion
      v-else-if="sequence.length"
      v-model="openGroups"
      type="multiple"
      class="w-full border-t border-outline-gray-1 px-2"
      :items="groupItems"
    >
      <template #item-suffix="{ item }">
        <span class="text-sm font-normal text-ink-gray-5">
          {{ entries[item.value].details.length }}
        </span>
      </template>
      <template #item-content="{ item }">
        <!-- Entry list -->
        <div
          class="entry-container rounded-4 border border-outline-gray-1 overflow-hidden"
        >
          <!-- Entry -->
          <FrappeItemListRow
            v-for="e of entries[item.value].details"
            :key="String(e.name) + item.value"
            as="button"
            type="button"
            size="md"
            class="!rounded-none text-start border-b last:border-0 border-outline-gray-1 hover:bg-surface-gray-2"
            @click="routeTo(item.value, String(e.name))"
          >
            <div class="flex justify-between">
              <!-- Name -->
              <p class="font-semibold text-ink-gray-8">
                {{ e.name }}
              </p>

              <!-- Date -->
              <p v-if="getDate(e)" class="text-xs text-ink-gray-6">
                {{ fyo.format(getDate(e), 'Date') }}
              </p>
            </div>
            <div class="flex gap-2 mt-1 pill-container flex-wrap">
              <!-- Credit or Debit (GLE) -->
              <FrappeBadge
                v-if="isPesa(e.credit) && e.credit.isPositive()"
                theme="gray"
                variant="subtle"
              >
                {{ t`Cr. ${fyo.format(e.credit, 'Currency')}` }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="isPesa(e.debit) && e.debit.isPositive()"
                theme="gray"
                variant="subtle"
              >
                {{ t`Dr. ${fyo.format(e.debit, 'Currency')}` }}
              </FrappeBadge>

              <!-- Party or EntryType or Account -->
              <FrappeBadge
                v-if="e.party || e.entry_type || e.account"
                theme="gray"
                variant="subtle"
              >
                {{ e.party || e.entry_type || e.account }}
              </FrappeBadge>

              <FrappeBadge v-if="e.item" theme="gray" variant="subtle">
                {{ e.item }}
              </FrappeBadge>
              <FrappeBadge v-if="e.location" theme="gray" variant="subtle">
                {{ e.location }}
              </FrappeBadge>

              <!-- Amounts -->
              <FrappeBadge
                v-if="
                  isPesa(e.outstanding_amount) && !e.outstanding_amount.isZero()
                "
                theme="amber"
                variant="subtle"
              >
                {{
                  t`Unpaid ${fyo.format(e.outstanding_amount.abs(), 'Currency')}`
                }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="isPesa(e.grand_total) && e.grand_total.isPositive()"
                theme="green"
                variant="subtle"
              >
                {{ fyo.format(e.grand_total, 'Currency') }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="isPesa(e.amount) && e.amount.isPositive()"
                theme="green"
                variant="subtle"
              >
                {{ fyo.format(e.amount, 'Currency') }}
              </FrappeBadge>

              <!-- Quantities -->
              <FrappeBadge
                v-if="e.stock_not_transferred"
                theme="amber"
                variant="subtle"
              >
                {{
                  t`Pending qty. ${fyo.format(e.stock_not_transferred, 'Float')}`
                }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="typeof e.quantity === 'number' && e.quantity"
                theme="gray"
                variant="subtle"
              >
                {{ t`Qty. ${fyo.format(e.quantity, 'Float')}` }}
              </FrappeBadge>
            </div>
          </FrappeItemListRow>
        </div>
      </template>
    </FrappeAccordion>
    <p v-else class="p-4 text-sm text-ink-gray-6">
      {{ t`No linked entries found` }}
    </p>
  </component>
  <FrappeBottomSheet
    v-if="isMobile"
    :open="true"
    :title="t`Linked Entries`"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <div class="pb-[max(env(safe-area-inset-bottom),1rem)]">
      <component :is="ReuseEntries" />
    </div>
  </FrappeBottomSheet>
  <div
    v-else
    class="flex h-full w-quick-edit flex-col border-l border-outline-gray-1 bg-surface-base"
  >
    <!-- Page Header -->
    <div class="flex h-row-largest shrink-0 items-center justify-between px-4">
      <div class="flex items-center justify-between w-full">
        <FrappeButton
          icon="lucide-x"
          :label="t`Close`"
          @click="$emit('close')"
        />
        <p class="text-xl font-semibold text-ink-gray-6">
          {{ t`Linked Entries` }}
        </p>
      </div>
    </div>

    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
      <component :is="ReuseEntries" />
    </FrappeScrollArea>
  </div>
</template>
<script lang="ts">
import { createReusableTemplate } from '@vueuse/core';
import { Doc } from 'fyo/model/doc';
import { isPesa } from 'fyo/utils';
import {
  Alert as FrappeAlert,
  Badge as FrappeBadge,
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  ItemListRow as FrappeItemListRow,
  LoadingText as FrappeLoadingText,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { Accordion as FrappeAccordion, type AccordionItem } from 'frappe-ui-accordion';
import { ModelNameEnum } from 'models/types';
import { getFrappeRows } from 'src/frappe/list';
import { getSchema } from 'src/frappe/registry';
import { getLinkedEntries } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { PropType, defineComponent, inject } from 'vue';

const COMPONENT_NAME = 'LinkedEntries';

export default defineComponent({
  components: {
    FrappeAccordion,
    FrappeAlert,
    FrappeBadge,
    FrappeBottomSheet,
    FrappeButton,
    FrappeItemListRow,
    FrappeLoadingText,
    FrappeScrollArea,
  },
  props: { doc: { type: Object as PropType<Doc>, required: true } },
  emits: ['close'],
  setup() {
    // Phones show the entries in a sheet, desktop in a side panel.
    const [DefineEntries, ReuseEntries] = createReusableTemplate();
    return {
      shortcuts: inject(shortcutsKey),
      isMobile,
      DefineEntries,
      ReuseEntries,
    };
  },
  data() {
    return { entries: {}, openGroups: [], loading: true, loadFailed: false } as {
      entries: Record<string, { details: Record<string, unknown>[] }>;
      openGroups: string[];
      loading: boolean;
      loadFailed: boolean;
    };
  },
  computed: {
    sequence(): string[] {
      const seq: string[] = linkSequence.filter((s) => !!this.entries[s]?.details?.length);

      for (const s in this.entries) {
        if (seq.includes(s) || !this.entries[s].details.length) {
          continue;
        }
        seq.push(s);
      }

      return seq;
    },
    groupItems(): AccordionItem[] {
      return this.sequence.map((schemaName) => ({
        value: schemaName,
        title: getSchema(schemaName)?.label ?? schemaName,
      }));
    },
  },
  async mounted() {
    this.shortcuts?.set(COMPONENT_NAME, ['Escape'], () => this.$emit('close'));
    await this.setLinkedEntries();
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    isPesa,
    /** Ledger entries are dated by their posting date. */
    getDate(entry: Record<string, unknown>) {
      return entry.date ?? entry.posting_date;
    },
    async routeTo(schemaName: string, name: string) {
      const route = getFormRoute(schemaName, name);
      await routeTo(route);
    },
    async setLinkedEntries() {
      this.loading = true;
      this.loadFailed = false;
      this.entries = {};
      try {
        const linkedEntries = await getLinkedEntries(this.doc);
        const entries: typeof this.entries = {};
        for (const key in linkedEntries) {
          const entryNames = linkedEntries[key];
          if (!entryNames.length) {
            continue;
          }

          const fields = linkEntryDisplayFields[key] ?? ['name'];
          const details = await getFrappeRows(
            this.fyo,
            key,
            entryNames,
            fields
          );
          entries[key] = { details };
        }
        this.entries = entries;
        this.openGroups = this.sequence;
      } catch (error) {
        console.error('Could not load linked entries', error);
        this.loadFailed = true;
      } finally {
        this.loading = false;
      }
    },
  },
});

const linkSequence = [
  // Invoices
  ModelNameEnum.SalesInvoice,
  ModelNameEnum.PurchaseInvoice,
  // Stock Transfers
  ModelNameEnum.Shipment,
  ModelNameEnum.PurchaseReceipt,
  // Other Transactional
  ModelNameEnum.Payment,
  ModelNameEnum.JournalEntry,
  ModelNameEnum.StockMovement,
  // Non Transfers
  ModelNameEnum.Party,
  ModelNameEnum.Item,
  ModelNameEnum.Account,
  ModelNameEnum.Location,
  // Ledgers
  ModelNameEnum.AccountingLedgerEntry,
  ModelNameEnum.StockLedgerEntry,
];

const linkEntryDisplayFields: Record<string, string[]> = {
  // Invoices
  [ModelNameEnum.SalesInvoice]: [
    'name',
    'date',
    'party',
    'grand_total',
    'outstanding_amount',
    'stock_not_transferred',
  ],
  [ModelNameEnum.PurchaseInvoice]: [
    'name',
    'date',
    'party',
    'grand_total',
    'outstanding_amount',
    'stock_not_transferred',
  ],
  // Stock Transfers
  [ModelNameEnum.Shipment]: ['name', 'date', 'party', 'grand_total'],
  [ModelNameEnum.PurchaseReceipt]: ['name', 'date', 'party', 'grand_total'],
  // Other Transactional
  [ModelNameEnum.Payment]: ['name', 'date', 'party', 'amount'],
  [ModelNameEnum.JournalEntry]: ['name', 'date', 'entry_type'],
  [ModelNameEnum.StockMovement]: ['name', 'date', 'amount'],
  // Ledgers
  [ModelNameEnum.AccountingLedgerEntry]: ['name', 'posting_date', 'account', 'credit', 'debit'],
  [ModelNameEnum.StockLedgerEntry]: ['name', 'date', 'item', 'location', 'quantity'],
};
</script>
<style scoped>
.pill-container:empty {
  display: none;
}
</style>
