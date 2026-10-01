<template>
  <Modal
    :open-modal="openModal"
    :title="t`Item Enquiry`"
    size="md"
    @closemodal="closeModal"
  >
    <div class="flex flex-col gap-4">
      <Link
        :df="{
          fieldname: 'item',
          fieldtype: 'Link',
          target: 'Item',
          label: t`Item`,
          required: true,
        }"
        :value="ItemEnquiry.item"
        :border="true"
        :show-label="true"
        @change="(value: string) => (ItemEnquiry.item = value)"
      />

      <Text
        :df="{
          fieldname: 'description',
          fieldtype: 'Text',
          label: t`Description`,
        }"
        :value="ItemEnquiry.description"
        :border="true"
        :show-label="true"
        @change="(value: string) => (ItemEnquiry.description = value)"
      />

      <Link
        :df="{
          fieldname: 'customer',
          fieldtype: 'Link',
          target: 'Party',
          label: t`Customer`,
        }"
        :value="ItemEnquiry.customer"
        :border="true"
        :show-label="true"
        @change="
          (value: string) => {
            ItemEnquiry.customer = value;
            updateCustomerContact(value);
          }
        "
      />

      <Data
        :df="{
          fieldname: 'contact',
          fieldtype: 'Data',
          label: t`Contact`,
        }"
        :value="ItemEnquiry.contact"
        :border="true"
        :show-label="true"
        @change="(value: string) => (ItemEnquiry.contact = value)"
      />

      <Link
        :df="{
          fieldname: 'similar_product',
          fieldtype: 'Link',
          target: 'Item',
          label: t`Similar Product`,
        }"
        :value="ItemEnquiry.similar_product"
        :border="true"
        :show-label="true"
        @change="(value: string) => (ItemEnquiry.similar_product = value)"
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
        @click="submitForm"
        >{{ t`Submit` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { defineComponent } from 'vue';
import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import Modal from 'src/components/POS/POSDialog.vue';
import Link from 'src/components/Controls/Link.vue';
import Text from 'src/components/Controls/Text.vue';
import Data from 'src/components/Controls/Data.vue';
import { ModelNameEnum } from 'models/types';
import { getDocuments } from 'src/frappe/api';
import { newFrappeDoc } from 'src/frappe/documents';

/** An enquiry's values by Books Item Enquiry fieldname. */
type Enquiry = Partial<
  Record<
    'item' | 'description' | 'customer' | 'contact' | 'similar_product',
    string
  >
>;

export default defineComponent({
  name: 'ItemEnquiryModal',
  components: {
    Modal,
    FrappeButton,
    Link,
    Text,
    Data,
  },
  props: {
    openModal: { type: Boolean, default: false },
    customer: { type: String, default: '' },
  },
  emits: ['toggleModal'],
  data() {
    return {
      ItemEnquiry: {} as Enquiry,
    };
  },
  watch: {
    openModal: {
      async handler(isOpen: boolean) {
        if (!isOpen) {
          return;
        }

        this.clearValues();
        if (!this.customer) {
          return;
        }

        this.ItemEnquiry.customer = this.customer;
        await this.updateCustomerContact(this.customer);
      },
    },
  },
  methods: {
    async updateCustomerContact(customer: string) {
      const [party] = await getDocuments('Books Party', {
        fields: ['phone'],
        filters: [['name', '=', customer]],
      });
      this.ItemEnquiry.contact = (party?.phone as string) || '';
    },

    async submitForm() {
      try {
        const itemEnquiryDoc = newFrappeDoc(
          ModelNameEnum.ItemEnquiry,
          this.ItemEnquiry
        );
        await itemEnquiryDoc.sync();
        showToast({
          type: 'success',
          message: t`Item enquiry submitted`,
        });
        this.clearValues();
        this.$emit('toggleModal', 'ItemEnquiry');
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    clearValues() {
      this.ItemEnquiry = {} as Enquiry;
    },
    closeModal() {
      this.clearValues();
      this.$emit('toggleModal', 'ItemEnquiry');
    },
  },
});
</script>
