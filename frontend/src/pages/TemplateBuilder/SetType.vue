<template>
  <FrappeDialog
    :open="open"
    :title="t`Set Template Type`"
    size="2xl"
    @update:open="(value: boolean) => $emit('update:open', value)"
  >
    <div class="flex w-full flex-col gap-4">
      <p class="text-base text-ink-gray-9">
        {{ t`Select the template type.` }}
      </p>
      <Select
        :df="df"
        :value="type"
        :border="true"
        :show-label="true"
        @change="typeChange"
      />
    </div>
    <template #actions>
      <div class="flex justify-end">
        <FrappeButton variant="solid" @click="done">{{ t`Done` }}</FrappeButton>
      </div>
    </template>
  </FrappeDialog>
</template>
<script lang="ts">
import { Button as FrappeButton, Dialog as FrappeDialog } from 'frappe-ui';
import { PrintTemplate } from 'models/baseModels/PrintTemplate';
import { OptionField, SelectOption } from 'schemas/types';
import Select from 'src/components/Controls/Select.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeDialog, Select, FrappeButton },
  props: {
    open: { type: Boolean, default: false },
    doc: { type: PrintTemplate, required: true },
  },
  emits: ['update:open'],
  data() {
    return { type: 'SalesInvoice' };
  },
  computed: {
    df(): OptionField {
      const options = PrintTemplate.lists.type?.(this.doc) ?? [];
      const firstOption = options[0];
      return {
        ...this.fyo.getField('PrintTemplate', 'type'),
        options,
        fieldtype: 'Select',
        default:
          typeof firstOption === 'string' ? firstOption : firstOption?.value,
      } as OptionField;
    },
  },
  watch: {
    open: {
      handler(open: boolean) {
        if (open) {
          this.type = this.doc.type ?? 'SalesInvoice';
        }
      },
      immediate: true,
    },
  },
  methods: {
    typeChange(v: string | number | SelectOption | undefined) {
      if (typeof v !== 'string') {
        return;
      }
      if (this.type === v) {
        return;
      }

      this.type = v;
    },
    async done() {
      await this.doc.set('type', this.type);
      this.$emit('update:open', false);
    },
  },
});
</script>
