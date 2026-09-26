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
          getOptions: getBatchOptions,
          filters: { item: itemCode },
        }"
        :value="selectedBatch"
        :border="true"
        :show-label="true"
        @change="(value: string) => (selectedBatch = value)"
      />
    </div>
    <template #actions>
      <Button size="md" class="min-w-24" @click="closeModal">{{
        t`Cancel`
      }}</Button>
      <Button
        size="md"
        class="min-w-24"
        type="primary"
        :disabled="!selectedBatch"
        @click="submitSelection"
        >{{ t`Select` }}</Button
      >
    </template>
  </Modal>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import Modal from 'src/components/POS/POSDialog.vue';
import Button from 'src/components/Button.vue';
import Link from 'src/components/Controls/Link.vue';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';

export default defineComponent({
  name: 'BatchSelectionModal',
  components: {
    Modal,
    Button,
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
    async getBatchOptions() {
      if (!this.itemCode) {
        return [];
      }

      try {
        const batches = (await fyo.db.getAll(ModelNameEnum.Batch, {
          filters: { item: this.itemCode },
          fields: ['name'],
        })) as { name: string; itemCode: string }[];

        return batches.map((b) => ({ label: b.name, value: b.name }));
      } catch {
        showToast({ type: 'error', message: t`Failed to load batches` });
        return [];
      }
    },
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
