<template>
  <FrappeCodeEditorContent :editor="view" />
</template>
<script lang="ts">
import { vue } from '@codemirror/lang-vue';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
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
  emits: ['input', 'blur', 'apply'],
  setup(props, { emit }) {
    const completions = getCompletionsFromHints(props.hints ?? {});
    const view = useCodeEditor({
      content: ref(props.initialValue),
      extensions: [
        CodeKit.configure({
          lineNumbers: {},
          autocompletion: { override: [completions] },
        }),
        vue(),
        // Control on every platform, as the hint shows. Above the default
        // keymap, whose Mod-Enter inserts a blank line.
        Prec.high(
          keymap.of([
            {
              key: 'Ctrl-Enter',
              run: (editor) => {
                emit('apply', editor.state.doc.toString());
                return true;
              },
            },
          ])
        ),
      ],
      editable: () => !props.disabled,
      onUpdate: (editor) => emit('input', editor.state.doc.toString()),
      onBlur: (editor) => emit('blur', editor.state.doc.toString()),
    });

    return { view };
  },
});
</script>
