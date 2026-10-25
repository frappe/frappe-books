<template>
  <!-- A click anywhere on the row toggles it, as on a selectable list. -->
  <FrappeListRow
    :class="field.lock ? 'cursor-default' : ''"
    @click="!field.lock && $emit('toggle')"
  >
    <template v-if="isMobile">
      <FrappeListCell>
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="truncate text-lg" :class="labelClass">
              {{ field.label }}
            </span>
            <FrappeBadge
              v-if="badge"
              class="shrink-0"
              theme="gray"
              :label="badge"
            />
          </div>
          <div class="mt-0.5 truncate text-md text-ink-gray-5">
            {{ field.section }} · {{ field.fieldtype }}
          </div>
        </div>
      </FrappeListCell>
      <FrappeListCell class="justify-end" @click.stop>
        <FrappeCheckbox
          size="md"
          :model-value="isOn"
          :disabled="!!field.lock"
          :aria-label="field.label"
          @update:model-value="$emit('toggle')"
        />
      </FrappeListCell>
    </template>
    <template v-else>
      <FrappeListCell @click.stop>
        <FrappeCheckbox
          :model-value="isOn"
          :disabled="!!field.lock"
          :aria-label="field.label"
          @update:model-value="$emit('toggle')"
        />
      </FrappeListCell>
      <FrappeListCell class="gap-2">
        <span class="truncate" :class="labelClass">{{ field.label }}</span>
        <FrappeBadge
          v-if="badge"
          class="shrink-0"
          theme="gray"
          size="sm"
          :label="badge"
        />
      </FrappeListCell>
      <FrappeListCell class="text-ink-gray-5">
        <span class="truncate">{{ field.section }}</span>
      </FrappeListCell>
      <FrappeListCell class="text-ink-gray-5">
        <span class="truncate">{{ field.fieldtype }}</span>
      </FrappeListCell>
    </template>
  </FrappeListRow>
</template>
<script setup lang="ts">
import { Badge as FrappeBadge, Checkbox as FrappeCheckbox } from 'frappe-ui';
import {
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
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
