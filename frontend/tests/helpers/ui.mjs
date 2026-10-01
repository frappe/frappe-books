import { after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'books-ui-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'ui.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { getFieldsGroupedByTabAndSection } from './src/utils/ui';
      export { getBooksDocOrNew } from './src/frappe/useBooksDoc';
      export { FrappeDoc } from './src/frappe/document';
      export { registerFrappeModels } from './src/frappe/doctypes';
      export { loadFrappeDocTypes } from './src/frappe/registry';
      export { Search } from './src/utils/search';
      export { sortByFuzzyMatch } from './src/utils';
      export { fyo } from './src/initFyo';
      export { NotFoundError } from './fyo/utils/errors';
      export { default as FilterLinkInput } from './src/components/FilterLinkInput.vue';
    `,
    resolveDir: frontend,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: output,
  plugins: [
    {
      name: 'browser-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /^src\/router$/ }, () => ({
          path: 'router',
          namespace: 'stub',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export default {}',
        }));
        // Components under test keep their script; the rest are stubs.
        builder.onLoad({ filter: /FilterLinkInput\.vue$/ }, async (args) => ({
          contents: (await readFile(args.path, 'utf8')).match(
            /<script[^>]*>([\s\S]*?)<\/script>/
          )[1],
          loader: 'ts',
        }));
        builder.onLoad({ filter: /\.vue$/ }, () => ({
          contents: 'export default {}',
        }));
      },
    },
  ],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
});
globalThis.history = { state: null };
export const {
  getBooksDocOrNew,
  FrappeDoc,
  registerFrappeModels,
  loadFrappeDocTypes,
  getFieldsGroupedByTabAndSection,
  Search,
  sortByFuzzyMatch,
  fyo,
  NotFoundError,
  FilterLinkInput,
} = createRequire(import.meta.url)(output);
