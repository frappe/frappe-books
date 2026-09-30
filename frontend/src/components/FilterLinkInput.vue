<template>
  <FrappeCombobox
    :model-value="value || null"
    :options="options"
    :loading="loading"
    :filterable="false"
    :placeholder="t`Select a value`"
    :empty-text="error || t`No results found`"
    :error="error || undefined"
    @update:open="(open) => onOpen(Boolean(open))"
    @input="onInput"
    @update:model-value="(value) => $emit('change', value ?? '')"
  />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { t } from 'fyo';
import { Combobox as FrappeCombobox } from 'frappe-ui';
import { isFrappeBacked } from 'src/frappe/doctypes';
import { getLinkLabels, searchFrappeLink } from 'src/frappe/link';
import { fyo } from 'src/initFyo';
import { LINK_PAGE_LENGTH } from 'src/utils';

type Option = { label: string; value: string; description?: string };

export default defineComponent({
  components: { FrappeCombobox },
  props: {
    target: { type: String, required: true },
    value: { type: String, default: '' },
  },
  emits: ['change'],
  data() {
    return {
      records: [] as Option[],
      search: '',
      loading: false,
      error: '',
      request: 0,
    };
  },
  computed: {
    options(): Option[] {
      const options = [...this.records];
      if (
        this.value &&
        !this.search &&
        !options.some((option) => option.value === this.value)
      )
        options.unshift({ label: this.value, value: this.value });
      return options;
    },
  },
  methods: {
    async onInput(event: Event) {
      this.search = (event.target as HTMLInputElement).value;
      if (!this.search) this.$emit('change', '');
      await this.loadRecords();
    },
    async onOpen(open: boolean) {
      this.search = '';
      if (open) await this.loadRecords();
    },
    /** Loads a page of the records Frappe's link search finds for the typed text. */
    async loadRecords() {
      const request = ++this.request;
      this.loading = true;
      this.error = '';
      try {
        const records = await this.searchRecords();
        if (request !== this.request) return;
        this.records = records;
      } catch {
        if (request === this.request) this.error = t`Unable to load options`;
      } finally {
        if (request === this.request) this.loading = false;
      }
    },
    async searchRecords(): Promise<Option[]> {
      if (isFrappeBacked(this.target)) {
        const options = await searchFrappeLink(
          this.target,
          this.search,
          null,
          LINK_PAGE_LENGTH
        );
        const labels = await getLinkLabels(
          this.target,
          options.map(({ value }) => value)
        );
        return options.map(({ label, value }) => {
          const shown = labels[value] || label;
          return {
            label: shown,
            value,
            description: shown !== value ? value : undefined,
          };
        });
      }

      const schema = fyo.schemaMap[this.target];
      const title = schema?.linkDisplayField || schema?.titleField || 'name';
      const rows = await fyo.db.searchLink(
        this.target,
        this.search,
        null,
        [...new Set(['name', title])],
        LINK_PAGE_LENGTH
      );
      return rows.map((row) => ({
        label: String(row[title] || row.name),
        value: String(row.name),
        description:
          row[title] && row[title] !== row.name ? String(row.name) : undefined,
      }));
    },
  },
});
</script>
