<template>
  <div class="flex h-full flex-col">
    <PageHeader :title="title">
      <FieldPickerActions v-if="selected" :schema-name="selected" />
      <template v-if="selected" #mobile-prefix>
        <FrappePageHeaderBackButton
          class="rtl-rotate-180"
          :label="t`Back`"
          fallback-route="/customize-form"
        />
      </template>
      <template #mobile-title>
        <span class="block truncate">{{ title }}</span>
      </template>
      <template v-if="selected" #mobile>
        <FieldPickerActions :schema-name="selected" />
      </template>
    </PageHeader>

    <!-- Phones list the document types on a page of their own. -->
    <nav
      v-if="isMobile && !selected"
      class="pb-4 pt-2"
      :aria-label="t`Document types`"
    >
      <section v-for="group in groups" :key="group.label">
        <h2 class="px-4 pb-1.5 pt-4 text-xs-medium text-ink-gray-5">
          {{ group.label }}
        </h2>
        <RouterLink
          v-for="name in group.schemaNames"
          :key="name"
          :to="getLocation(name)"
          class="flex min-h-12 items-center gap-2 border-b border-outline-gray-1 px-4 active:bg-surface-gray-2"
        >
          <span class="flex-1 text-md text-ink-gray-8">
            {{ getPickerLabel(name) }}
          </span>
          <span v-if="getPickCount(name)" class="text-sm text-ink-gray-5">
            {{ t`${getPickCount(name)} picked` }}
          </span>
          <span
            class="lucide-chevron-right size-4 text-ink-gray-5 rtl-rotate-180"
            aria-hidden="true"
          />
        </RouterLink>
      </section>
    </nav>
    <FieldPickerFields
      v-else-if="isMobile"
      :key="selected"
      class="min-h-0 flex-1"
      :schema-name="selected!"
    />
    <div v-else class="flex min-h-0 flex-1">
      <nav
        class="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-e border-outline-gray-1 px-2 py-3"
        :aria-label="t`Document types`"
      >
        <div
          v-for="group in groups"
          :key="group.label"
          class="flex flex-col gap-0.5"
        >
          <FrappeSidebarLabel>{{ group.label }}</FrappeSidebarLabel>
          <FrappeSidebarItem
            v-for="name in group.schemaNames"
            :key="name"
            :label="getPickerLabel(name)"
            :suffix="
              getPickCount(name) ? String(getPickCount(name)) : undefined
            "
            :active="name === selected"
            :route="getLocation(name)"
            replace
          />
        </div>
      </nav>
      <FieldPickerFields
        v-if="selected"
        :key="selected"
        class="min-w-0 flex-1"
        :schema-name="selected"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  PageHeaderBackButton as FrappePageHeaderBackButton,
  SidebarItem as FrappeSidebarItem,
  SidebarLabel as FrappeSidebarLabel,
} from 'frappe-ui';
import { t } from 'fyo';
import PageHeader from 'src/components/PageHeader.vue';
import { toSchemaName } from 'src/frappe/registry';
import { isMobile } from 'src/utils/viewport';
import { computed } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import FieldPickerActions from './FieldPickerActions.vue';
import FieldPickerFields from './FieldPickerFields.vue';
import { getPickCount, getPickerGroups, getPickerLabel } from './fieldPicker';

// Desktop opens on the busiest form; phones on the list of document types.
const DEFAULT_SCHEMA_NAME = 'SalesInvoice';

/**
 * Customize Form in accessory mode: which ERPNext fields each form shows
 * besides Books' own, in More details and in the row editor.
 */
const route = useRoute();
const groups = getPickerGroups();
const schemaNames = groups.flatMap((group) => group.schemaNames);

const selected = computed(() => {
  const doctype = route.query.doctype;
  const named = typeof doctype === 'string' ? toSchemaName(doctype) : '';
  if (named && schemaNames.includes(named)) {
    return named;
  }

  if (isMobile.value) {
    return undefined;
  }

  return schemaNames.includes(DEFAULT_SCHEMA_NAME)
    ? DEFAULT_SCHEMA_NAME
    : schemaNames[0];
});
const title = computed(() =>
  isMobile.value && selected.value
    ? getPickerLabel(selected.value)
    : t`Customize Form`
);

function getLocation(schemaName: string): RouteLocationRaw {
  return { path: route.path, query: { doctype: getPickerLabel(schemaName) } };
}
</script>
