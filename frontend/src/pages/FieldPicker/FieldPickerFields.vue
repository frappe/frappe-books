<template>
  <div class="flex min-h-0 flex-col">
    <div
      v-if="isMobile"
      class="flex shrink-0 flex-col gap-2.5 border-b border-outline-gray-1 px-4 py-3"
    >
      <FrappeTabs v-model="tab">
        <FrappeTabList
          variant="subtle"
          size="md"
          class="grid w-full grid-cols-2 self-stretch"
        >
          <FrappeTabTrigger value="doc" :label="t`Document fields`" />
          <FrappeTabTrigger
            value="row"
            :label="t`Row fields`"
            :disabled="!canPickRows"
          />
        </FrappeTabList>
      </FrappeTabs>
      <FrappeSelect
        v-if="tab === 'row'"
        v-model="table"
        size="lg"
        :options="tableOptions"
        :aria-label="t`Table`"
      />
      <div class="flex gap-2">
        <FrappeTextInput
          v-model="query"
          class="min-w-0 flex-1"
          size="lg"
          :placeholder="t`Search by label…`"
          :aria-label="t`Search by label`"
        >
          <template #prefix>
            <span
              class="lucide-search size-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FrappeTextInput>
        <FrappeSelect
          v-model="filter"
          class="w-[132px] shrink-0"
          size="lg"
          :options="filterOptions"
          :aria-label="t`Filter`"
        />
      </div>
      <div class="flex justify-between gap-2 text-xs text-ink-gray-5">
        <span>{{ hint }}</span>
        <span class="whitespace-nowrap">{{ summary }}</span>
      </div>
    </div>
    <template v-else>
      <div class="flex shrink-0 flex-col gap-3 px-5 pt-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg-semibold text-ink-gray-9">{{ label }}</h2>
          <p class="text-base text-ink-gray-5">{{ hint }}</p>
        </div>
        <FrappeTabs v-model="tab">
          <FrappeTabList>
            <FrappeTabTrigger value="doc" :label="t`Document fields`">
              <template v-if="isReady" #suffix="{ active }">
                <FrappeBadge
                  size="sm"
                  theme="gray"
                  :variant="active ? 'solid' : 'subtle'"
                  :label="String(docFieldCount)"
                />
              </template>
            </FrappeTabTrigger>
            <FrappeTabTrigger
              value="row"
              :label="t`Row fields`"
              :disabled="!canPickRows"
            />
          </FrappeTabList>
        </FrappeTabs>
      </div>
      <div class="flex shrink-0 items-center gap-2 px-5 py-3">
        <FrappeSelect
          v-if="tab === 'row'"
          v-model="table"
          class="w-[260px]"
          :options="tableOptions"
          :aria-label="t`Table`"
        />
        <FrappeTextInput
          v-model="query"
          class="w-[260px]"
          :placeholder="t`Search by label…`"
          :aria-label="t`Search by label`"
        >
          <template #prefix>
            <span
              class="lucide-search size-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FrappeTextInput>
        <FrappeSelect
          v-model="filter"
          class="w-40"
          :options="filterOptions"
          :aria-label="t`Filter`"
        />
        <span class="ms-auto whitespace-nowrap text-base text-ink-gray-5">{{
          summary
        }}</span>
      </div>
    </template>

    <div
      v-if="isReady && rows.length"
      v-bind="containerProps"
      class="min-h-0 flex-1"
      :class="isMobile ? '' : 'border-t border-outline-gray-1'"
    >
      <div
        v-if="!isMobile"
        class="sticky top-0 z-[1] grid h-8 grid-cols-[36px_minmax(0,1.3fr)_minmax(0,1fr)_150px] items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-xs-medium text-ink-gray-5"
      >
        <span />
        <span>{{ t`Label` }}</span>
        <span>{{ t`Section` }}</span>
        <span>{{ t`Type` }}</span>
      </div>
      <div v-bind="wrapperProps" role="group" :aria-label="label">
        <FieldPickerRow
          v-for="{ data: field } in list"
          :key="field.key"
          :field="field"
          :picked="picks.has(field.key)"
          @toggle="togglePick(schemaName, field.key)"
        />
      </div>
    </div>
    <div
      v-else
      class="min-h-0 flex-1 overflow-y-auto"
      :class="isMobile ? '' : 'border-t border-outline-gray-1'"
    >
      <div
        v-if="loaded?.status === 'loading'"
        class="flex items-center justify-center gap-2 px-5 text-base text-ink-gray-5"
        :class="isMobile ? 'py-[72px]' : 'py-24'"
      >
        <FrappeSpinner class="size-4" />
        <span>{{ t`Loading fields from ERPNext…` }}</span>
      </div>
      <div
        v-else-if="loaded?.status === 'error'"
        :class="isMobile ? 'p-4' : 'max-w-[640px] p-5'"
      >
        <FrappeAlert
          theme="red"
          :title="t`Couldn't load ${label} from ERPNext`"
          :description="errorMessage"
          :primary-action="{ label: t`Retry`, onClick: retry }"
        />
      </div>
      <div
        v-else-if="isReady"
        class="flex flex-col items-center gap-3 text-center"
        :class="isMobile ? 'px-6 py-[72px]' : 'px-5 py-24'"
      >
        <p
          :class="isMobile ? 'text-md-medium' : 'text-base-medium'"
          class="text-ink-gray-8"
        >
          {{ emptyTitle }}
        </p>
        <FrappeButton
          v-if="query.trim()"
          variant="subtle"
          :size="isMobile ? 'lg' : 'sm'"
          :label="t`Clear search`"
          @click="query = ''"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useVirtualList } from '@vueuse/core';
