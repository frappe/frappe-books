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
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { defineComponent } from 'vue';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import { Money } from 'pesa';
import { TabButtons as FrappeTabButtons, TextInput as FrappeTextInput, Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';

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
      savedInvoices: [] as SalesInvoice[],
      submittedInvoices: [] as SalesInvoice[],
      invoiceSearchTerm: '',
      selectedInvoiceName: '',
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
      const invoices = this.savedInvoiceList ? this.savedInvoices : this.submittedInvoices;
      return invoices.filter((invoice) =>
        (invoice.name as string).toLowerCase().includes(this.invoiceSearchTerm.toLowerCase()),
      );
    },
  },
  watch: {
    async openModal(newVal) {
      if (newVal) {
        this.selectedInvoiceName = '';
        await this.setSavedInvoices();
        await this.setSubmittedInvoices();
      }
    },
    invoiceSearchTerm() {
      this.selectedInvoiceName = '';
    },
  },
  async mounted() {
    await this.setSavedInvoices();
    await this.setSubmittedInvoices();
  },
  async activated() {
    await this.setSavedInvoices();
    await this.setSubmittedInvoices();
  },

  methods: {
    async setSavedInvoices() {
      this.savedInvoices = (await this.fyo.db.getAll(ModelNameEnum.SalesInvoice, {
        fields: [],
        filters: { isPOS: true, submitted: false },
      })) as SalesInvoice[];
    },
    async setSubmittedInvoices() {
      const invoices = (await this.fyo.db.getAll(ModelNameEnum.SalesInvoice, {
        fields: [],
        filters: { isPOS: true, submitted: true, returnAgainst: null },
      })) as SalesInvoice[];

      this.submittedInvoices = invoices.filter(
        (invoice) => !(invoice.outstandingAmount as Money).isZero(),
      );
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
    handleEnterKey() {
      if (this.filteredInvoices.length === 1) {
        this.selectedInvoiceName = String(this.filteredInvoices[0].name);
      }
    },
  },
});
</script>
