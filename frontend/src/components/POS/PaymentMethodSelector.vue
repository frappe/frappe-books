<template>
  <div class="flex flex-col gap-1.5">
    <span :id="labelId" class="text-sm text-ink-gray-6">
      {{ t`Payment method` }}
    </span>
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
import { Icon as FrappeIcon } from 'frappe-ui';
import { t } from 'fyo';
import { useId } from 'vue';
import { PaymentMethodOption, paymentMethodIcons } from './types';

defineProps<{ methods: PaymentMethodOption[]; selected?: string }>();
defineEmits<{ select: [method: string] }>();

const labelId = useId();
</script>
