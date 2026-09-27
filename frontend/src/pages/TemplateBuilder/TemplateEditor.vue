<template>
  <div ref="container" class="bg-surface-base text-ink-gray-9"></div>
</template>
<script lang="ts">
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { vue } from '@codemirror/lang-vue';
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { defineComponent, markRaw } from 'vue';

export default defineComponent({
  props: {
    initialValue: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    hints: { type: Object, default: undefined },
  },
  emits: ['input', 'blur'],
  data() {
    return { state: null, view: null, compartments: {} } as {
      state: EditorState | null;
      view: EditorView | null;
      compartments: Record<string, Compartment>;
    };
  },
  computed: {
    container() {
      const { container } = this.$refs;
      if (container instanceof HTMLDivElement) {
        return container;
      }

      throw new Error('ref container is not a div element');
    },
  },
  watch: {
    disabled(value: boolean) {
      this.setDisabled(value);
    },
  },
  mounted() {
    if (!this.view) {
      this.init();
    }
  },
  beforeUnmount() {
    this.view?.destroy();
  },
  methods: {
    init() {
      const readOnly = new Compartment();
      const editable = new Compartment();

      const highlightStyle = HighlightStyle.define([
        { tag: tags.typeName, color: 'var(--ink-pink-7)' },
        { tag: tags.angleBracket, color: 'var(--ink-pink-7)' },
        { tag: tags.attributeName, color: 'var(--ink-gray-5)' },
        { tag: tags.attributeValue, color: 'var(--ink-blue-7)' },
        { tag: tags.comment, color: 'var(--ink-gray-5)', fontStyle: 'italic' },
        { tag: tags.keyword, color: 'var(--ink-orange-7)' },
        { tag: tags.variableName, color: 'var(--ink-teal-7)' },
        { tag: tags.string, color: 'var(--ink-blue-7)' },
      ]);
      const completions = getCompletionsFromHints(this.hints ?? {});

      const view = new EditorView({
        doc: this.initialValue,
        extensions: [
          EditorView.updateListener.of(this.updateListener.bind(this)),
          readOnly.of(EditorState.readOnly.of(this.disabled)),
          editable.of(EditorView.editable.of(!this.disabled)),
          basicSetup,
          vue(),
          syntaxHighlighting(highlightStyle),
          autocompletion({ override: [completions] }),
        ],
        parent: this.container,
      });
      this.view = markRaw(view);

      const compartments = { readOnly, editable };
      this.compartments = markRaw(compartments);
    },
    updateListener(update: ViewUpdate) {
      if (update.docChanged) {
        this.$emit('input', this.view?.state.doc.toString() ?? '');
      }

      if (update.focusChanged && !this.view?.hasFocus) {
        this.$emit('blur', this.view?.state.doc.toString() ?? '');
      }
    },
    setDisabled(value: boolean) {
      const { readOnly, editable } = this.compartments;
      this.view?.dispatch({
        effects: [
          readOnly.reconfigure(EditorState.readOnly.of(value)),
          editable.reconfigure(EditorView.editable.of(!value)),
        ],
      });
    },
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
<style scoped>
:deep(.cm-editor) {
  @apply text-sm text-ink-gray-8;
}

:deep(.cm-content) {
  line-height: 1.5;
}

:deep(.cm-gutter) {
  @apply bg-surface-gray-1 text-ink-gray-5;
}

:deep(.cm-gutters) {
  border: none !important;
  border-right: 1px solid var(--outline-gray-1) !important;
}

:deep(.cm-activeLine),
:deep(.cm-activeLineGutter) {
  background-color: var(--surface-gray-2) !important;
}

:deep(.cm-tooltip-autocomplete) {
  background-color: var(--surface-elevation-2) !important;
  border: 1px solid var(--outline-gray-2) !important;
  @apply rounded-6 shadow-2xl overflow-hidden text-ink-gray-8;
}

:deep(.cm-tooltip-autocomplete ul li[aria-selected]) {
  background-color: var(--surface-gray-3) !important;
  color: var(--ink-gray-8) !important;
}

:deep(.cm-panels) {
  border-top: 1px solid var(--outline-gray-1) !important;
  background-color: var(--surface-gray-1) !important;
  color: var(--ink-gray-8) !important;
}

:deep(.cm-editor .cm-panel.cm-search) {
  @apply flex flex-wrap items-center gap-1 p-2 pe-8 text-sm;
  line-height: 1.5;
}

:deep(.cm-editor .cm-search label) {
  @apply inline-flex items-center gap-1 text-sm;
}

:deep(.cm-editor .cm-search input[type='checkbox']) {
  @apply size-3.5 rounded-2;
  appearance: auto;
  accent-color: var(--ink-gray-9);
}

:deep(.cm-editor .cm-button) {
  background-image: none !important;
  background-color: var(--surface-gray-2) !important;
  color: var(--ink-gray-8) !important;
  border: none !important;
  @apply h-7 rounded-4 text-sm px-2 py-1;
}

:deep(.cm-editor .cm-button:hover) {
  background-color: var(--surface-gray-3) !important;
}

:deep(.cm-editor .cm-textfield) {
  background-color: var(--surface-base) !important;
  border: 1px solid var(--outline-gray-2) !important;
  @apply h-7 rounded-4 text-sm text-ink-gray-8;
}
</style>
