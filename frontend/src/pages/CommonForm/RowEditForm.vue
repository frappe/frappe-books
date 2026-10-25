<template>
  <RowDetailSheet
    v-if="isMobile && !isEditable"
    :row="row"
    :title="ownTitle ?? t`${fieldlabel} · Row ${index + 1}`"
    @close="$emit('close')"
  />
  <FrappeBottomSheet
    v-else-if="isMobile"
    :open="true"
    :title="title"
    @update:open="(open: boolean) => !open && $emit('close')"
  >
    <div class="px-4">
      <TwoColumnForm :doc="row" :fields="fields" :field-errors="errors" />
      <!-- Sections run edge to edge, as on the form. -->
      <div v-if="isAccessory" class="-mx-4">
        <MobileExtraFields
          :doc="row"
          :errors="extraErrors"
          @value-change="setExtraValue"
        />
      </div>
      <MobileSheetFooter>
        <FrappeButton
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
      </MobileSheetFooter>
    </div>
  </FrappeBottomSheet>
  <div
    v-else
    class="flex h-full w-quick-edit flex-col border-s border-outline-gray-1 bg-surface-base"
  >
    <div
      class="flex h-12 shrink-0 items-center gap-2 border-b border-outline-gray-1 px-3"
    >
      <h2 class="truncate text-lg-semibold text-ink-gray-8">
        {{ title }}
      </h2>
      <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-5">
        {{ fieldlabel }}
      </span>
      <FrappeButton
        v-if="previous >= 0"
        variant="ghost"
        icon="lucide-chevron-left"
        :label="t`Previous row`"
        :tooltip="t`Previous row`"
        @click="$emit('previous', previous)"
      />
      <FrappeButton
        v-if="next >= 0"
        variant="ghost"
        icon="lucide-chevron-right"
        :label="t`Next row`"
        :tooltip="t`Next row`"
        @click="$emit('next', next)"
      />
      <FrappeButton
        variant="ghost"
        icon="lucide-x"
        :label="t`Close row editor`"
        :tooltip="t`Close row editor`"
        @click="$emit('close')"
      />
    </div>
    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
      <TwoColumnForm
        ref="form"
        class="w-full"
        :doc="row"
        :fields="fields"
        :field-errors="errors"
        :column-ratio="[1.1, 2]"
      />
      <ExtraFields
        v-if="isAccessory"
        v-model:active-tab="endTab"
        compact
        :doc="row"
        :errors="errors"
      />
    </FrappeScrollArea>
  </div>
</template>
<script lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import { ValueError } from 'fyo/utils/errors';
import { Field } from 'schemas/types';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import { FrappeDoc } from 'src/frappe/document';
import { noteRowMissingExtras } from 'src/frappe/extraFields';
import { isAccessoryMode } from 'src/frappe/mode';
import MobileSheetFooter from 'src/mobile/MobileSheetFooter.vue';
import { getErrorMessage } from 'src/utils';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { getOwnRowTitle, getRowEditFieldnames } from 'src/utils/sheetFields';
import { isMobile } from 'src/utils/viewport';
import { computed, defineComponent, inject, PropType } from 'vue';
import ExtraFields from './ExtraFields.vue';
import { getRowBooksFields } from './extraFieldsView';
import MobileExtraFields from './MobileExtraFields.vue';
import RowDetailSheet from './RowDetailSheet.vue';

const COMPONENT_NAME = 'RowEditForm';

/**
 * A table row's editor: a side panel on desktop, a sheet on phones. Accessory
 * mode adds More details and the end tabs after the row's Books fields.
 */
export default defineComponent({
  components: {
    ExtraFields,
    FrappeBottomSheet,
    FrappeButton,
    FrappeScrollArea,
    MobileExtraFields,
    MobileSheetFooter,
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
    /** Messages by fieldname to open with, e.g. a mandatory field a save found empty. */
    errors: {
      type: Object as PropType<Record<string, string>>,
      default: () => ({}),
    },
  },
  emits: ['next', 'previous', 'close'],
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
      isMobile,
      isAccessory: isAccessoryMode(),
    };
  },
  data() {
    return { endTab: '', extraErrors: {} as Record<string, string> };
  },
  computed: {
    isEditable(): boolean {
      const field = this.doc.fieldMap[this.fieldname];
      return !!field && !this.doc.getFieldState(field).readOnly;
    },
    fieldlabel() {
      return this.doc.fieldMap[this.fieldname]?.label ?? '';
    },
    ownTitle(): string | undefined {
      return getOwnRowTitle(this.row, this.index);
    },
    title(): string {
      return this.ownTitle ?? this.t`Row ${this.index + 1}`;
    },
    row(): FrappeDoc {
      const rows = this.doc.get(this.fieldname);
      if (Array.isArray(rows) && rows[this.index] instanceof FrappeDoc) {
        return rows[this.index];
      }

      const label = `${this.doc.name ?? '_name'}.${this.fieldname}[${
        this.index
      }]`;
      throw new ValueError(this.t`Invalid value found for ${label}`);
    },
    /** Accessory mode leaves the row's ERPNext-only fields to More details and the end tabs. */
    fields(): Field[] {
      if (this.isAccessory) {
        return getRowBooksFields(this.row);
      }

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
  watch: {
    row: {
      immediate: true,
      handler(row: FrappeDoc) {
        if (this.isAccessory) {
          noteRowMissingExtras(row);
        }
      },
    },
    errors: {
      immediate: true,
      handler(given: Record<string, string>) {
        this.extraErrors = { ...given };
      },
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
    async setExtraValue(field: Field, value: DocValue) {
      delete this.extraErrors[field.fieldname];
      try {
        await this.row.set(field.fieldname, value);
      } catch (error) {
        if (error instanceof Error) {
          this.extraErrors[field.fieldname] = getErrorMessage(error, this.row);
        }
      }
    },
  },
});
</script>
