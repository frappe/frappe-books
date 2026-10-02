<template>
  <FrappeCodeEditorContent :editor="view" />
</template>
<script lang="ts">
import { vue } from '@codemirror/lang-vue';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  CodeEditorContent as FrappeCodeEditorContent,
  CodeKit,
  useCodeEditor,
} from 'frappe-ui/code-editor';
import { defineComponent, ref } from 'vue';
import { getCompletionsFromHints } from './completions';

export default defineComponent({
  components: { FrappeCodeEditorContent },
  props: {
    initialValue: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    hints: { type: Object, default: undefined },
  },
  emits: ['input', 'blur', 'apply', 'save', 'toggle-edit-mode', 'toggle-hints'],
  setup(props, { emit }) {
    const completions = getCompletionsFromHints(props.hints ?? {});
    const text = (editor: EditorView) => editor.state.doc.toString();
    const handled = (action: (editor: EditorView) => void) => {
      return (editor: EditorView) => {
        action(editor);
        return true;
      };
    };
    const view = useCodeEditor({
      content: ref(props.initialValue),
      extensions: [
        CodeKit.configure({
          lineNumbers: {},
          autocompletion: { override: [completions] },
        }),
        vue(),
        // The Template Builder's shortcuts, which the default keymap would
        // take: its Mod-Enter inserts a blank line, and its macOS Ctrl-E and
        // Ctrl-H move and delete. A save here takes the text not yet applied.
        Prec.high(
          keymap.of([
            {
              key: 'Ctrl-Enter',
              run: handled((editor) => emit('apply', text(editor))),
            },
            {
              key: 'Mod-s',
              run: handled((editor) => emit('save', text(editor))),
            },
            { key: 'Ctrl-e', run: handled(() => emit('toggle-edit-mode')) },
            { key: 'Ctrl-h', run: handled(() => emit('toggle-hints')) },
          ])
        ),
      ],
      editable: () => !props.disabled,
      onUpdate: (editor) => emit('input', text(editor)),
      onBlur: (editor) => emit('blur', text(editor)),
    });

    return { view };
  },
});
</script>
