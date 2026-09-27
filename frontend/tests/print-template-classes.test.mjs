import assert from 'node:assert/strict';
import { test } from 'node:test';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

// Saved templates copied from earlier defaults still use these.
const savedTemplateClasses = [
  'w-3/12',
  'w-1/4',
  'w-2/5',
  'w-11/12',
  'mx-16',
  '-mx-3',
  'pt-6',
  'p-0.5',
  'grid-rows-5',
  'col-start-4',
  'row-start-2',
  'h-18',
];

test('print template classes are built without appearing in the source', async () => {
  const configPath = new URL('../tailwind.config.mjs', import.meta.url);
  const config = loadConfig(configPath.pathname);
  const { css } = await postcss([
    tailwind({ ...config, content: [{ raw: '' }] }),
  ]).process('@tailwind utilities', { from: undefined });

  for (const name of savedTemplateClasses) {
    const selector = `.${name.replace(/[/.]/g, '\\$&')} {`;
    assert.ok(css.includes(selector), `${name} is not built`);
  }
});
