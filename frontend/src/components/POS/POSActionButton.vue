<template>
  <FrappeButton v-bind="mergeProps($attrs, colourProps)">
    <slot />
  </FrappeButton>
</template>

<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { fyo } from 'src/initFyo';
import { getButtonTextColor } from 'src/utils/button';
import { computed, mergeProps } from 'vue';

/** A POS button in the colour the POS profile, else Books Defaults, sets for its action. */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  action: 'save' | 'cancel' | 'held' | 'return' | 'pay';
  profile?: POSProfile | null;
}>();

// frappe-ui has no arbitrary button colours, so only red and green map to a theme.
const themeByColour: Record<string, 'green' | 'red'> = {
  '#86efac': 'green',
  '#f98080': 'red',
};

const colourProps = computed(() => {
  const colour = String(
    props.profile?.[`${props.action}_button_colour`] ||
      fyo.singles.Defaults?.get(`${props.action}_button_colour`) ||
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
});
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
