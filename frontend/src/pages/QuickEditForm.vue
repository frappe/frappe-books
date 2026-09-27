<template>
  <div
    class="
      border-s
      border-outline-gray-1
      h-full
      overflow-auto
      w-quick-edit
      bg-surface-base
    "
  >
    <!-- Quick edit Tool bar -->
    <div
      class="
        flex
        items-center
        justify-between
        px-4
        h-row-largest
        sticky
        top-0
        bg-surface-base
      "
      style="z-index: 1"
    >
      <!-- Close Button  -->
      <FrappeButton
        icon="lucide-x"
        :label="t`Close quick edit`"
        :tooltip="t`Close quick edit`"
        @click="routeToPrevious"
      />

      <!-- Save & Submit Buttons -->
      <FrappeButton v-if="doc?.canSave" variant="solid" @click="sync">
        {{ t`Save` }}
      </FrappeButton>
      <FrappeButton v-else-if="doc?.canSubmit" variant="solid" @click="submit">
        {{ t`Submit` }}
      </FrappeButton>
    </div>

    <!-- Name and image -->
    <div
      v-if="doc && (titleField || imageField)"
      class="flex min-h-14 items-center gap-3 border-b border-t border-outline-gray-1 px-4 py-3"
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
        class="min-w-0 break-words text-lg font-semibold text-ink-gray-9"
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
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import { Field, Schema } from 'schemas/types';
import AttachImage from 'src/components/Controls/AttachImage.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { DocRef } from 'src/utils/types';
import {
  commonDocSubmit,
  commonDocSync,
  focusOrSelectFormControl,
} from 'src/utils/ui';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, ref } from 'vue';

export default defineComponent({
  name: 'QuickEditForm',
  components: {
    FrappeButton,
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
    const doc = ref(null) as DocRef;
    const shortcuts = inject(shortcutsKey);

    let context = 'QuickEditForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, doc, context, true);
    }

    return {
      form: ref<InstanceType<typeof TwoColumnForm> | null>(null),
      doc,
      context,
      shortcuts,
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
    schema(): Schema {
      return fyo.schemaMap[this.schemaName]!;
    },
    fields() {
      if (!this.schema) {
        return [];
      }

      const fieldnames = (this.schema.quickEditFields ?? ['name']).filter(
        (f) => !this.hideFields.includes(f)
      );

      if (this.showFields?.length) {
        fieldnames.push(
          ...this.schema.fields
            .map((f) => f.fieldname)
            .filter((f) => this.showFields.includes(f))
        );
      }

      // Required custom fields are asked for so the record can be saved.
      for (const { fieldname, isCustom, required } of this.schema.fields) {
        if (isCustom && required && !fieldnames.includes(fieldname)) {
          fieldnames.push(fieldname);
        }
      }

      return fieldnames.map((f) => fyo.getField(this.schemaName, f));
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
      this.titleField = fyo.getField(this.schemaName, titleFieldName) ?? null;
      this.imageField = fyo.getField(this.schemaName, 'image') ?? null;
    },
    async setDoc() {
      try {
        this.doc = await fyo.doc.getDoc(this.schemaName, this.name);
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
