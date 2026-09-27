import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const controls = [
  'src/components/Controls/AutoComplete.vue',
  'src/components/Controls/Link.vue',
];

// Reads only the script blocks, which hold a component's imports. Script
// setup components get the default export the Vue compiler would add.
const vueScripts = {
  name: 'vue-scripts',
  setup(builder) {
    builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const scripts = source.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
      const contents = scripts
        .map((script) => script.replace(/^<script[^>]*>|<\/script>$/g, ''))
        .join('\n');
      const exportDefault = /export default/.test(contents)
        ? ''
        : '\nexport default {};';
      return { contents: contents + exportDefault, loader: 'ts' };
    });
  },
};

function importsItself(inputs, start) {
  const seen = new Set();
  const pending = [start];
  while (pending.length) {
    const file = pending.pop();
    for (const { path, kind } of inputs[file]?.imports ?? []) {
      if (kind !== 'import-statement') continue;
      if (path === start) return true;
      if (seen.has(path)) continue;
      seen.add(path);
      pending.push(path);
    }
  }
  return false;
}

test('link controls are not in a static import cycle', async () => {
  const { metafile } = await build({
    absWorkingDir: frontend,
    entryPoints: controls,
    bundle: true,
    write: false,
    metafile: true,
    outdir: 'out',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [vueScripts],
    loader: { '.svg': 'empty', '.png': 'empty', '.css': 'empty' },
  });

  for (const control of controls) {
    assert.equal(importsItself(metafile.inputs, control), false, control);
  }
});
