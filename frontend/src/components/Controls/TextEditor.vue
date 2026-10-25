<template>
  <div class="flex min-w-0 flex-col gap-1.5" :style="containerStyles">
    <!-- A read value labels itself as ReadOnlyValue does. -->
    <span
      v-if="showLabel && isReadOnly && isMobile"
      class="text-sm text-ink-gray-6"
      >{{ df.label }}</span
    >
    <FrappeFormLabel
      v-else-if="showLabel"
      :label="df.label"
      :required="isRequired && !isReadOnly"
    />
    <!-- As ReadOnlyValue: a labelled field reads "Not set", a bare value a dash. -->
    <p v-if="isReadOnly && isEmpty" class="text-base text-ink-gray-4">
      {{ showLabel || isMobile ? t`Not set` : '—' }}
    </p>
    <FrappeEditor
      v-else
      ref="input"
      :model-value="typeof value === 'string' ? value : ''"
      :extensions="extensions"
      :editable="!isReadOnly"
      :placeholder="inputPlaceholder"
      :upload-function="uploadImage"
      @change="
        (html: unknown) => (draft = typeof html === 'string' ? html : '')
      "
      @focus="onFocus"
      @blur="onBlur"
    >
      <template #default>
        <EditorContent v-if="isReadOnly" class="break-words text-ink-gray-8" />
        <div v-else class="overflow-hidden border" :class="surfaceClasses">
          <EditorFixedMenu
            class="flex-wrap border-b border-outline-gray-1 p-1.5"
            :items="toolbar"
          />
          <EditorContent
            class="max-h-[300px] min-h-[88px] overflow-y-auto break-words px-3 py-2"
          />
        </div>
      </template>
    </FrappeEditor>
  </div>
</template>

<script lang="ts">
import { FormLabel as FrappeFormLabel, upload } from 'frappe-ui';
import {
  Blockquote,
  Bold,
  BulletList,
  CommentKit,
  type CommandMenuItem,
  Editor as FrappeEditor,
  EditorContent,
  EditorFixedMenu,
  H1,
  InsertImage,
  InsertLink,
  Italic,
  type MenuItem,
  OrderedList,
  Separator,
  Strike,
} from 'frappe-ui/editor';
import { defineComponent, markRaw } from 'vue';
import Base from './Base.vue';

// frappe-ui exports no Underline item.
const Underline: CommandMenuItem = {
  label: 'Underline',
  icon: 'lucide-underline',
  action: (editor) => editor.chain().focus().toggleUnderline().run(),
  isActive: (editor) => editor.isActive('underline'),
};

const toolbar: MenuItem[] = [
  Bold,
  Italic,
  Underline,
  Strike,
  Separator,
  H1,
  Blockquote,
  Separator,
  BulletList,
  OrderedList,
  Separator,
  InsertLink,
  InsertImage,
];

const extensions = [
  CommentKit.configure({
    video: false,
    attachment: false,
    emoji: false,
    mention: false,
    tag: false,
  }),
];

/** A Text Editor field: rich text, saved as the HTML Frappe keeps. */
export default defineComponent({
  name: 'TextEditor',
  components: { EditorContent, EditorFixedMenu, FrappeEditor, FrappeFormLabel },
  extends: Base,
  setup() {
    return { toolbar: markRaw(toolbar), extensions: markRaw(extensions) };
  },
  data() {
    return { draft: null as string | null };
  },
  computed: {
    /** The box of Textarea's variant: outline on desktop, subtle on phones. Editor has no `error`, so the red border is drawn here. */
    surfaceClasses(): string[] {
      const classes = this.isMobile
        ? [
            'rounded-5 bg-surface-gray-2 focus-within:bg-surface-base',
            'border-[--surface-gray-2] focus-within:border-outline-gray-4',
          ]
        : [
            'rounded-4 bg-surface-base hover:border-outline-gray-3',
            'border-outline-gray-2 focus-within:border-outline-gray-4',
          ];
      if (this.invalid || (!this.isMobile && this.showMandatory)) {
        classes.push('!border-outline-red-3');
      }
      return classes;
    },
  },
  methods: {
    focus() {
      (
        this.$refs.input as { editor?: { commands: { focus(): void } } }
      )?.editor?.commands.focus();
    },
    onFocus(event: FocusEvent) {
      this.$emit('focus', event);
    },
    /** Edits are set when the editor loses focus, as other fields set theirs. */
    onBlur() {
      if (this.draft === null || this.draft === this.value) {
        return;
      }

      const isEmpty = (this.$refs.input as { isEmpty?: boolean }).isEmpty;
      this.triggerChange(isEmpty ? null : this.draft);
      this.draft = null;
    },
    /** Images upload as files of a saved document, else on their own. */
    async uploadImage(file: File) {
      const doc = this.doc;
      return await upload(
        file,
        doc?.inserted ? { doctype: doc.doctype, docname: doc.name } : {}
      );
    },
  },
});
</script>
