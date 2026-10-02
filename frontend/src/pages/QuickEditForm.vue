<template>
  <FrappeBottomSheet
    v-if="isMobile"
    :open="true"
    :title="sheetTitle"
    @update:open="(open: boolean) => !open && routeToPrevious()"
  >
    <TwoColumnForm v-if="doc" ref="form" :doc="doc" :fields="sheetFields" />
    <div
      v-if="doc?.canSave || doc?.canSubmit"
      class="px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <FrappeButton
        v-if="doc.canSave"
        class="w-full"
        size="lg"
        variant="solid"
        :label="t`Save`"
        @click="sync"
      />
      <FrappeButton
        v-else
        class="w-full"
        size="lg"
        variant="solid"
        :label="t`Submit`"
        @click="submit"
      />
    </div>
  </FrappeBottomSheet>
  <div
    v-else
    class="flex h-full w-quick-edit flex-col border-s border-outline-gray-1 bg-surface-base"
  >
    <!-- Quick edit Tool bar -->
    <div class="flex h-12 shrink-0 items-center justify-end gap-2 px-3">
      <!-- Save & Submit Buttons -->
      <FrappeButton v-if="doc?.canSave" variant="solid" @click="sync">
        {{ t`Save` }}
      </FrappeButton>
      <FrappeButton v-else-if="doc?.canSubmit" variant="solid" @click="submit">
        {{ t`Submit` }}
      </FrappeButton>

      <FrappeButton
        icon="lucide-x"
        :label="t`Close quick edit`"
        :tooltip="t`Close quick edit`"
        @click="routeToPrevious"
      />
    </div>

    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
      <!-- Name and image -->
      <div
        v-if="doc && (titleField || imageField)"
        class="flex min-h-14 items-center gap-3 border-b border-t border-outline-gray-1 p-3"
      >
        <AttachImage
          v-if="imageField"
          class="shrink-0"
          size="small"
          :df="imageField"
          :value="String(doc[imageField.fieldname] ?? '')"
          :letter-placeholder="letterPlaceHolder"
          @change="(value: DocValue) => valueChange(imageField as Field, value)"
        />
        <h2
          v-if="titleField && (doc.inserted || doc.schema.naming !== 'manual')"
          class="min-w-0 break-words text-lg-semibold text-ink-gray-8"
        >
          {{ doc[titleField.fieldname] || titleField.label }}
        </h2>
        <FormControl
          v-else-if="titleField"
          ref="titleControl"
          class="min-w-0 flex-1"
          :border="true"
          :df="titleField"
          :value="doc[titleField.fieldname]"
          @change="(value: DocValue) => valueChange(titleField as Field, value)"
        />
      </div>

      <!-- Rest of the form -->
      <TwoColumnForm
        v-if="doc"
        ref="form"
        class="w-full"
        :doc="doc"
        :fields="fields"
        :column-ratio="[1.1, 2]"
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
import { Field, Schema } from 'schemas/types';
import AttachImage from 'src/components/Controls/AttachImage.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getField, getFields, getSchema } from 'src/frappe/registry';
import { useBooksDoc } from 'src/frappe/useBooksDoc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import {
  commonDocSubmit,
  commonDocSync,
  focusOrSelectFormControl,
} from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { getQuickEditFieldnames } from 'src/utils/sheetFields';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, ref } from 'vue';

export default defineComponent({
  name: 'QuickEditForm',
  components: {
    FrappeBottomSheet,
    FrappeButton,
    FrappeScrollArea,
    FormControl,
    TwoColumnForm,
    AttachImage,
  },
  provide() {
    return {
      doc: computed(() => this.doc),
    };
  },
  props: {
    name: { type: String, required: true },
    schemaName: { type: String, required: true },
    hideFields: { type: Array, default: () => [] },
    showFields: { type: Array, default: () => [] },
  },
  emits: ['close'],
  setup() {
    const { doc, load: loadDoc } = useBooksDoc();
    const shortcuts = inject(shortcutsKey);

    let context = 'QuickEditForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, doc, context, true);
    }

    return {
      form: ref<InstanceType<typeof TwoColumnForm> | null>(null),
      doc,
      loadDoc,
      context,
      shortcuts,
      isMobile,
    };
  },
  data() {
    return {
      titleField: null,
      imageField: null,
    } as {
      titleField: null | Field;
      imageField: null | Field;
    };
  },
  computed: {
    letterPlaceHolder() {
      if (!this.doc) {
        return '';
      }

      const fn = this.titleField?.fieldname ?? 'name';
      const value = this.doc.get(fn);
      if (typeof value === 'string') {
        return value[0];
      }

      return '';
    },
    sheetTitle(): string {
      if (!this.doc || this.doc.notInserted) {
        return this.t`New ${this.schema.label}`;
      }

      const title = this.titleField && this.doc.get(this.titleField.fieldname);
      return String(title || this.doc.name);
    },
    sheetFields(): Field[] {
      const isTitleEditable =
        this.titleField &&
        this.doc?.notInserted &&
        this.doc.schema.naming === 'manual';
      const fields = this.fields as Field[];
      if (!isTitleEditable || fields.includes(this.titleField!)) {
        return fields;
      }

      return [this.titleField!, ...fields];
    },
    schema(): Schema {
      return getSchema(this.schemaName)!;
    },
    fields() {
      if (!this.schema) {
        return [];
      }

      const fieldnames = getQuickEditFieldnames(
        this.schema,
        this.hideFields as string[],
        this.showFields as string[]
      );
      return getFields(this.schemaName, fieldnames);
    },
  },
  activated() {
    this.setShortcuts();
  },
  async mounted() {
    await this.initialize();

    this.setShortcuts();
  },
  methods: {
    setShortcuts() {
      this.shortcuts?.set(this.context, ['Escape'], async () => {
        await this.routeToPrevious();
      });
    },
    async initialize() {
      if (!this.schema) {
        return;
      }

      this.setFields();
      await this.setDoc();
      if (!this.doc) {
        return;
      }

      focusOrSelectFormControl(this.doc, this.$refs.titleControl, false);
    },
    setFields() {
      const titleFieldName = this.schema.titleField ?? 'name';
      this.titleField = getField(this.schemaName, titleFieldName) ?? null;
      this.imageField = getField(this.schemaName, 'image') ?? null;
    },
    async setDoc() {
      try {
        await this.loadDoc(this.schemaName, this.name);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true);
        return this.$router.back();
      }
    },
    valueChange(field: Field, value: DocValue) {
      this.form?.onChange(field, value);
    },
    async sync() {
      if (!this.doc) {
        return;
      }

      await commonDocSync(this.doc);
    },
    async submit() {
      if (!this.doc) {
        return;
      }

      await commonDocSubmit(this.doc);
    },
    async routeToPrevious() {
      if (this.doc?.dirty && this.doc?.inserted) {
        await this.doc.load();
      }

      if (this.doc && this.doc.notInserted) {
        await this.doc.delete();
      }

      this.$router.back();
    },
  },
});
</script>
