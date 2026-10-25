<template>
  <template v-if="isMobile">
    <MobileFieldTrigger
      icon="lucide-chevron-down"
      :placeholder="allLabel"
      :display-value="selectedLabel"
      @click="isSheetOpen = true"
    />
    <MobileOptionsSheet
      v-model:open="isSheetOpen"
      :title="label"
      :options="options"
      :value="modelValue ?? ''"
      @select="(value) => select(String(value))"
    />
  </template>
  <FrappeSelect
    v-else
    class="w-48"
    :model-value="modelValue"
    :options="options"
    :placeholder="allLabel"
    :aria-label="label"
    @update:model-value="(value) => select(String(value ?? ''))"
  />
</template>
<script setup lang="ts">
import { Select as FrappeSelect } from 'frappe-ui';
import { getAllDocuments } from 'src/frappe/api';
import { getDocType } from 'src/frappe/doctypes';
import { getLinkLabel } from 'src/frappe/link';
import { getField } from 'src/frappe/registry';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { isMobile } from 'src/utils/viewport';
import { computed, onMounted, ref } from 'vue';

/** A list filter on one Link field: all its records, or one picked, like Item Price's price lists. */
const props = defineProps<{
  schemaName: string;
  fieldname: string;
  /** What the filter says while it shows every record, e.g. "All price lists". */
  allLabel: string;
  modelValue: string | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const isSheetOpen = ref(false);
const names = ref<string[]>([]);

const field = computed(() => getField(props.schemaName, props.fieldname));
const label = computed(() => field.value?.label ?? props.fieldname);
const target = computed(
  () => (field.value as { target?: string } | undefined)?.target ?? ''
);

const options = computed(() => [
  { label: props.allLabel, value: '' },
  ...names.value.map((name) => ({
    label: getLinkLabel(target.value, name),
    value: name,
  })),
]);

const selectedLabel = computed(() =>
  props.modelValue ? getLinkLabel(target.value, props.modelValue) : ''
);

// A user who cannot list the records gets only "All".
onMounted(async () => {
  const records = await getAllDocuments(getDocType(target.value).doctype, {
    fields: ['name'],
    orderBy: 'name asc',
  }).catch(() => []);
  names.value = records.map(({ name }) => String(name));
});

function select(value: string) {
  emit('update:modelValue', value || null);
}
</script>
