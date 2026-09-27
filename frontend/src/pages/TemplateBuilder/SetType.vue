<template>
  <div class="w-full">
    <FormHeader :form-title="t`Set Template Type`" />
    <hr class="border-outline-gray-1" />
    <div class="p-4 w-full flex flex-col gap-4">
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
    <div class="flex border-t border-outline-gray-1 p-4">
      <FrappeButton class="ml-auto" variant="solid" @click="done">{{
        t`Done`
      }}</FrappeButton>
    </div>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { PrintTemplate } from 'models/baseModels/PrintTemplate';
import { OptionField, SelectOption } from 'schemas/types';
import Select from 'src/components/Controls/Select.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FormHeader, Select, FrappeButton },
  props: { doc: { type: PrintTemplate, required: true } },
  emits: ['done'],
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
  mounted() {
    this.type = this.doc.type ?? 'SalesInvoice';
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
      this.$emit('done');
    },
  },
});
</script>
