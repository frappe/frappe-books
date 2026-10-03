<template>
  <div
    class="flex items-center bg-surface-gray-2"
    :class="size === 'sm' ? 'h-7 rounded-4' : 'h-10 rounded-5'"
  >
    <FrappeButton
      v-if="removable && value <= 1"
      variant="ghost"
      :size="buttonSize"
      icon="lucide-trash-2"
      :label="t`Remove`"
      @click="$emit('remove')"
    />
    <FrappeButton
      v-else
      variant="ghost"
      :size="buttonSize"
      icon="lucide-minus"
      :label="t`Decrease`"
      :disabled="value <= min"
      @click="$emit('change', value - 1)"
    />
    <!-- TextInput can't align its text (frappe/frappe-ui#1256). -->
    <FormControl
      class="min-w-0 flex-1"
      input-class="[&_input]:text-center [&_input]:tabular-nums"
      :df="df"
      :value="value"
      :size="size === 'sm' ? 'small' : 'large'"
      :text-right="false"
      :read-only="false"
      @change="(next: number) => $emit('change', next)"
    />
    <FrappeButton
      variant="ghost"
      :size="buttonSize"
      icon="lucide-plus"
      :label="t`Increase`"
      @click="$emit('change', value + 1)"
    />
  </div>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton } from 'frappe-ui';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import { computed } from 'vue';

/** A count with minus and plus buttons; minus can turn into remove at one. */
const props = withDefaults(
  defineProps<{
    value: number;
    df: Field;
    min?: number;
    removable?: boolean;
    /** `sm` fits a desktop table row; `lg` is a touch target. */
    size?: 'sm' | 'lg';
  }>(),
  { min: 0, removable: false, size: 'lg' }
);

const buttonSize = computed(() => (props.size === 'sm' ? 'xs' : 'lg'));

defineEmits<{ change: [value: number]; remove: [] }>();
</script>
