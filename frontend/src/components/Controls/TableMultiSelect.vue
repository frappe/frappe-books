<template>
  <!-- Read as a comma list, as the filter pill names the picked records. -->
  <ReadOnlyValue
    v-if="isReadOnly"
    :df="df"
    :value="value"
    :display-value="pickedLabels"
    :doc="doc"
    :border="border"
    :show-label="showLabel"
    :required="isRequired"
    :size="size"
    :container-styles="containerStyles"
  />

  <div v-else-if="isMobile" class="min-w-0" :style="containerStyles">
    <MobileFieldTrigger
      :label="showLabel ? df.label : undefined"
      :description="showLabel ? df.sub_label : undefined"
      :required="isRequired"
      :placeholder="inputPlaceholder"
      :display-value="pickedLabels"
      :invalid="invalid"
      @click="openSheet"
    />
    <FrappeBottomSheet v-model:open="sheetOpen" :title="df.label">
      <div class="flex flex-col gap-3 px-4">
        <p class="text-end text-base text-ink-gray-5">
          {{ t`${picked.length} selected` }}
        </p>
        <FrappeTextInput
          type="search"
          size="lg"
          variant="subtle"
          :model-value="query"
          :placeholder="searchPlaceholder"
          @update:model-value="search"
        >
          <template #prefix>
            <span
              class="lucide-search size-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </FrappeTextInput>
        <div role="group" :aria-label="df.label" class="-mx-2 flex flex-col">
          <FrappeCheckbox
            v-for="option in options"
            :key="option.value"
            class="h-10"
            padded
            :label="option.label"
            :model-value="picked.includes(option.value)"
            @update:model-value="toggle(option.value)"
          />
          <p
            v-if="!options.length && !loading"
            class="py-6 text-center text-p-sm text-ink-gray-4"
          >
            {{ t`No results found` }}
          </p>
        </div>
        <MobileSheetFooter class="*:flex-1">
          <FrappeButton
            variant="solid"
            size="lg"
            :label="t`Done`"
            @click="sheetOpen = false"
          />
        </MobileSheetFooter>
      </div>
    </FrappeBottomSheet>
  </div>

  <FrappeMultiSelect
    v-else
    :model-value="picked"
    :options="options"
    :filterable="false"
    :loading="loading"
    :placeholder="searchPlaceholder"
    :label="showLabel ? df.label : undefined"
    :description="showLabel ? df.sub_label : undefined"
    :required="isRequired"
    :size="frappeSize"
    :class="controlClasses"
    :style="containerStyles"
    @update:model-value="setPicked"
    @update:open="(open: boolean) => open && search('')"
    @update:query="search"
  >
    <!-- Select All would pick a page of search results. -->
    <template #footer />
    <!-- The default trigger shows "N selected"; the picked records show as tags that wrap. -->
    <template #trigger="{ open, setOpen }">
      <!-- A report filter's pill names the picked records in a comma list, as other filter pills do. -->
      <FrappeButton
        v-if="inlineLabel"
        ref="trigger"
        variant="outline"
        size="sm"
        class="max-w-80"
        role="combobox"
        :class="triggerClass"
        :aria-label="df.label"
        :aria-expanded="open"
      >
        <span class="me-2 text-ink-gray-5">{{ df.label }}</span>
        <span class="truncate">{{ pickedLabels || inputPlaceholder }}</span>
        <span
          v-if="showsRequiredMark"
          class="ms-1 text-ink-red-5"
          aria-hidden="true"
          >*</span
        >
        <template #suffix>
          <span
            class="lucide-chevron-down size-4 text-ink-gray-5 transition-transform duration-200"
            :class="open ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </template>
      </FrappeButton>
      <div
        v-else
        ref="trigger"
        role="combobox"
        tabindex="0"
        data-slot="trigger"
        :aria-expanded="open"
        :aria-label="df.label"
        class="flex min-h-8 w-full cursor-pointer flex-wrap items-center gap-1 rounded-4 border py-1 pe-2.5 ps-1 text-base outline-none focus-visible:focus-ring"
        :class="[triggerClass, { 'focus-ring': open }]"
        @keydown.enter.prevent="setOpen(true)"
        @keydown.space.prevent="setOpen(true)"
      >
        <FrappeBadge
          v-for="name in picked"
          :key="name"
          variant="outline"
          :label="getLabel(name)"
        >
          <template #suffix>
            <button
              type="button"
              class="lucide-x size-3 text-ink-gray-5 hover:text-ink-gray-8"
              :aria-label="t`Remove ${getLabel(name)}`"
              @pointerdown.stop
              @click.stop="toggle(name)"
            />
          </template>
        </FrappeBadge>
        <span v-if="!picked.length" class="px-1.5 text-ink-gray-4">
          {{ inputPlaceholder }}
        </span>
        <span
          class="lucide-chevron-down ms-auto size-4 shrink-0 text-ink-gray-4"
          aria-hidden="true"
        />
      </div>
    </template>
  </FrappeMultiSelect>
