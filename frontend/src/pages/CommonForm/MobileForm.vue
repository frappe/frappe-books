<template>
  <div class="flex flex-1 flex-col bg-surface-base">
    <PageHeader :title="title">
      <template #mobile>
        <FrappeButton
          v-if="actionGroups.length"
          variant="ghost"
          size="md"
          icon="lucide-ellipsis"
          :label="t`More actions`"
          @click="showActions = true"
        />
        <FrappeButton
          v-if="doc.canSave"
          variant="solid"
          size="md"
          :label="t`Save`"
          :disabled="doc.isSyncing"
          @click="$emit('sync')"
        />
        <FrappeButton
          v-else-if="doc.canSubmit"
          variant="solid"
          size="md"
          :label="t`Submit`"
          @click="$emit('submit')"
        />
      </template>
    </PageHeader>

    <div class="flex items-center justify-between gap-2 px-4 pt-3">
      <span class="text-sm text-ink-gray-5">{{ doc.schema.label }}</span>
      <StatusPill :doc="doc" />
    </div>

    <div
      v-if="tabOptions.length > 1"
      class="sticky top-0 z-10 mt-1 flex items-center overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-4 py-2 [scrollbar-width:none]"
    >
      <FrappeTabButtons
        :model-value="activeTab"
        :options="tabOptions"
        size="md"
        @update:model-value="(tab) => $emit('update:activeTab', String(tab))"
      >
        <template #suffix="{ button }">
          <span
            v-if="errorTabs.has(String(button.value))"
            class="size-1.5 rounded-full bg-surface-red-7"
            :aria-label="t`Has errors`"
          />
        </template>
      </FrappeTabButtons>
    </div>

    <FrappeAlert
      v-if="missingLabels"
      class="mx-4 mt-3"
      theme="red"
      :title="t`Value missing for ${missingLabels}`"
      :primary-action="{ label: t`Show`, onClick: () => showFirstError() }"
    />

    <MobileFormSection
      v-for="([section, fields], index) of activeSections"
      :key="activeTab + section"
      :title="section"
      :fields="fields"
      :doc="doc"
      :errors="errors"
      @value-change="(field, value) => $emit('value-change', field, value)"
      @row-change="
        (field, value, parentfield) =>
          $emit('row-change', field, value, parentfield)
      "
      @editrow="(row) => $emit('editrow', row)"
    >
      <!-- Currency follows the party and dates; scanning adds item rows. -->
      <template
        v-if="$slots['exchange-rate'] && index === 0 && isFirstTab"
        #end
      >
        <slot name="exchange-rate" />
      </template>
      <template v-if="$slots.barcode && hasItemsTable(fields)" #table>
        <slot name="barcode" />
      </template>
    </MobileFormSection>

    <div
      v-if="nextStep"
      class="sticky bottom-0 mt-auto flex gap-2 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
      <FrappeButton
        v-if="canPrint"
        size="lg"
        icon="lucide-printer"
        :label="t`Print`"
        @click="$emit('print')"
      />
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        :label="nextStep.nextStep"
        @click="run(nextStep)"
      />
    </div>
    <div v-else class="h-10 flex-none" />

    <FrappeBottomSheet v-model:open="showActions" :title="doc.formTitle">
      <div
        class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <template v-for="group in actionGroups" :key="group.key">
          <div v-if="group.divider" class="mx-3 my-1 h-px bg-outline-gray-1" />
          <div
            v-if="group.label"
            class="px-3 pb-1.5 pt-3 text-xs-medium text-ink-gray-5"
          >
            {{ group.label }}
          </div>
          <button
            v-for="action in group.actions"
            :key="action.label"
            class="flex h-[52px] items-center rounded-5 px-3 text-start text-lg active:bg-surface-gray-2"
            :class="
              action.theme === 'red' ? 'text-ink-red-4' : 'text-ink-gray-8'
            "
            @click="run(action)"
          >
            {{ action.label }}
          </button>
        </template>
      </div>
    </FrappeBottomSheet>
  </div>
