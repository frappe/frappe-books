<template>
  <div class="flex min-h-0 flex-col">
    <div
      v-if="isMobile"
      class="flex shrink-0 flex-col gap-2.5 border-b border-outline-gray-1 px-4 py-3"
    >
      <!-- md is the largest TabButtons size (frappe/frappe-ui#1221). -->
      <FrappeTabButtons
        v-model="tab"
        class="self-start"
        size="md"
        :options="tabOptions"
      />
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
          class="w-32 shrink-0"
          size="lg"
          :options="filterOptions"
          :aria-label="t`Filter`"
        />
      </div>
      <div class="flex justify-between gap-2 text-sm text-ink-gray-5">
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
        <div class="flex border-b border-outline-gray-1">
          <FrappeTabButtons
            v-model="tab"
            class="-mb-px flex"
            variant="underline"
            :options="tabOptions"
          />
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2 px-5 py-3">
        <FrappeSelect
          v-if="tab === 'row'"
          v-model="table"
          class="w-64"
          :options="tableOptions"
          :aria-label="t`Table`"
        />
        <FrappeTextInput
          v-model="query"
          class="w-64"
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

    <!-- A list as Books' lists are: header, full dividers, rows mounted as they scroll in. -->
    <FrappeScrollArea
      v-if="isReady && rows.length"
      ref="scroller"
      class="min-h-0 flex-1"
      :viewport-class="isMobile ? '' : 'px-5'"
    >
      <FrappeList
        :columns="isMobile ? undefined : COLUMNS"
        :row-height="isMobile ? 56 : 48"
        divider="full"
        class="text-base list-gap-4"
        :class="isMobile ? 'list-row-px-4' : '-mx-3 list-row-px-3'"
      >
        <FrappeListHeader
          v-if="!isMobile"
          class="sticky top-0 z-10 bg-surface-base"
        >
          <FrappeListHeaderCell>
            <span class="sr-only">{{ t`Picked` }}</span>
          </FrappeListHeaderCell>
          <FrappeListHeaderCell>{{ t`Label` }}</FrappeListHeaderCell>
          <FrappeListHeaderCell>{{ t`Section` }}</FrappeListHeaderCell>
          <FrappeListHeaderCell>{{ t`Type` }}</FrappeListHeaderCell>
        </FrappeListHeader>
        <FrappeListRows :items="rows" row-key="key" virtual>
          <template #default="{ item: field }">
            <FieldPickerRow
              :field="field"
              :picked="picks.has(field.key)"
              @toggle="togglePick(schemaName, field.key)"
            />
          </template>
        </FrappeListRows>
      </FrappeList>
    </FrappeScrollArea>
    <div
      v-else-if="loaded?.status === 'loading'"
      :class="isMobile ? 'px-4' : 'px-5'"
      aria-busy="true"
    >
      <div
        v-for="row in 8"
        :key="row"
        class="flex h-12 items-center border-b border-outline-gray-1"
      >
        <Skeleton class="h-4 w-full" />
      </div>
    </div>
    <div
      v-else-if="loaded?.status === 'error'"
      :class="isMobile ? 'p-4' : 'max-w-2xl p-5'"
    >
      <FrappeAlert
        theme="red"
        :title="t`Couldn't load ${label} from ERPNext`"
        :description="errorMessage"
        :primary-action="{ label: t`Retry`, onClick: retry }"
      />
    </div>
    <EmptyState
      v-else-if="isReady"
      class="my-auto py-16"
      icon="lucide-search-x"
      :title="emptyTitle"
    >
      <FrappeButton
        v-if="query.trim()"
        :size="isMobile ? 'lg' : 'sm'"
        :label="t`Clear search`"
        @click="query = ''"
      />
    </EmptyState>
  </div>
</template>
<script setup lang="ts">
import {
  Alert as FrappeAlert,
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
  Select as FrappeSelect,
  TabButtons as FrappeTabButtons,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import Skeleton from 'src/components/Skeleton.vue';
import {
  List as FrappeList,
  ListHeader as FrappeListHeader,
  ListHeaderCell as FrappeListHeaderCell,
  ListRows as FrappeListRows,
} from 'frappe-ui/list';
import { t } from 'fyo';
import {
  getPickerFields,
  getPickerTables,
  type PickerField,
} from 'src/frappe/fieldPicks';
import EmptyState from 'src/components/EmptyState.vue';
import { isMobile } from 'src/utils/viewport';
import { computed, ref, useTemplateRef, watch } from 'vue';
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

const COLUMNS = ['2rem', 'minmax(0,1.3fr)', 'minmax(0,1fr)', '10rem'];

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
const tabOptions = computed(() => [
  { value: 'doc', label: t`Document fields` },
  { value: 'row', label: t`Row fields`, disabled: !canPickRows.value },
]);
const rows = computed(() => {
  const text = query.value.trim().toLowerCase();
  return fields.value
    .filter((field) => !text || field.label.toLowerCase().includes(text))
    .filter((field) => matchesFilter(field, filter.value));
});

const scroller =
  useTemplateRef<InstanceType<typeof FrappeScrollArea>>('scroller');

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
watch([tab, table, query, filter], () =>
  scroller.value?.viewportElement?.scrollTo(0, 0)
);
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
