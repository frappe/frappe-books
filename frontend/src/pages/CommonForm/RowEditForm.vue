<template>
  <div
    class="
      border-s
      border-outline-gray-1
      h-full
      overflow-auto
      w-quick-edit
      bg-surface-base
      custom-scroll custom-scroll-thumb2
    "
  >
    <!-- Row Edit Tool bar -->
    <div
      class="
        sticky
        top-0
        border-b
        border-outline-gray-1
        bg-surface-base
      "
      style="z-index: 1"
    >
      <div class="flex items-center justify-between px-4 h-row-largest">
        <!-- Close Button -->
        <FrappeButton
          icon="lucide-x"
          :label="t`Close row editor`"
          @click="$emit('close')"
        />

        <!-- Actions, Badge and Status Change Buttons -->
        <div class="flex items-stretch gap-2">
          <FrappeButton
            v-if="previous >= 0"
            icon="lucide-chevron-left"
            :label="t`Previous row`"
            @click="$emit('previous', previous)"
          />
          <FrappeButton
            v-if="next >= 0"
            icon="lucide-chevron-right"
            :label="t`Next row`"
            @click="$emit('next', next)"
          />
        </div>
      </div>
      <FormHeader
        class="border-t border-outline-gray-1"
        :form-title="t`Row ${index + 1}`"
        :form-sub-title="fieldlabel"
      />
    </div>
    <TwoColumnForm
      ref="form"
      class="w-full"
      :doc="row"
      :fields="fields"
      :column-ratio="[1.1, 2]"
    />
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { Doc } from 'fyo/model/doc';
import { ValueError } from 'fyo/utils/errors';
import FormHeader from 'src/components/FormHeader.vue';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { computed } from 'vue';
import { inject } from 'vue';
import { defineComponent } from 'vue';

const COMPONENT_NAME = 'RowEditForm';

export default defineComponent({
  components: { FrappeButton, TwoColumnForm, FormHeader },
  provide() {
    return {
      doc: computed(() => this.row),
    };
  },
  props: {
    doc: { type: Doc, required: true },
    index: { type: Number, required: true },
    fieldname: { type: String, required: true },
  },
  emits: ['next', 'previous', 'close'],
  setup() {
    return { shortcuts: inject(shortcutsKey) };
  },
  computed: {
    fieldlabel() {
      return (
        this.fyo.getField(this.doc.schemaName, this.fieldname)?.label ?? ''
      );
    },
    row() {
      const rows = this.doc.get(this.fieldname);
      if (Array.isArray(rows) && rows[this.index] instanceof Doc) {
        return rows[this.index];
      }

      const label = `${this.doc.name ?? '_name'}.${this.fieldname}[${
        this.index
      }]`;
      throw new ValueError(this.t`Invalid value found for ${label}`);
    },
    fields() {
      const fieldnames = this.row.schema.quickEditFields ?? [];
      return fieldnames.map((f) => this.fyo.getField(this.row.schemaName, f));
    },
    previous(): number {
      return this.index - 1;
    },
    next() {
      const rows = this.doc.get(this.fieldname);
      if (!Array.isArray(rows)) {
        return -1;
      }

      if (rows.length - 1 === this.index) {
        return -1;
      }

      return this.index + 1;
    },
  },
  mounted() {
    this.shortcuts?.set(COMPONENT_NAME, ['Escape'], () => this.$emit('close'));
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
});
</script>
