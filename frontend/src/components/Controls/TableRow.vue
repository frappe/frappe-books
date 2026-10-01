<template>
  <FrappeListRow class="group min-h-12 w-full">
    <!-- Index or Remove button -->
    <FrappeListCell
      class="justify-center text-ink-gray-6"
      @mouseenter="isIndexHovered = true"
      @mouseleave="isIndexHovered = false"
    >
      <span v-if="!canRemoveRow">
        {{ row.idx + 1 }}
      </span>
      <FrappeButton
        v-else
        :icon="showDeleteButton ? 'lucide-x' : undefined"
        variant="ghost"
        size="xs"
        aria-label="Delete row"
        @focus="isDeleteFocused = true"
        @blur="isDeleteFocused = false"
        @click="$emit('remove')"
      >
        <span v-if="!showDeleteButton">
          {{ row.idx + 1 }}
        </span>
      </FrappeButton>
    </FrappeListCell>

    <!-- Data Input Form Control -->
    <FrappeListCell
      v-for="df in tableFields"
      :key="df.fieldname"
      class="min-w-0 self-center"
    >
      <FormControl
        class="min-w-0 flex-1"
        :size="size"
        :df="df"
        :value="row[df.fieldname]"
        :read-only="readOnly ? true : undefined"
        @change="(value) => onChange(df, value)"
      />
    </FrappeListCell>
    <FrappeListCell v-if="canEditRow" class="justify-center">
      <FrappeButton
        variant="ghost"
        icon="lucide-square-pen"
        :label="t`Edit row`"
        :tooltip="t`Edit row`"
        @click="openRowQuickEdit"
      />
    </FrappeListCell>

    <!-- Error Display -->
    <FrappeListCell
      v-if="hasErrors"
      class="ps-2 col-span-full relative"
      style="bottom: 0.75rem; height: 0px"
    >
      <FrappeErrorMessage :message="getErrorString()" />
    </FrappeListCell>
  </FrappeListRow>
</template>
<script>
import { FrappeDoc } from 'src/frappe/document';
import {
  Button as FrappeButton,
  ErrorMessage as FrappeErrorMessage,
} from 'frappe-ui';
import {
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
import { getErrorMessage } from 'src/utils';
import { computed, nextTick } from 'vue';
import FormControl from './FormControl.vue';

export default {
  name: 'TableRow',
  components: {
    FrappeErrorMessage,
    FrappeListRow,
    FrappeListCell,
    FormControl,
    FrappeButton,
  },
  provide() {
    return {
      doc: computed(() => this.row),
    };
  },
  props: {
    row: FrappeDoc,
    tableFields: Array,
    size: String,
    readOnly: Boolean,
    canRemoveRow: Boolean,
    canEditRow: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['remove', 'change', 'editrow'],
  data: () => ({
    isIndexHovered: false,
    isDeleteFocused: false,
    errors: {},
  }),
  computed: {
    showDeleteButton() {
      return this.isIndexHovered || this.isDeleteFocused;
    },
    hasErrors() {
      return Object.values(this.errors).filter(Boolean).length;
    },
  },
  beforeCreate() {
    this.$options.components.FormControl = FormControl;
  },
  methods: {
    async onChange(df, value) {
      const fieldname = df.fieldname;
      this.errors[fieldname] = null;
      const oldValue = this.row[fieldname];
      try {
        await this.row.set(fieldname, value);
        this.$emit('change', df, value);
      } catch (e) {
        this.errors[fieldname] = getErrorMessage(e, this.row);
        this.row[fieldname] = '';
        nextTick(() => (this.row[fieldname] = oldValue));
      }
    },
    getErrorString() {
      return Object.values(this.errors).filter(Boolean).join(' ');
    },
    openRowQuickEdit() {
      if (!this.row) return;
      this.$emit('editrow', this.row);
    },
    focusFirstInput() {
      const firstControl = this.$el.querySelector(
        '.form-control, input, textarea, select'
      );
      if (firstControl) {
        firstControl.focus();
      }
    },
  },
};
</script>
