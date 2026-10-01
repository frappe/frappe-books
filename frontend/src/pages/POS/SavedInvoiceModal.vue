<template>
  <Modal
    :open-modal="openModal"
    :title="t`Saved and Submitted Invoices`"
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
        @keyup.enter="handleEnterKey"
     >
        <template v-if="isMobile" #prefix>
          <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
        </template>
      </FrappeTextInput>
    </div>

    <FrappeTabButtons
      :model-value="savedInvoiceList ? 'saved' : 'submitted'"
      :options="invoiceTabs"
      class="w-full shrink-0"
      fluid
      @update:model-value="showSavedInvoices($event === 'saved')"
    />

    <InvoiceSelectionTable
      v-model="selectedInvoiceName"
      :rows="filteredInvoices"
      :fields="tableFields"
      :ratios="ratio"
      :empty-text="t`No invoices found`"
    />

    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="closeModal">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        :disabled="!selectedInvoiceName"
        @click="openSelectedInvoice"
        >{{ t`Open Invoice` }}</FrappeButton>
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
import { getPOSInvoiceFields, getPOSInvoices } from 'src/utils/pos';
import { TabButtons as FrappeTabButtons, TextInput as FrappeTextInput, Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

const SAVED_FILTERS: Filter[] = [['docstatus', '=', 0]];
/** Submitted sales still owed, which the POS takes payment for. */
const SUBMITTED_FILTERS: Filter[] = [
  ['docstatus', 'in', [1, 2]],
  ['return_against', 'is', 'not set'],
  ['outstanding_amount', '!=', 0],
];

export default defineComponent({
  name: 'SavedInvoiceModal',
  components: {
    Modal,
    FrappeButton,
    FrappeIcon,
    InvoiceSelectionTable,
    FrappeTextInput,
    FrappeTabButtons,
  },
  props: {
    openModal: Boolean,
  },
  emits: ['toggleModal', 'selectedInvoiceName'],
  setup() {
    return { isMobile };
  },
  data() {
    return {
      savedInvoiceList: true,
      savedInvoices: [] as DocValueMap[],
      submittedInvoices: [] as DocValueMap[],
      invoiceSearchTerm: '',
      selectedInvoiceName: '',
      loading: undefined as Promise<void> | undefined,
    };
  },
  computed: {
    ratio() {
      return [1, 1, 1, 0.8];
    },
    invoiceTabs() {
      return [
        { value: 'saved', label: this.t`Saved` },
        { value: 'submitted', label: this.t`Submitted` },
      ];
    },
    tableFields(): Field[] {
      return getPOSInvoiceFields();
    },
    filteredInvoices() {
      return this.savedInvoiceList ? this.savedInvoices : this.submittedInvoices;
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
      this.selectedInvoiceName = '';
      await this.setInvoices();
    },
  },

  methods: {
    /** Both tabs' invoices whose name has the search term; a later search replaces them. */
    async setInvoices() {
      const search = this.invoiceSearchTerm;
      const loading = Promise.all([
        getPOSInvoices(SAVED_FILTERS, search),
        getPOSInvoices(SUBMITTED_FILTERS, search),
      ]).then(([saved, submitted]) => {
        if (this.loading === loading) {
          this.savedInvoices = saved;
          this.submittedInvoices = submitted;
        }
      });
      this.loading = loading;
      await loading;
    },
    closeModal() {
      this.selectedInvoiceName = '';
      this.$emit('toggleModal', 'SavedInvoice');
    },
    openSelectedInvoice() {
      const selectedInvoice = this.filteredInvoices.find(
        (invoice) => invoice.name === this.selectedInvoiceName,
      );
      if (!selectedInvoice) {
        return;
      }

      this.$emit('selectedInvoiceName', selectedInvoice);
      this.closeModal();
    },
    showSavedInvoices(saved: boolean) {
      this.savedInvoiceList = saved;
      this.selectedInvoiceName = '';
    },
    async handleEnterKey() {
      await this.loading;
      if (this.filteredInvoices.length === 1) {
        this.selectedInvoiceName = String(this.filteredInvoices[0].name);
      }
    },
  },
});
</script>
