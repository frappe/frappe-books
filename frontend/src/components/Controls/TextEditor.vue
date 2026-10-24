<template>
  <div class="flex min-w-0 flex-col gap-1.5" :style="containerStyles">
    <FrappeFormLabel
      v-if="showLabel"
      :label="df.label"
      :required="isRequired && !isReadOnly"
    />
    <p v-if="isReadOnly && isEmpty" class="text-base text-ink-gray-4">
      {{ t`Not set` }}
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
      <template #default="{ editor }">
        <EditorContent v-if="isReadOnly" class="break-words text-ink-gray-8" />
        <!-- TextEditor has no `error` prop, so the red border is drawn here. -->
        <div
          v-else
          class="overflow-hidden rounded-5 border bg-surface-base"
          :class="
            invalid || (!isMobile && showMandatory)
              ? 'border-outline-red-3'
              : 'border-outline-gray-2'
          "
        >
          <EditorFixedMenu
            v-if="!isMobile"
            class="flex-wrap border-b border-outline-gray-1 p-1.5"
            :items="toolbar"
          />
          <EditorContent
            class="max-h-[300px] min-h-[88px] overflow-y-auto break-words px-3 py-2"
          />
        </div>
        <!-- Phones dock the toolbar above the keyboard while the editor has focus. -->
        <Teleport v-if="isMobile && focused" to="body">
          <div
            class="fixed inset-x-0 z-50 overflow-x-auto border-t border-outline-gray-1 bg-surface-base px-2 py-1.5"
            :style="{ bottom: `${keyboardInset}px` }"
            @mousedown.prevent
          >
            <EditorFixedMenu :editor="editor" :items="toolbar" />
          </div>
        </Teleport>
      </template>
    </FrappeEditor>
  </div>
</template>

<script lang="ts">
import { useEventListener } from '@vueuse/core';
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
import { defineComponent, markRaw, ref } from 'vue';
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
    // How far the keyboard pushes the visual viewport up from the layout viewport's bottom.
    const keyboardInset = ref(0);
    const viewport = window.visualViewport;
    const updateInset = () => {
      keyboardInset.value = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
    };
    useEventListener(viewport, ['resize', 'scroll'], updateInset);
    return {
      keyboardInset,
      updateInset,
      toolbar: markRaw(toolbar),
      extensions: markRaw(extensions),
    };
  },
  data() {
    return { focused: false, draft: null as string | null };
  },
  methods: {
    focus() {
      (
        this.$refs.input as { editor?: { commands: { focus(): void } } }
      )?.editor?.commands.focus();
    },
    onFocus(event: FocusEvent) {
      this.focused = true;
      this.updateInset();
      this.$emit('focus', event);
    },
    /** Edits are set when the editor loses focus, as other fields set theirs. */
    onBlur() {
      this.focused = false;
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
