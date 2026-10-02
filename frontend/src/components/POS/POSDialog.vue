<template>
  <FrappeBottomSheet
    v-if="isMobile"
    :open="openModal"
    :title="title"
    :dismissible="dismissible"
    @update:open="(open: boolean) => !open && $emit('closemodal')"
  >
    <div class="flex flex-col gap-4 px-4 text-ink-gray-9">
      <slot />
      <footer
        class="sticky bottom-0 -mx-4 flex gap-2 bg-surface-base px-4 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)] *:flex-1"
      >
        <slot name="actions" size="lg" />
      </footer>
    </div>
  </FrappeBottomSheet>
  <FrappeDialog
    v-else
    :open="openModal"
    :size="size"
    bare
    @close="$emit('closemodal')"
  >
    <div
      class="flex max-h-[calc(100dvh-6rem)] min-w-0 flex-col text-ink-gray-9"
    >
      <header
        class="flex shrink-0 items-center justify-between gap-4 border-b border-outline-gray-1 px-6 py-4"
      >
        <DialogTitle class="min-w-0 text-lg-semibold">
          {{ title }}
        </DialogTitle>
        <FrappeButton
          icon="lucide-x"
          variant="ghost"
          class="shrink-0"
          :aria-label="t`Close`"
          @click="$emit('closemodal')"
        />
      </header>
      <div
        class="min-h-0 overflow-y-auto px-6 py-5"
        :class="bodyClass"
      >
        <slot />
      </div>
      <footer
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-6 py-3"
      >
        <slot name="actions" size="md" />
      </footer>
    </div>
  </FrappeDialog>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  Dialog as FrappeDialog,
} from 'frappe-ui';
import { DialogTitle } from 'reka-ui';
import { isMobile } from 'src/utils/viewport';

/** A POS modal: a dialog on desktop, a bottom sheet on phones. */
withDefaults(
  defineProps<{
    openModal: boolean;
    title: string;
    size?: 'sm' | 'md' | 'lg' | '2xl' | '3xl' | '4xl';
    bodyClass?: string;
    dismissible?: boolean;
  }>(),
  { size: 'sm', bodyClass: '', dismissible: true }
);

defineEmits<{ closemodal: [] }>();
defineSlots<{
  default?: () => unknown;
  actions?: (props: { size: 'md' | 'lg' }) => unknown;
}>();
</script>