</template>

<script lang="ts">
import {
  Badge as FrappeBadge,
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  Checkbox as FrappeCheckbox,
  MultiSelect as FrappeMultiSelect,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import type { Field, TargetField } from 'schemas/types';
import type { FrappeDoc } from 'src/frappe/document';
import { searchFrappeLink } from 'src/frappe/link';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import { getSchema } from 'src/frappe/registry';
import MobileSheetFooter from 'src/mobile/MobileSheetFooter.vue';
import { LINK_PAGE_LENGTH } from 'src/utils';
import { defineComponent } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

type Option = { label: string; value: string };

/** A Table MultiSelect field: rows of a child doctype that each hold one link, picked as a set. */
export default defineComponent({
  name: 'TableMultiSelect',
  components: {
    FrappeBadge,
    FrappeBottomSheet,
    FrappeButton,
    FrappeCheckbox,
    FrappeMultiSelect,
    FrappeTextInput,
    MobileFieldTrigger,
    MobileSheetFooter,
    ReadOnlyValue,
  },
  extends: Base,
  data() {
    return {
      sheetOpen: false,
      query: '',
      loading: false,
      results: [] as Option[],
      /** Labels of records seen in searches, by name. */
      labels: {} as Record<string, string>,
      searches: 0,
    };
  },
  computed: {
    /** The row's Link, which holds each picked record. */
    linkField(): TargetField | undefined {
      return getSchema((this.df as TargetField).target)?.fields.find(
        (field: Field) => field.fieldtype === 'Link'
      ) as TargetField | undefined;
    },
    pickedLabels(): string {
      return this.picked.map((name) => this.getLabel(name)).join(', ');
    },
    linkLabel(): string {
      return this.linkField?.label ?? this.df.label;
    },
    rows(): FrappeDoc[] {
      return Array.isArray(this.value) ? (this.value as FrappeDoc[]) : [];
    },
    picked(): string[] {
      const fieldname = this.linkField?.fieldname ?? '';
      return this.rows
        .map((row) => row[fieldname] as string | undefined)
        .filter((name): name is string => !!name);
    },
    /** Picked records first, so they stay checked whatever the search finds. */
    options(): Option[] {
      const picked = this.picked.map((name) => ({
        label: this.getLabel(name),
        value: name,
      }));
      return [
        ...picked,
        ...this.results.filter(({ value }) => !this.picked.includes(value)),
      ];
    },
    /** The placeholder of the search inside the menu; the trigger has its own. */
    searchPlaceholder(): string {
      return this.t`Search ${this.linkLabel}...`;
    },
    inputPlaceholder(): string {
      return this.placeholder || this.t`Select ${this.linkLabel}`;
    },
    triggerClass(): string {
      if (this.invalid || this.showMandatory) {
        return 'border-outline-red-3 bg-surface-base';
      }

      return 'border-outline-gray-2 bg-surface-base hover:border-outline-gray-3';
    },
  },
  methods: {
    focus() {
      const trigger = this.$refs.trigger as
        | HTMLElement
        | { $el: HTMLElement }
        | undefined;
      (trigger && '$el' in trigger ? trigger.$el : trigger)?.focus();
    },
    getLabel(name: string): string {
      return this.labels[name] ?? name;
    },
    openSheet() {
      this.sheetOpen = true;
      void this.search('');
    },
    async search(text: string) {
      const target = this.linkField?.target;
      if (!target) {
        return;
      }

      // Only the latest search shows, whichever answers last.
      const search = ++this.searches;
      this.query = text;
      this.loading = true;
      const options = await searchFrappeLink(
        target,
        text,
        this.linkField?.linkFilters ?? null,
        LINK_PAGE_LENGTH
      );
      if (search !== this.searches) {
        return;
      }

      this.loading = false;
      this.results = options.map(({ label, value }) => ({ label, value }));
      for (const { label, value } of options) {
        this.labels[value] = label;
      }
    },
    toggle(name: string) {
      const picked = this.picked.includes(name)
        ? this.picked.filter((value) => value !== name)
        : [...this.picked, name];
      void this.setPicked(picked);
    },
    /** Removes the rows of records no longer picked and adds a row for each new one. */
    async setPicked(names: (string | number)[]) {
      const doc = this.doc;
      const fieldname = this.linkField?.fieldname;
      if (!doc || !fieldname) {
        return;
      }

      const tableField = this.df.fieldname;
      const removed = this.picked.filter((name) => !names.includes(name));
      const added = names.map(String).filter((n) => !this.picked.includes(n));
      for (const name of removed) {
        const rows = doc.get(tableField) as FrappeDoc[];
        const row = rows.find((row) => row[fieldname] === name);
        await doc.remove(tableField, row!.idx as number);
      }
      for (const name of added) {
        await doc.append(tableField, { [fieldname]: name });
      }
      this.triggerChange(doc.get(tableField));
    },
  },
});
</script>
