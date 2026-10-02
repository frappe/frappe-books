<template>
  <FrappeCodeEditorContent :editor="view" />
</template>
<script lang="ts">
import { CompletionContext } from '@codemirror/autocomplete';
import { vue } from '@codemirror/lang-vue';
import { syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import {
  CodeEditorContent as FrappeCodeEditorContent,
  CodeKit,
  useCodeEditor,
} from 'frappe-ui/code-editor';
import { defineComponent, ref } from 'vue';

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

function getCompletionsFromHints(hints: Record<string, unknown>) {
  const options = hintsToCompletionOptions(hints);
  return function completions(context: CompletionContext) {
    let word = context.matchBefore(/\w*/);
    if (word == null) {
      return null;
    }

    const node = syntaxTree(context.state).resolveInner(context.pos);
    const aptLocation = ['ScriptAttributeValue', 'SingleExpression'];

    if (!aptLocation.includes(node.name)) {
      return null;
    }

    if (word.from === word.to && !context.explicit) {
      return null;
    }

    return {
      from: word.from,
      options,
    };
  };
}

type CompletionOption = {
  label: string;
  type: string;
  detail: string;
};

function hintsToCompletionOptions(
  hints: object,
  prefix?: string
): CompletionOption[] {
  prefix ??= '';
  const list: CompletionOption[] = [];

  for (const [key, value] of Object.entries(hints)) {
    const option = getCompletionOption(key, value, prefix);
    if (option === null) {
      continue;
    }

    if (Array.isArray(option)) {
      list.push(...option);
      continue;
    }

    list.push(option);
  }

  return list;
}

function getCompletionOption(
  key: string,
  value: unknown,
  prefix: string
): null | CompletionOption | CompletionOption[] {
  let label = key;
  if (prefix.length) {
    label = prefix + '.' + key;
  }

  if (Array.isArray(value)) {
    return {
      label,
      type: 'variable',
      detail: 'Child Table',
    };
  }

  if (typeof value === 'string') {
    return {
      label,
      type: 'variable',
      detail: value,
    };
  }

  if (typeof value === 'object' && value !== null) {
    return hintsToCompletionOptions(value, label);
  }

  return null;
}
</script>
