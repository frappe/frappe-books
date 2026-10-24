<template>
  <div class="flex items-center gap-2">
    <FrappeBadge
      v-if="changed"
      theme="amber"
      variant="subtle"
      size="md"
      :label="t`Not saved`"
    />
    <FrappeButton
      variant="solid"
      :label="t`Save`"
      :disabled="!changed || saving"
      :loading="saving"
      @click="save"
    />
  </div>
</template>
<script setup lang="ts">
import { Badge as FrappeBadge, Button as FrappeButton, toast } from 'frappe-ui';
import { t } from 'fyo';
import { computed, ref } from 'vue';
import {
  getFailureText,
  getPickerLabel,
  isChanged,
  savePicks,
} from './fieldPicker';

const SAVED_TOAST_MS = 3_000;

/** "Not saved" while a form's picks differ from the saved ones, and Save. */
const props = defineProps<{ schemaName: string }>();

const saving = ref(false);
const changed = computed(() => isChanged(props.schemaName));

async function save() {
  saving.value = true;
  try {
    await savePicks(props.schemaName);
    const label = getPickerLabel(props.schemaName);
    toast.success(t`${label} fields saved`, { duration: SAVED_TOAST_MS });
  } catch (error) {
    // The picks stay ticked and unsaved.
    toast.error(getFailureText(error));
  } finally {
    saving.value = false;
  }
}
</script>
