<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span :id="labelId" class="text-sm text-ink-gray-6">
        {{ label ?? t`Payment method` }}
      </span>
      <FrappeButton
        v-if="removable"
        icon="lucide-x"
        variant="ghost"
        size="xs"
        :tooltip="t`Remove payment`"
        :aria-label="t`Remove ${label ?? ''}`"
        @click="$emit('remove')"
      />
    </div>
    <!-- 64px tiles: RadioGroup rows stop at 32px (frappe/frappe-ui#1257). -->
    <div
      role="radiogroup"
      class="grid grid-cols-4 gap-2"
      :aria-labelledby="labelId"
    >
      <button
        v-for="method in methods"
        :key="method.name"
        type="button"
        role="radio"
        class="flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-5 border px-2 transition-colors"
        :class="
          method.name === selected
            ? 'border-outline-gray-5 text-sm-medium text-ink-gray-9 ring-1 ring-outline-gray-5'
            : 'border-outline-gray-2 text-sm text-ink-gray-6 hover:bg-surface-gray-1'
        "
        :aria-checked="method.name === selected"
        @click="$emit('select', method.name)"
      >
        <FrappeIcon
          :icon="paymentMethodIcons[method.type ?? 'Cash']"
          class="size-4.5 shrink-0"
        />
        <span class="w-full truncate text-center">{{ method.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button as FrappeButton, Icon as FrappeIcon } from 'frappe-ui';
import { t } from 'fyo';
import { useId } from 'vue';
import { PaymentMethodOption, paymentMethodIcons } from './types';

defineProps<{
  methods: PaymentMethodOption[];
  selected?: string;
  /** A split payment names each tender ("Payment 2"), which it can remove. */
  label?: string;
  removable?: boolean;
}>();
defineEmits<{ select: [method: string]; remove: [] }>();

const labelId = useId();
</script>
