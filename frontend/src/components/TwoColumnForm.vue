<template>
  <div v-if="isMobile" class="flex flex-col gap-4 p-4">
    <template v-for="df in formFields" :key="df.fieldname">
      <Table
        v-if="df.fieldtype === 'Table'"
        ref="controls"
        :df="df"
        :show-label="true"
        :value="(doc[df.fieldname] ?? []) as unknown[]"
        @change="
          async (value: FrappeDoc[] | DocValueMap[]) => await onChange(df, value)
        "
      />
      <div v-else class="min-w-0">
        <FormControl
          ref="controls"
          class="w-full"
          :df="df"
          :value="doc[df.fieldname]"
          :show-label="true"
          :border="true"
          @change="async (value: DocValue) => await onChange(df, value)"
        />
        <FrappeErrorMessage
          class="mt-1.5 break-words"
          :message="errors[df.fieldname]"
        />
      </div>
    </template>
  </div>
  <div v-else class="text-base">
    <template v-for="df in formFields">
      <!-- Table Field Form (Eg: PaymentFor) -->
      <Table
        v-if="df.fieldtype === 'Table'"
        :key="`${df.fieldname}-table`"
        ref="controls"
        size="small"
        :df="df"
        :value="(doc[df.fieldname] ?? []) as unknown[]"
        @change="
          async (value: FrappeDoc[] | DocValueMap[]) => await onChange(df, value)
        "
      />

      <!-- Regular Field Form -->
      <div
        v-else
        :key="`${df.fieldname}-regular`"
        class="grid min-h-14 items-start gap-x-3 border-b border-outline-gray-1 px-3 py-3"
        :style="style"
      >
        <div class="flex min-h-8 min-w-0 items-center break-words text-ink-gray-6">
          {{ df.label }}
        </div>

        <div class="min-w-0">
          <FormControl
            ref="controls"
            class="w-full"
            :df="df"
            :value="doc[df.fieldname]"
            :text-right="false"
            @change="async (value: DocValue) => await onChange(df, value)"
          />
          <FrappeErrorMessage
            class="mt-2 break-words"
            :message="errors[df.fieldname]"
          />
        </div>
      </div>
    </template>
  </div>
</template>
<script lang="ts">
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import type { FrappeDoc } from 'src/frappe/document';
import FormControl from 'src/components/Controls/FormControl.vue';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { isMobile } from 'src/utils/viewport';
import Table from './Controls/Table.vue';
import { defineComponent } from 'vue';
import { Field } from 'schemas/types';
import { PropType } from 'vue';
import { DocValue, DocValueMap } from 'fyo/core/types';

export default defineComponent({
  name: 'TwoColumnForm',
  components: {
    FrappeErrorMessage,
    FormControl,
    Table,
  },
  props: {
    doc: { type: Object as PropType<FrappeDoc>, required: true },
    fields: { type: Array as PropType<Field[]>, default: () => [] },
    columnRatio: {
      type: Array as PropType<number[]>,
      default: () => [1, 1],
    },
  },
  setup() {
    return { isMobile };
  },
  data() {
    return {
      formFields: [],
      errors: {},
    } as { formFields: Field[]; errors: Record<string, string> };
  },
  computed: {
    style() {
      let templateColumns = (this.columnRatio || [1, 1])
        .map((r) => `minmax(0, ${r}fr)`)
        .join(' ');
      return {
        'grid-template-columns': templateColumns,
      };
    },
  },
  watch: {
    doc() {
      this.setFormFields();
    },
  },
  mounted() {
    this.setFormFields();
  },
  methods: {
    async onChange(field: Field, value: DocValue | FrappeDoc[] | DocValueMap[]) {
      const { fieldname } = field;
      delete this.errors[fieldname];

      let isSet = false;
      try {
        isSet = await this.doc.set(fieldname, value);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc);
      }

      if (isSet) {
        this.setFormFields();
      }
    },
    setFormFields() {
      let fieldList = this.fields;

      if (fieldList.length === 0) {
        fieldList = this.doc.quickEditFields;
      }

      if (fieldList.length === 0) {
        fieldList = this.doc.schema.fields.filter((f) => f.required);
      }

      this.formFields = this.doc
        .getFormFields(fieldList.filter(Boolean))
        .filter((field) => !evaluateHidden(field, this.doc));
    },
  },
});
</script>
