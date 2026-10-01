<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-2">
      <FrappeButton v-bind="colourProps('save')" @click="$emit('save')">{{
        t`Save`
      }}</FrappeButton>
      <FrappeButton v-bind="colourProps('cancel')" @click="$emit('clear')">{{
        t`Cancel`
      }}</FrappeButton>
      <FrappeButton
        v-bind="colourProps('held')"
        :class="{ 'col-span-2': !enableReturns }"
        @click="$emit('held')"
        >{{ t`Held` }}</FrappeButton
      >
      <FrappeButton
        v-if="enableReturns"
        v-bind="colourProps('return')"
        @click="$emit('return')"
        >{{ t`Return` }}</FrappeButton
      >
    </div>
    <FrappeButton
      size="md"
      variant="solid"
      v-bind="colourProps('pay')"
      :disabled="disablePay"
      @click="$emit('pay')"
    >
      {{ isReturn ? t`Refund` : t`Pay` }}
    </FrappeButton>
  </div>
</template>

<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { fyo } from 'src/initFyo';
import { getButtonTextColor } from 'src/utils/button';

const props = defineProps<{
  profile?: POSProfile | null;
  enableReturns?: boolean;
  disablePay?: boolean;
  isReturn?: boolean;
}>();
defineEmits<{ save: []; clear: []; held: []; return: []; pay: [] }>();

// frappe-ui has no arbitrary button colours, so only red and green map to a theme.
const themeByColour: Record<string, 'green' | 'red'> = {
  '#86efac': 'green',
  '#f98080': 'red',
};

function colourProps(action: 'save' | 'cancel' | 'held' | 'return' | 'pay') {
  const colour = String(
    props.profile?.[`${action}_button_colour`] ||
      fyo.singles.Defaults?.get(`${action}_button_colour`) ||
      ''
  ).toLowerCase();
  if (!colour) {
    return {};
  }

  const theme = themeByColour[colour];
  if (theme) {
    return { variant: 'solid' as const, theme };
  }

  return {
    variant: 'solid' as const,
    class: 'pos-colour-button',
    style: {
      '--pos-button-background': colour,
      '--pos-button-foreground': getButtonTextColor(colour),
    },
  };
}
</script>

<style scoped>
.pos-colour-button:not(:disabled) {
  background-color: var(--pos-button-background);
  color: var(--pos-button-foreground);
}

.pos-colour-button:not(:disabled):hover {
  background-color: color-mix(in srgb, var(--pos-button-background), black 8%);
}
</style>
