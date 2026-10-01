<template>
  <div class="-mx-2 flex flex-col">
    <section
      v-for="group in groups"
      :key="group.label"
      :aria-label="group.label"
      class="flex flex-col"
    >
      <h3 class="px-3 pb-1.5 pt-3 text-sm text-ink-gray-5">
        {{ group.label }}
      </h3>
      <FrappeItemListRow
        v-for="field in group.fields"
        :key="field.fieldname"
        as="button"
        type="button"
        size="lg"
        class="min-h-12 text-start active:bg-surface-gray-2"
        @click="$emit('pick', field)"
      >
        <template #prefix>
          <span
            aria-hidden="true"
            class="size-4 text-ink-gray-5"
            :class="fieldIcons[field.fieldtype] ?? 'lucide-type'"
          />
        </template>
        {{ getFieldLabel(field) }}
        <template #suffix>
          <span class="text-sm text-ink-gray-5">{{ field.fieldtype }}</span>
        </template>
      </FrappeItemListRow>
    </section>
  </div>
</template>
<script lang="ts">
import { ItemListRow as FrappeItemListRow } from 'frappe-ui';
import type { Field, FieldType } from 'schemas/types';
import { getFieldLabel } from 'src/utils/filterFields';
import { defineComponent, type PropType } from 'vue';

const fieldIcons: Partial<Record<FieldType, string>> = {
  Select: 'lucide-list',
  AutoComplete: 'lucide-list',
  Link: 'lucide-link',
  DynamicLink: 'lucide-link',
  Date: 'lucide-calendar',
  Datetime: 'lucide-calendar-clock',
  Currency: 'lucide-banknote',
  Int: 'lucide-hash',
  Float: 'lucide-hash',
  Check: 'lucide-square-check',
  Text: 'lucide-text',
};

export default defineComponent({
  name: 'MobileFilterFieldList',
  components: { FrappeItemListRow },
  props: {
    fields: { type: Array as PropType<Field[]>, required: true },
  },
  emits: ['pick'],
  setup() {
    return { fieldIcons };
  },
  computed: {
    groups(): { label: string; fields: Field[] }[] {
      const custom = this.fields.filter((field) => field.isCustom);
      const standard = this.fields.filter((field) => !field.isCustom);
      return [
        { label: this.t`Fields`, fields: standard },
        { label: this.t`Custom fields`, fields: custom },
      ].filter((group) => group.fields.length);
    },
  },
  methods: { getFieldLabel },
});
</script>
