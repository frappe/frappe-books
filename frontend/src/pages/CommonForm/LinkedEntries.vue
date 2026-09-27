<template>
  <div
    class="w-quick-edit bg-surface-base border-l border-outline-gray-1 overflow-y-auto custom-scroll custom-scroll-thumb2"
  >
    <!-- Page Header -->
    <div
      class="flex items-center justify-between px-4 h-row-largest sticky top-0 bg-surface-base"
      style="z-index: 1"
    >
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
      class="w-full overflow-y-auto custom-scroll custom-scroll-thumb2 border-t border-outline-gray-1 px-2"
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
              <p v-if="e.date" class="text-xs text-ink-gray-6">
                {{ fyo.format(e.date, 'Date') }}
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
                v-if="e.party || e.entryType || e.account"
                theme="gray"
                variant="subtle"
              >
                {{ e.party || e.entryType || e.account }}
              </FrappeBadge>

              <FrappeBadge v-if="e.item" theme="gray" variant="subtle">
                {{ e.item }}
              </FrappeBadge>
              <FrappeBadge v-if="e.location" theme="gray" variant="subtle">
                {{ e.location }}
              </FrappeBadge>

              <!-- Amounts -->
              <FrappeBadge
                v-if="isPesa(e.outstandingAmount) && !e.outstandingAmount.isZero()"
                theme="amber"
                variant="subtle"
              >
                {{ t`Unpaid ${fyo.format(e.outstandingAmount.abs(), 'Currency')}` }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="isPesa(e.grandTotal) && e.grandTotal.isPositive()"
                theme="green"
                variant="subtle"
              >
                {{ fyo.format(e.grandTotal, 'Currency') }}
              </FrappeBadge>
              <FrappeBadge
                v-else-if="isPesa(e.amount) && e.amount.isPositive()"
                theme="green"
                variant="subtle"
              >
                {{ fyo.format(e.amount, 'Currency') }}
              </FrappeBadge>

              <!-- Quantities -->
              <FrappeBadge v-if="e.stockNotTransferred" theme="amber" variant="subtle">
                {{ t`Pending qty. ${fyo.format(e.stockNotTransferred, 'Float')}` }}
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
  </div>
</template>
<script lang="ts">
import { Doc } from 'fyo/model/doc';
import { isPesa } from 'fyo/utils';
import {
  Alert as FrappeAlert,
  Badge as FrappeBadge,
  Button as FrappeButton,
  ItemListRow as FrappeItemListRow,
  LoadingText as FrappeLoadingText,
} from 'frappe-ui';
import { Accordion as FrappeAccordion, type AccordionItem } from 'frappe-ui-accordion';
import { ModelNameEnum } from 'models/types';
import { getLinkedEntries } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { PropType, defineComponent, inject } from 'vue';

const COMPONENT_NAME = 'LinkedEntries';

export default defineComponent({
  components: {
    FrappeAccordion,
    FrappeAlert,
    FrappeBadge,
    FrappeButton,
    FrappeItemListRow,
    FrappeLoadingText,
  },
  props: { doc: { type: Object as PropType<Doc>, required: true } },
  emits: ['close'],
  setup() {
    return { shortcuts: inject(shortcutsKey) };
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
        title: this.fyo.schemaMap[schemaName]?.label ?? schemaName,
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
          const details = await this.fyo.db.getAll(key, {
            fields,
            filters: { name: ['in', entryNames] },
          });

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
    'grandTotal',
    'outstandingAmount',
    'stockNotTransferred',
  ],
  [ModelNameEnum.PurchaseInvoice]: [
    'name',
    'date',
    'party',
    'grandTotal',
    'outstandingAmount',
    'stockNotTransferred',
  ],
  // Stock Transfers
  [ModelNameEnum.Shipment]: ['name', 'date', 'party', 'grandTotal'],
  [ModelNameEnum.PurchaseReceipt]: ['name', 'date', 'party', 'grandTotal'],
  // Other Transactional
  [ModelNameEnum.Payment]: ['name', 'date', 'party', 'amount'],
  [ModelNameEnum.JournalEntry]: ['name', 'date', 'entryType'],
  [ModelNameEnum.StockMovement]: ['name', 'date', 'amount'],
  // Ledgers
  [ModelNameEnum.AccountingLedgerEntry]: ['name', 'date', 'account', 'credit', 'debit'],
  [ModelNameEnum.StockLedgerEntry]: ['name', 'date', 'item', 'location', 'quantity'],
};
</script>
<style scoped>
.pill-container:empty {
  display: none;
}
</style>
