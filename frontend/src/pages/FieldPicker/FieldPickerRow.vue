<template>
  <!-- The whole row is the checkbox's label, so a click anywhere toggles it. -->
  <label
    v-if="isMobile"
    class="flex h-14 items-center gap-3 border-b border-outline-gray-1 px-4"
    :class="
      field.lock ? 'cursor-default' : 'cursor-pointer active:bg-surface-gray-2'
    "
  >
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="truncate text-md" :class="labelClass">{{
          field.label
        }}</span>
        <FrappeBadge
          v-if="badge"
          class="shrink-0"
          theme="gray"
          variant="subtle"
          size="sm"
          :label="badge"
        />
      </span>
      <span class="truncate text-xs text-ink-gray-5">
        {{ field.section }} · {{ field.fieldtype }}
      </span>
    </span>
    <FrappeCheckbox
      size="md"
      :model-value="isOn"
      :disabled="!!field.lock"
      :aria-label="field.label"
      @update:model-value="$emit('toggle')"
    />
  </label>
  <label
    v-else
    class="grid h-9 grid-cols-[36px_minmax(0,1.3fr)_minmax(0,1fr)_150px] items-center border-b border-outline-gray-1 px-5"
    :class="
      field.lock
        ? 'cursor-default'
        : 'cursor-pointer transition-colors hover:bg-surface-gray-1'
    "
  >
    <FrappeCheckbox
      :model-value="isOn"
      :disabled="!!field.lock"
      :aria-label="field.label"
      @update:model-value="$emit('toggle')"
    />
    <span class="flex min-w-0 items-center gap-2">
      <span class="truncate text-base" :class="labelClass">{{
        field.label
      }}</span>
      <FrappeBadge
        v-if="badge"
        class="shrink-0"
        theme="gray"
        variant="subtle"
        size="sm"
        :label="badge"
      />
    </span>
    <span
      class="truncate text-sm"
      :class="field.lock ? 'text-ink-gray-5' : 'text-ink-gray-6'"
    >
      {{ field.section }}
    </span>
    <span class="truncate text-sm text-ink-gray-5">{{ field.fieldtype }}</span>
  </label>
</template>
<script setup lang="ts">
import { Badge as FrappeBadge, Checkbox as FrappeCheckbox } from 'frappe-ui';
import { t } from 'fyo';
import type { PickerField } from 'src/frappe/fieldPicks';
import { isMobile } from 'src/utils/viewport';
import { computed } from 'vue';

/** A field the picker lists: checked when picked; always on, with the reason, when locked. */
const props = defineProps<{ field: PickerField; picked: boolean }>();
defineEmits<{ toggle: [] }>();

const isOn = computed(() => !!props.field.lock || props.picked);
const badge = computed(() => {
  const { lock } = props.field;
  if (!lock) {
    return '';
  }

  return lock === 'mandatory' ? t`Mandatory` : t`On form`;
});
const labelClass = computed(() =>
  props.field.lock ? 'text-ink-gray-6' : 'text-ink-gray-8'
);
</script>
