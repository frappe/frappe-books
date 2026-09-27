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
      :rows="paginatedInvoices"
      :fields="tableFields"
      :ratios="ratio"
      :empty-text="t`No invoices found`"
    />

    <div v-if="filteredInvoices.length" class="shrink-0">
      <Paginator
        :item-count="filteredInvoices.length"
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
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { defineComponent } from 'vue';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import { Money } from 'pesa';
import Paginator from 'src/components/Paginator.vue';
import { TextInput as FrappeTextInput, Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

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
      returnedInvoices: [] as SalesInvoice[],
      invoiceSearchTerm: '',
      pageStart: 0,
      pageEnd: 20,
      selectedInvoiceName: '',
    };
  },
  computed: {
    ratio() {
      return [1, 1, 1, 0.8];
    },
    tableFields() {
      return [
        {
          fieldname: 'name',
          label: 'Name',
          fieldtype: 'Data',
          readOnly: true,
        },
        {
          fieldname: 'party',
          fieldtype: 'Data',
          label: 'Customer',
          placeholder: 'Customer',
          readOnly: true,
        },
        {
          fieldname: 'date',
          label: 'Date',
          fieldtype: 'Date',
          readOnly: true,
        },
        {
          fieldname: 'grandTotal',
          label: 'Grand Total',
          fieldtype: 'Currency',
          readOnly: true,
        },
      ] as Field[];
    },
    filteredInvoices() {
      return this.returnedInvoices.filter((invoice) =>
        (invoice.name as string)
          .toLowerCase()
          .includes(this.invoiceSearchTerm.toLowerCase())
      );
    },
    paginatedInvoices() {
      return this.filteredInvoices.slice(this.pageStart, this.pageEnd);
    },
  },
  watch: {
    async openModal(newVal) {
      if (newVal) {
        this.selectedInvoiceName = '';
        await this.setReturnedInvoices();
      }
    },
    invoiceSearchTerm() {
      this.pageStart = 0;
      this.pageEnd = this.pageEnd - this.pageStart || 20;
      this.selectedInvoiceName = '';
    },
  },
  async mounted() {
    await this.setReturnedInvoices();
  },
  async activated() {
    await this.setReturnedInvoices();
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
    handleSearchEnter() {
      if (this.filteredInvoices.length === 1) {
        this.selectedInvoiceName = String(this.filteredInvoices[0].name);
      }
    },
    setPageIndices({ start, end }: { start: number; end: number }) {
      this.pageStart = start;
      this.pageEnd = end;
      this.selectedInvoiceName = '';
    },
    async setReturnedInvoices() {
      const allInvoices = await this.fyo.db.getAll(ModelNameEnum.SalesInvoice, {
        fields: [],
        filters: {
          isPOS: true,
          submitted: true,
          cancelled: false,
        },
      });

      const returnedInvoiceNames = allInvoices
        .filter((inv) => {
          if (inv.isFullyReturned || inv.returnAgainst) {
            return false;
          }

          if (inv.isReturned && !inv.isFullyReturned) {
            return true;
          }

          if (!inv.isReturned && !inv.returnAgainst) {
            return true;
          }

          if (!inv.isReturned && !(inv.outstandingAmount as Money).isZero()) {
            return true;
          }

          return false;
        })
        .map((inv) => inv.name);
      this.returnedInvoices = allInvoices.filter((inv) =>
        returnedInvoiceNames.includes(inv.name)
      ) as SalesInvoice[];
    },
  },
});
</script>