</template>
<script setup lang="ts">
import {
  Alert as FrappeAlert,
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  TabButtons as FrappeTabButtons,
} from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import { Field } from 'schemas/types';
import PageHeader from 'src/components/PageHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import { hasFieldValue } from 'src/utils/doc';
import { UIGroupedFields } from 'src/utils/types';
import { getActionsForDoc } from 'src/utils/ui';
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileFormSection from './MobileFormSection.vue';

type SheetAction = Pick<Action, 'label' | 'group' | 'theme' | 'nextStep'> & {
  action: (doc: Doc, router: ReturnType<typeof useRouter>) => unknown;
};

const props = defineProps<{
  doc: Doc;
  title: string;
  groupedFields: UIGroupedFields | null;
  activeTab: string;
  errors: Record<string, string>;
  missingFields: Field[];
  canPrint: boolean;
  canShowLinks: boolean;
}>();

const emit = defineEmits<{
  'update:activeTab': [tab: string];
  'value-change': [field: Field, value: DocValue];
  'row-change': [field: Field, value: DocValue, parentfield: Field];
  editrow: [row: Doc];
  sync: [];
  submit: [];
  print: [];
  'show-links': [];
}>();

const router = useRouter();
const showActions = ref(false);

// A finished document hides empty fields, so tabs without values go too.
const tabOptions = computed(() => {
  const isFinished = props.doc.isSubmitted || props.doc.isCancelled;
  return [...(props.groupedFields ?? [])]
    .filter(
      ([, sections]) =>
        !isFinished ||
        [...sections.values()]
          .flat()
          .some((field) => hasFieldValue(props.doc, field))
    )
    .map(([tab]) => ({ value: tab, label: tab }));
});

const activeSections = computed(() => {
  const tab = props.groupedFields?.get(props.activeTab);
  return [...(tab ?? props.groupedFields?.values().next().value ?? new Map())];
});

const isFirstTab = computed(
  () => props.activeTab === (tabOptions.value[0]?.value ?? props.activeTab)
);

const unresolvedFields = computed(() =>
  props.missingFields.filter((field) => props.errors[field.fieldname])
);
const missingLabels = computed(() =>
  unresolvedFields.value.map((field) => field.label).join(', ')
);

const errorTabs = computed(() => {
  const tabs = new Set<string>();
  for (const [tab, sections] of props.groupedFields ?? []) {
    const fields = [...sections.values()].flat();
    if (fields.some((field) => props.errors[field.fieldname])) {
      tabs.add(tab);
    }
  }

  return tabs;
});

const actions = computed(() => getActionsForDoc(props.doc) as SheetAction[]);
const nextStep = computed(() => actions.value.find((a) => a.nextStep));

/** Print and links, then each action group, then destructive actions. */
const actionGroups = computed(() => {
  const view: SheetAction[] = [];
  if (props.canPrint) {
    view.push({ label: t`Print`, action: () => emit('print') });
  }

  if (props.canShowLinks) {
    view.push({ label: t`Linked Entries`, action: () => emit('show-links') });
  }

  const rest = actions.value.filter((action) => action !== nextStep.value);
  const labels = [...new Set(rest.map((a) => a.group ?? ''))].sort();
  const groups = [
    { key: 'view', label: '', divider: false, actions: view },
    ...labels.map((label) => ({
      key: `group-${label}`,
      label,
      divider: false,
      actions: rest.filter(
        (a) => (a.group ?? '') === label && a.theme !== 'red'
      ),
    })),
    {
      key: 'destructive',
      label: '',
      divider: true,
      actions: rest.filter((a) => a.theme === 'red'),
    },
  ];

  return groups.filter((group) => group.actions.length);
});

function hasItemsTable(fields: Field[]) {
  return fields.some((field) => field.fieldname === 'items');
}

function getTabOf(field: Field) {
  for (const [tab, sections] of props.groupedFields ?? []) {
    if ([...sections.values()].flat().includes(field)) {
      return tab;
    }
  }
}

async function showFirstError() {
  const [field] = unresolvedFields.value;
  const tab = field && getTabOf(field);
  if (!tab) {
    return;
  }

  emit('update:activeTab', tab);
  await nextTick();
  document
    .querySelector(`[data-fieldname="${field.fieldname}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function run(action: SheetAction) {
  showActions.value = false;
  await action.action(props.doc, router);
}

defineExpose({ showFirstError });
</script>
