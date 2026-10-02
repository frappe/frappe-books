<template>
  <div class="flex flex-1 flex-col bg-surface-base">
    <PageHeader :title="title">
      <template v-if="menuOptions.length" #mobile>
        <FrappeDropdown :options="menuOptions" align="end">
          <FrappeButton
            variant="ghost"
            size="md"
            icon="lucide-ellipsis"
            :label="t`More actions`"
          />
        </FrappeDropdown>
      </template>
    </PageHeader>

    <div class="flex items-center justify-between gap-2 px-4 pt-3">
      <span class="text-sm text-ink-gray-5">{{ doc.schema.label }}</span>
      <StatusPill :doc="doc" />
    </div>

    <div
      v-if="tabOptions.length > 1"
      ref="tabBar"
      class="sticky top-0 z-10 mt-1 flex items-center overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-4 py-2 [scrollbar-width:none]"
    >
      <!-- md is the largest TabButtons size (frappe/frappe-ui#1221). -->
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

    <div class="h-10 flex-none" />
    <MobileFooter v-if="canPrint || doc.canSave || doc.canSubmit || footerStep">
      <FrappeButton
        v-if="canPrint"
        class="flex-1"
        size="lg"
        icon-left="lucide-printer"
        :label="t`Print`"
        @click="$emit('print')"
      />
      <FrappeButton
        v-if="doc.canSave"
        class="flex-1"
        size="lg"
        variant="solid"
        :label="t`Save`"
        :disabled="doc.isSyncing"
        @click="$emit('sync')"
      />
      <FrappeButton
        v-else-if="doc.canSubmit"
        class="flex-1"
        size="lg"
        variant="solid"
        :label="t`Submit`"
        @click="$emit('submit')"
      />
      <FrappeButton
        v-else-if="footerStep"
        class="flex-1"
        size="lg"
        variant="solid"
        :label="footerStep.nextStep!(doc)"
        @click="run(footerStep)"
      />
    </MobileFooter>
  </div>
</template>
<script setup lang="ts">
import {
  Alert as FrappeAlert,
  Button as FrappeButton,
  Dropdown as FrappeDropdown,
  TabButtons as FrappeTabButtons,
  type DropdownOptions,
} from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { Field } from 'schemas/types';
import PageHeader from 'src/components/PageHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import { revealActiveTab } from 'src/mobile/revealActiveTab';
import { hasFieldValue } from 'src/utils/doc';
import { UIGroupedFields } from 'src/utils/types';
import { getActionsForDoc } from 'src/utils/ui';
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import MobileFormSection from './MobileFormSection.vue';

type FormAction = Pick<Action, 'label' | 'group' | 'theme' | 'nextStep'> & {
  action: (doc: FrappeDoc, router: ReturnType<typeof useRouter>) => unknown;
};

const props = defineProps<{
  doc: FrappeDoc;
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
  editrow: [row: FrappeDoc];
  sync: [];
  submit: [];
  print: [];
  'show-links': [];
}>();

const router = useRouter();

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

const tabBar = useTemplateRef<HTMLElement>('tabBar');
watch(
  () => props.activeTab,
  async () => {
    await nextTick();
    revealActiveTab(tabBar.value);
  }
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

const actions = computed(() => getActionsForDoc(props.doc) as FormAction[]);

/** The next step runs from the footer unless saving or submitting comes first. */
const footerStep = computed(() =>
  props.doc.canSave || props.doc.canSubmit
    ? undefined
    : actions.value.find((action) => action.nextStep)
);

/** Linked entries, then each action group, then destructive actions. */
const menuOptions = computed<DropdownOptions>(() => {
  const rest = actions.value.filter((action) => action !== footerStep.value);
  const labels = [...new Set(rest.map((a) => a.group ?? ''))].sort();
  const links: FormAction[] = props.canShowLinks
    ? [{ label: t`Linked Entries`, action: () => emit('show-links') }]
    : [];
  const groups = [
    { label: '', actions: links },
    ...labels.map((label) => ({
      label,
      actions: rest.filter(
        (a) => (a.group ?? '') === label && a.theme !== 'red'
      ),
    })),
    { label: '', actions: rest.filter((a) => a.theme === 'red') },
  ];

  return groups
    .filter((group) => group.actions.length)
    .map((group, index) => ({
      key: index,
      group: group.label,
      hideLabel: !group.label,
      options: group.actions.map((action) => ({
        label: action.label,
        theme: action.theme,
        onClick: () => run(action),
      })),
    }));
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

async function run(action: FormAction) {
  await action.action(props.doc, router);
}

defineExpose({ showFirstError });
</script>
