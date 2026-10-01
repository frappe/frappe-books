<template>
  <RowDetailSheet
    v-if="isMobile && !isEditable"
    :row="row"
    :title="t`${fieldlabel} · Row ${index + 1}`"
    @close="$emit('close')"
  />
  <FrappeBottomSheet
    v-else-if="isMobile"
    :open="true"
    :title="t`Row ${index + 1}`"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <TwoColumnForm :doc="row" :fields="fields" />
    <div class="flex gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <FrappeButton
        v-if="isEditable"
        size="lg"
        variant="ghost"
        theme="red"
        icon-left="lucide-trash-2"
        :label="t`Remove`"
        @click="remove"
      />
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        :label="t`Done`"
        @click="$emit('close')"
      />
    </div>
  </FrappeBottomSheet>
  <div
    v-else
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
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import { FrappeDoc } from 'src/frappe/document';
import { ValueError } from 'fyo/utils/errors';
import FormHeader from 'src/components/FormHeader.vue';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import RowDetailSheet from './RowDetailSheet.vue';
import { evaluateReadOnly } from 'src/utils/doc';
import { isMobile } from 'src/utils/viewport';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getRowEditFieldnames } from 'src/utils/sheetFields';
import { computed } from 'vue';
import { inject } from 'vue';
import { defineComponent, PropType } from 'vue';

const COMPONENT_NAME = 'RowEditForm';

export default defineComponent({
  components: {
    FrappeBottomSheet,
    FrappeButton,
    FormHeader,
    RowDetailSheet,
    TwoColumnForm,
  },
  provide() {
    return {
      doc: computed(() => this.row),
    };
  },
  props: {
    doc: { type: Object as PropType<FrappeDoc>, required: true },
    index: { type: Number, required: true },
    fieldname: { type: String, required: true },
  },
  emits: ['next', 'previous', 'close'],
  setup() {
    return { shortcuts: inject(shortcutsKey), isMobile };
  },
  computed: {
    isEditable(): boolean {
      const field = this.doc.fieldMap[this.fieldname];
      return !!field && !evaluateReadOnly(field, this.doc);
    },
    fieldlabel() {
      return this.doc.fieldMap[this.fieldname]?.label ?? '';
    },
    row() {
      const rows = this.doc.get(this.fieldname);
      if (Array.isArray(rows) && rows[this.index] instanceof FrappeDoc) {
        return rows[this.index];
      }

      const label = `${this.doc.name ?? '_name'}.${this.fieldname}[${
        this.index
      }]`;
      throw new ValueError(this.t`Invalid value found for ${label}`);
    },
    fields() {
      const fieldnames = getRowEditFieldnames(this.row.schema);
      return fieldnames.map((f) => this.row.fieldMap[f]);
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
  methods: {
    async remove() {
      await this.doc.remove(this.fieldname, this.index);
      this.$emit('close');
    },
  },
});
</script>
