<template>
  <div class="flex w-fit flex-shrink-0 items-center gap-1">
    <FrappeKeyboardShortcut v-if="combo" :bg="!simple" :combo="combo" />
    <kbd
      v-if="hasNumberRange"
      class="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-4 bg-surface-gray-2 px-1.5 text-xs-medium text-ink-gray-7"
    >
      0–9
    </kbd>
  </div>
</template>

<script lang="ts">
import { KeyboardShortcut as FrappeKeyboardShortcut } from 'frappe-ui';
import { defineComponent, PropType } from 'vue';

const keyAliases: Record<string, string> = {
  pmod: 'Mod',
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  delete: 'Backspace',
  esc: 'Escape',
  enter: 'Enter',
  '+': 'Plus',
  '-': 'Minus',
};

export default defineComponent({
  name: 'ShortcutKeys',
  components: { FrappeKeyboardShortcut },
  props: {
    keys: { type: Array as PropType<string[]>, required: true },
    simple: { type: Boolean, default: false },
  },
  computed: {
    hasNumberRange(): boolean {
      return this.keys.includes('0-9');
    },
    combo(): string {
      return this.keys
        .filter((key) => key !== '0-9')
        .map((key) => keyAliases[key.toLowerCase()] ?? normalizeKey(key))
        .join('+');
    },
  },
});

function normalizeKey(key: string): string {
  if (/^\d$/.test(key)) {
    return `Digit${key}`;
  }

  return key.length === 1 ? key.toUpperCase() : key;
}
</script>
