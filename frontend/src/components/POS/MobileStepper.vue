<template>
  <div class="flex h-10 items-center rounded-5 bg-surface-gray-2">
    <FrappeButton
      v-if="removable && value <= 1"
      variant="ghost"
      size="lg"
      icon="lucide-trash-2"
      :label="t`Remove`"
      @click="$emit('remove')"
    />
    <FrappeButton
      v-else
      variant="ghost"
      size="lg"
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
      :text-right="false"
      :read-only="false"
      @change="(next: number) => $emit('change', next)"
    />
    <FrappeButton
      variant="ghost"
      size="lg"
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

/** A count with minus and plus buttons; minus can turn into remove at one. */
withDefaults(
  defineProps<{
    value: number;
    df: Field;
    min?: number;
    removable?: boolean;
  }>(),
  { min: 0, removable: false }
);

defineEmits<{ change: [value: number]; remove: [] }>();
</script>
