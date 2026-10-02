import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompletionContext } from '@codemirror/autocomplete';
import { vue } from '@codemirror/lang-vue';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { getCompletionsFromHints } from '../src/pages/TemplateBuilder/completions.ts';

const completions = getCompletionsFromHints({
  doc: { name: 'Name', items: [{ rate: 'Rate' }] },
  print: { color: 'Color' },
});

/** The template after picking `label` where `|` is the cursor. */
function pick(template, label) {
  const pos = template.indexOf('|');
  const text = template.replace('|', '');
  const state = EditorState.create({ doc: text, extensions: [vue()] });
  ensureSyntaxTree(state, text.length, 5000);
  const result = completions(new CompletionContext(state, pos, false));
  assert.ok(result.options.some((option) => option.label === label));
  return text.slice(0, result.from) + label + text.slice(pos);
}

test('a picked hint replaces the path typed before it', () => {
  assert.equal(
    pick('<p>{{ doc.na| }}</p>', 'doc.name'),
    '<p>{{ doc.name }}</p>'
  );
  assert.equal(pick('<p>{{ na| }}</p>', 'doc.name'), '<p>{{ doc.name }}</p>');
});
