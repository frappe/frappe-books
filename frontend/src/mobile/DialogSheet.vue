<template>
  <FrappeBottomSheet
    v-if="isMounted"
    :open="Boolean(sheet)"
    :title="sheet?.title"
    :dismissible="sheet?.dismissible"
    @update:open="onOpenChange"
    @after-leave="isMounted = Boolean(sheet)"
  >
    <div
      v-if="sheet"
      class="flex flex-col gap-5 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center"
    >
      <p v-if="sheet.detail" class="text-p-md text-ink-gray-7">
        <component :is="renderSafeRichText(sheet.detail)" />
      </p>
      <div class="flex flex-col gap-2">
        <FrappeButton
          v-for="action in sheet.actions"
          :key="action.label"
          size="lg"
          :variant="action.variant"
          :theme="action.theme"
          :label="action.label"
          @click="() => run(action)"
        />
      </div>
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import {
  dialogSheet as sheet,
  type DialogSheetAction,
} from 'src/utils/interactive';
import { renderSafeRichText } from 'src/utils/safeRichText';
import { ref, watch } from 'vue';

// A teleport keeps the spot in <body> it got on mount, so a sheet mounted with
// the app opens behind sheets mounted later. Mounting per dialog puts it on top.
const isMounted = ref(false);
watch(sheet, (value) => {
  if (value) {
    isMounted.value = true;
  }
});

async function run(action: DialogSheetAction) {
  // Cleared first, so an action can open the next dialog.
  sheet.value = null;
  await action.onClick();
}

async function onOpenChange(open: boolean) {
  const current = sheet.value;
  if (open || !current) {
    return;
  }

  sheet.value = null;
  await current.onCancel();
}
</script>
