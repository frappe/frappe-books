<template>
  <Modal
    :open-modal="openModal"
    :title="t`Select Batch`"
    @closemodal="closeModal"
  >
    <div class="flex flex-col gap-4">
      <p class="break-words text-sm text-ink-gray-6">
        {{ itemCode }}
      </p>
      <Link
        :df="{
          fieldname: 'batch',
          fieldtype: 'Link',
          target: 'Batch',
          label: t`Batch`,
          required: true,
          filters: [['item', '=', itemCode]],
        }"
        :value="selectedBatch"
        :border="true"
        :show-label="true"
        @change="(value: string) => (selectedBatch = value)"
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
        :disabled="!selectedBatch"
        @click="submitSelection"
        >{{ t`Select` }}</FrappeButton>
    </template>
  </Modal>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { defineComponent } from 'vue';
import Modal from 'src/components/POS/POSDialog.vue';
import Link from 'src/components/Controls/Link.vue';

export default defineComponent({
  name: 'BatchSelectionModal',
  components: {
    Modal,
    FrappeButton,
    Link,
  },
  props: {
    openModal: {
      type: Boolean,
      default: false,
    },
    itemCode: {
      type: String,
      required: true,
    },
  },
  emits: ['toggleModal', 'batchSelected'],
  data() {
    return {
      selectedBatch: '' as string,
    };
  },
  methods: {
    submitSelection() {
      this.$emit('batchSelected', this.selectedBatch);
      this.$emit('toggleModal', 'BatchSelection');
      this.selectedBatch = '';
    },
    closeModal() {
      this.$emit('toggleModal', 'BatchSelection');
      this.selectedBatch = '';
    },
  },
});
</script>
