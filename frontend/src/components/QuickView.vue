<template>
  <div class="w-72 font-sans">
    <header class="border-b border-outline-gray-1 px-3 py-2.5">
      <p
        v-if="schema?.naming !== 'random' && !schema?.isChild"
        class="truncate text-base-medium text-ink-gray-8"
        :title="name"
      >
        {{ name }}
      </p>
      <p class="mt-0.5 truncate text-sm text-ink-gray-5">
        {{ schema?.label ?? '' }}
      </p>
    </header>

    <div v-if="isLoading" class="flex justify-center px-3 py-4">
      <FrappeSpinner size="sm" class="text-ink-gray-5" />
    </div>

    <dl
      v-else-if="values.length"
      class="max-h-64 overflow-y-auto py-1"
    >
      <div
        v-for="v of values"
        :key="v.label"
        class="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-baseline gap-3 px-3 py-1.5"
      >
        <dt class="truncate text-sm text-ink-gray-5" :title="v.label">
          {{ v.label }}
        </dt>
        <dd class="truncate text-sm text-ink-gray-8" :title="v.value">
          {{ v.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
<script lang="ts">
import { isFalsy } from 'fyo/utils';
import { Spinner as FrappeSpinner } from 'frappe-ui';
import { Field, Schema } from 'schemas/types';
import { getFrappeRows } from 'src/frappe/list';
import { getQuickViewFields, getSchema } from 'src/frappe/registry';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'QuickView',
  components: { FrappeSpinner },
  props: {
    schemaName: { type: String, required: true },
    name: { type: String, required: true },
  },
  data() {
    return {
      isLoading: true,
      valueRequest: 0,
      values: [],
    } as {
      isLoading: boolean;
      valueRequest: number;
      values: { label: string; value: string }[];
    };
  },
  computed: {
    schema(): Schema | undefined {
      return getSchema(this.schemaName);
    },
    fields(): Field[] {
      return getQuickViewFields(this.schemaName);
    },
  },
  watch: {
    async name(v1, v2) {
      if (v1 === v2) {
        return;
      }

      await this.setValues();
    },
  },
  async mounted() {
    await this.setValues();
  },
  methods: {
    async setValues() {
      const request = ++this.valueRequest;
      this.isLoading = true;
      try {
        const [data] = await getFrappeRows(this.fyo, this.schemaName, [
          this.name,
        ]);
        if (request !== this.valueRequest) {
          return;
        }

        this.values = data ? this.getValues(data) : [];
      } finally {
        if (request === this.valueRequest) {
          this.isLoading = false;
        }
      }
    },
    getValues(data: Record<string, unknown>) {
      return this.fields
        .filter((f) => !isFalsy(data[f.fieldname]))
        .map((f) => ({
          value: this.fyo.format(data[f.fieldname], f),
          label: f.label,
        }))
        .filter((i) => !!i.value);
    },
  },
});
</script>
