<template>
  <Modal
    :open-modal="openModal"
    :title="t`Apply Price List`"
    @closemodal="cancelPriceList"
  >
    <div class="flex items-end gap-3">
      <Link
        v-if="sinvDoc.fieldMap"
        class="min-w-0 flex-1"
        :border="true"
        :show-label="true"
        :value="selectedPriceList"
        :focus-input="!isMobile"
        :df="sinvDoc.fieldMap.price_list"
        @change="(value) => (selectedPriceList = value ?? '')"
      />
      <FrappeButton
        v-if="selectedPriceList"
        icon="lucide-trash-2"
        theme="red"
        variant="ghost"
        class="shrink-0"
        :tooltip="t`Remove price list`"
        :aria-label="t`Remove price list`"
        @click="removePriceList"
      />
    </div>
    <template #actions="{ size }">
      <FrappeButton :size="size" class="min-w-24" @click="cancelPriceList">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        :size="size"
        class="min-w-24"
        variant="solid"
        @click="setPriceList"
        >{{ t`Save` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { t } from 'fyo';
import Modal from 'src/components/POS/POSDialog.vue';
import { defineComponent, inject } from 'vue';
import { showToast } from 'src/utils/interactive';
import Link from 'src/components/Controls/Link.vue';
import { Button as FrappeButton } from 'frappe-ui';
import { isMobile } from 'src/utils/viewport';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';

export default defineComponent({
  name: 'PriceListModal',
  components: {
    Link,
    Modal,
    FrappeButton,
  },
  props: {
    openModal: Boolean,
  },
  emits: ['toggleModal'],
  setup() {
    return {
      isMobile,
      sinvDoc: inject('sinvDoc') as SalesInvoice,
    };
  },
  data() {
    return {
      selectedPriceList: '',
    };
  },
  watch: {
    openModal(value: boolean) {
      if (value) {
        this.selectedPriceList = this.sinvDoc.price_list ?? '';
      }
    },
  },
  methods: {
    removePriceList() {
      this.selectedPriceList = '';
    },
    async setPriceList() {
      try {
        await this.sinvDoc.set('price_list', this.selectedPriceList);
        this.$emit('toggleModal', 'PriceList');
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    cancelPriceList() {
      this.$emit('toggleModal', 'PriceList');
    },
  },
});
</script>
