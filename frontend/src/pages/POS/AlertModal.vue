<template>
  <Modal
    :open-modal="openModal"
    :title="t`Leave this sale?`"
    size="lg"
    @closemodal="$emit('toggleModal', 'Alert')"
  >
    <p class="text-base leading-6 text-ink-gray-7">
      {{
        t`Save this sale to resume it later, or discard the selected items and continue to the invoice list.`
      }}
    </p>
    <template #actions>
      <FrappeButton size="md" @click="$emit('toggleModal', 'Alert')">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        size="md"
        theme="red"
        @click="
          routeTo('/list/SalesInvoice');
          $emit('toggleModal', 'Alert');
        "
        >{{ t`Discard and Continue` }}</FrappeButton>
      <FrappeButton size="md" variant="solid" @click="$emit('saveAndContinue')">{{
        t`Save and Continue`
      }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import Modal from 'src/components/POS/POSDialog.vue';
import { defineComponent } from 'vue';
import { routeTo } from 'src/utils/ui';

export default defineComponent({
  name: 'AlertModal',
  components: {
    Modal,
    FrappeButton,
  },
  props: {
    openModal: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['toggleModal', 'saveAndContinue'],
  methods: {
    routeTo,
  },
});
</script>