import {
  Alert as FrappeAlert,
  Badge as FrappeBadge,
  Button as FrappeButton,
  Select as FrappeSelect,
  Spinner as FrappeSpinner,
  TabList as FrappeTabList,
  TabTrigger as FrappeTabTrigger,
  Tabs as FrappeTabs,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { t } from 'fyo';
import {
  getPickerFields,
  getPickerTables,
  type PickerField,
} from 'src/frappe/fieldPicks';
import { isMobile } from 'src/utils/viewport';
import { computed, ref, watch } from 'vue';
import FieldPickerRow from './FieldPickerRow.vue';
import {
  getFailureText,
  getLoaded,
  getPickerLabel,
  getPicks,
  loadFields,
  togglePick,
} from './fieldPicker';

type Filter = 'all' | 'shown' | 'hidden';

/** A form's ERPNext fields to pick, the document's or a table's rows', with search and a filter. */
const props = defineProps<{ schemaName: string }>();

const tab = ref<'doc' | 'row'>('doc');
const table = ref('');
const query = ref('');
const filter = ref<Filter>('all');

const label = computed(() => getPickerLabel(props.schemaName));
const loaded = computed(() => getLoaded(props.schemaName));
const docType = computed(() =>
  loaded.value?.status === 'ready' ? loaded.value.docType : undefined
);
const isReady = computed(() => !!docType.value);
const picks = computed(() => getPicks(props.schemaName));
const tables = computed(() =>
  docType.value ? getPickerTables(docType.value, picks.value) : []
);
// A form without tables, e.g. a Supplier, has no row fields to pick.
const canPickRows = computed(() => !isReady.value || !!tables.value.length);
const tableOptions = computed(() =>
  tables.value.map(({ fieldname, label, doctype }) => ({
    label: `${label} (${doctype})`,
    value: fieldname,
  }))
);

const fields = computed(() => {
  if (!docType.value) {
    return [];
  }

  return getPickerFields(docType.value, tab.value === 'row' ? table.value : '');
});
const docFieldCount = computed(() =>
  docType.value ? getPickerFields(docType.value).length : 0
);
const rows = computed(() => {
  const text = query.value.trim().toLowerCase();
  return fields.value
    .filter((field) => !text || field.label.toLowerCase().includes(text))
    .filter((field) => matchesFilter(field, filter.value));
});

const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(rows, {
  itemHeight: () => (isMobile.value ? 56 : 36),
  overscan: 10,
});

const hint = computed(() => {
  if (isMobile.value) {
    return tab.value === 'doc'
      ? t`Shown in More details`
      : t`Shown in the row editor`;
  }

  return tab.value === 'doc'
    ? t`Picked fields appear in the form's More details section, in ERPNext's order`
    : t`Picked row fields appear in the row editor, in ERPNext's order`;
});
const summary = computed(() => {
  if (!isReady.value) {
    return '';
  }

  const picked = fields.value.filter(
    (field) => !field.lock && picks.value.has(field.key)
  ).length;
  return t`${picked} picked · ${fields.value.length} fields`;
});
const filterOptions = computed(() => [
  { label: isMobile.value ? t`All` : t`All fields`, value: 'all' },
  { label: isMobile.value ? t`Shown` : t`Shown on form`, value: 'shown' },
  { label: t`Not shown`, value: 'hidden' },
]);
const emptyTitle = computed(() => {
  const text = query.value.trim();
  return text ? t`No fields match “${text}”` : t`No fields match this filter`;
});
const errorMessage = computed(() =>
  loaded.value?.status === 'error' ? getFailureText(loaded.value.error) : ''
);

watch(tab, () => (query.value = ''));
// The row tab opens on the first table; a table that leaves, e.g. unpicked, gives way to it.
watch(
  tables,
  (shown) => {
    if (!shown.some(({ fieldname }) => fieldname === table.value)) {
      table.value = shown[0]?.fieldname ?? '';
    }
  },
  { immediate: true }
);
watch([tab, table, query, filter], () => scrollTo(0));
void loadFields(props.schemaName);

function matchesFilter(field: PickerField, shown: Filter): boolean {
  if (shown === 'all') {
    return true;
  }

  const isShown = !!field.lock || picks.value.has(field.key);
  return shown === 'shown' ? isShown : !isShown;
}

async function retry() {
  await loadFields(props.schemaName, true);
}
</script>
