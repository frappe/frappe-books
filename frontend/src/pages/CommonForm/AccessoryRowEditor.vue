<template>
  <!-- Phones edit a row on a page of its own, over the document's. -->
  <div
    v-if="isMobile"
    class="fixed inset-0 z-40 flex flex-col bg-surface-base"
    role="dialog"
    :aria-label="t`Row ${index + 1}`"
  >
    <header
      class="flex h-14 shrink-0 items-center gap-2 border-b border-outline-gray-1 px-2 pt-[env(safe-area-inset-top)]"
    >
      <FrappeButton
        variant="ghost"
        size="md"
        icon="lucide-chevron-left"
        :label="t`Back`"
        @click="$emit('close')"
      />
      <h2 class="min-w-0 flex-1 truncate text-lg-semibold text-ink-gray-9">
        {{ t`Row ${index + 1}` }}
      </h2>
      <FrappeButton
        v-if="canRemove"
        variant="ghost"
        size="md"
        icon="lucide-trash-2"
        :label="t`Delete row`"
        @click="remove"
      />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <MobileFormSection
        title="Default"
        :fields="fields"
        :doc="row"
        :errors="rowErrors"
        @value-change="setValue"
      />
      <MobileExtraFields
        :doc="row"
        :errors="rowErrors"
        @value-change="setValue"
      />
    </div>
    <footer
      class="flex gap-2 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
      <FrappeButton
        class="flex-1"
        size="lg"
        :variant="isEditable ? 'solid' : 'subtle'"
        :label="isEditable ? t`Done` : t`Back`"
        @click="$emit('close')"
      />
    </footer>
  </div>
  <FrappeDialog
    v-else
    :open="true"
    size="2xl"
    :title="title"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <div class="divide-y divide-outline-gray-1">
      <CommonFormSection
        class="pb-5"
        :fields="fields"
        :doc="row"
        :errors="rowErrors"
        @value-change="setValue"
      />
      <ExtraFields
        v-model:active-tab="endTab"
        :doc="row"
        :errors="rowErrors"
        @value-change="setValue"
      />
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <FrappeButton
          v-if="canRemove"
          theme="red"
          variant="subtle"
          :label="t`Delete row`"
          @click="remove"
        />
        <FrappeButton
          :variant="isEditable ? 'solid' : 'subtle'"
          :label="isEditable ? t`Done` : t`Close`"
          @click="$emit('close')"
        />
      </div>
    </template>
  </FrappeDialog>
</template>
<script setup lang="ts">
import { Button as FrappeButton, Dialog as FrappeDialog } from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Field } from 'schemas/types';
import { getRowSummary } from 'src/components/Controls/rowSummary';
import type { FrappeDoc } from 'src/frappe/document';
import { noteRowMissingExtras } from 'src/frappe/extraFields';
import { getFields } from 'src/frappe/registry';
import { getErrorMessage } from 'src/utils';
import { isMobile } from 'src/utils/viewport';
import { computed, ref, watch } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import ExtraFields from './ExtraFields.vue';
import { getRowBooksFields } from './extraFieldsView';
import MobileExtraFields from './MobileExtraFields.vue';
import MobileFormSection from './MobileFormSection.vue';

/**
 * Accessory mode's row editor: the row's Books fields, then More details and
 * the end tabs, as the document's form has them. Edits stay in the unsaved
 * document. A submitted document's row opens read only.
 */
const props = defineProps<{
  doc: FrappeDoc;
  fieldname: string;
  index: number;
  /** Messages by fieldname to start with, e.g. a mandatory field a save found empty. */
  errors: Record<string, string>;
}>();
const emit = defineEmits<{ close: [] }>();

const endTab = ref('');
const rowErrors = ref<Record<string, string>>({});
watch(
  () => props.errors,
  (given) => (rowErrors.value = { ...given }),
  { immediate: true }
);
const row = computed(
  () => (props.doc.get(props.fieldname) as FrappeDoc[])[props.index]
);
watch(row, (shown) => shown && noteRowMissingExtras(shown), {
  immediate: true,
});

const isEditable = computed(() => {
  const table = props.doc.fieldMap[props.fieldname];
  return !!table && !props.doc.getFieldState(table).readOnly;
});
const canRemove = computed(() => isEditable.value);

const fields = computed(() => getRowBooksFields(row.value));

const title = computed(() => {
  const shown = row.value;
  const columns = getFields(shown.schemaName, shown.schema.tableFields ?? []);
  const label = getRowSummary(shown, columns).title;
  const number = t`Row ${props.index + 1}`;
  return label ? `${number} · ${label}` : number;
});

async function setValue(field: Field, value: DocValue) {
  delete rowErrors.value[field.fieldname];
  try {
    await row.value.set(field.fieldname, value);
  } catch (error) {
    if (error instanceof Error) {
      rowErrors.value[field.fieldname] = getErrorMessage(error, row.value);
    }
  }
}

async function remove() {
  await props.doc.remove(props.fieldname, props.index);
  emit('close');
}
</script>
