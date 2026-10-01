<template>
  <Modal
    :open-modal="openModal"
    :title="t`Return Sales Invoice`"
    size="2xl"
    body-class="flex h-[32rem] flex-col gap-3"
    @closemodal="closeModal"
  >
    <div class="shrink-0">
      <FrappeTextInput
        v-model="invoiceSearchTerm"
        type="text"
        :aria-label="t`Search by invoice name`"
        :placeholder="t`Search by invoice name`"
        class="w-full"
        :variant="isMobile ? 'subtle' : 'outline'"
        :size="isMobile ? 'lg' : 'md'"
        @keydown.enter="handleSearchEnter"
     >
        <template v-if="isMobile" #prefix>
          <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
        </template>
      </FrappeTextInput>
    </div>

    <InvoiceSelectionTable
      v-model="selectedInvoiceName"
      :rows="invoices"
      :fields="tableFields"
      :ratios="ratio"
      :empty-text="t`No invoices found`"
    />

    <div v-if="invoiceCount" class="shrink-0">
      <Paginator
        :item-count="invoiceCount"
        :allowed-counts="[20, 40, -1]"
        @index-change="setPageIndices"
      />
    </div>

    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="closeModal">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        :disabled="!selectedInvoiceName"
        @click="returnSelectedInvoice"
        >{{ t`Create Return` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import Modal from 'src/components/POS/POSDialog.vue';
import InvoiceSelectionTable from 'src/components/POS/InvoiceSelectionTable.vue';
import type { DocValueMap } from 'fyo/core/types';
import { defineComponent } from 'vue';
import { Field } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import {
  getPOSInvoiceCount,
  getPOSInvoiceFields,
  getPOSInvoices,
} from 'src/utils/pos';
import Paginator from 'src/components/Paginator.vue';
import { TextInput as FrappeTextInput, Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

/** Submitted sales that are not returns and have something left to return. */
const RETURNABLE_FILTERS: Filter[] = [
  ['docstatus', '=', 1],
  ['return_against', 'is', 'not set'],
  ['is_fully_returned', '=', 0],
];

export default defineComponent({
  name: 'ReturnSalesInvoice',
  components: {
    Modal,
    FrappeButton,
    FrappeIcon,
    InvoiceSelectionTable,
    Paginator,
    FrappeTextInput,
  },
  props: {
    openModal: Boolean,
  },
  emits: ['toggleModal', 'selectedReturnInvoice'],
  setup() {
    return { isMobile };
  },
  data() {
    return {
      invoices: [] as DocValueMap[],
      invoiceCount: 0,
      invoiceSearchTerm: '',
      pageStart: 0,
      pageEnd: 20,
      selectedInvoiceName: '',
      loading: undefined as Promise<void> | undefined,
    };
  },
  computed: {
    ratio() {
      return [1, 1, 1, 0.8];
    },
    tableFields(): Field[] {
      return getPOSInvoiceFields();
    },
  },
  watch: {
    async openModal(newVal) {
      if (newVal) {
        this.selectedInvoiceName = '';
        await this.setInvoices();
      }
    },
    async invoiceSearchTerm() {
      this.pageStart = 0;
      this.pageEnd = this.pageEnd - this.pageStart || 20;
      this.selectedInvoiceName = '';
      await this.setInvoices();
    },
  },

  methods: {
    closeModal() {
      this.selectedInvoiceName = '';
      this.$emit('toggleModal', 'ReturnSalesInvoice');
    },
    returnSelectedInvoice() {
      if (!this.selectedInvoiceName) {
        return;
      }

      this.$emit('selectedReturnInvoice', this.selectedInvoiceName);
      this.closeModal();
    },
    async handleSearchEnter() {
      await this.loading;
      if (this.invoiceCount === 1) {
        this.selectedInvoiceName = String(this.invoices[0].name);
      }
    },
    async setPageIndices({ start, end }: { start: number; end: number }) {
      if (start === this.pageStart && end === this.pageEnd) {
        return;
      }

      this.pageStart = start;
      this.pageEnd = end;
      this.selectedInvoiceName = '';
      await this.setInvoices();
    },
    /** The page's invoices whose name has the search term, and how many match; a later load replaces them. */
    async setInvoices() {
      const search = this.invoiceSearchTerm;
      const length = this.pageEnd - this.pageStart;
      const loading = Promise.all([
        getPOSInvoices(RETURNABLE_FILTERS, search, this.pageStart, length),
        getPOSInvoiceCount(RETURNABLE_FILTERS, search),
      ]).then(([invoices, invoiceCount]) => {
        if (this.loading === loading) {
          this.invoices = invoices;
          this.invoiceCount = invoiceCount;
        }
      });
      this.loading = loading;
      await loading;
    },
  },
});
</script>
