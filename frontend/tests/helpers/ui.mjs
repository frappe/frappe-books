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
      export { commonDocSubmit, deleteDocWithPrompt, getActionsForDoc, getFieldsGroupedByTabAndSection } from './src/utils/ui';
      export { dialog, toast } from 'frappe-ui';
      export { FrappeDoc } from './src/frappe/document';
      export { registerFrappeModels } from './src/frappe/doctypes';
      export { newFrappeDoc } from './src/frappe/documents';
      export { frappeModels } from './models';
      export { loadFrappeDocTypes } from './src/frappe/registry';
      export { Search } from './src/utils/search';
      export { sortByFuzzyMatch } from './src/utils';
      export { fyo } from './src/initFyo';
      export { default as FilterLinkInput } from './src/components/FilterLinkInput.vue';
      export { default as FilterValueInput } from './src/components/FilterValueInput.vue';
      export { default as StatusPill } from './src/components/StatusPill.vue';
      export { default as Link } from './src/components/Controls/Link.vue';
      export { default as MultiLabelLink } from './src/components/Controls/MultiLabelLink.vue';
      export { default as GetStarted } from './src/pages/GetStarted.vue';
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
        const tested =
          /\/(FilterLinkInput|FilterValueInput|Link|MultiLabelLink|GetStarted|StatusPill)\.vue$/;
        builder.onLoad({ filter: tested }, async (args) => ({
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
  commonDocSubmit,
  deleteDocWithPrompt,
  getActionsForDoc,
  dialog,
  toast,
  FrappeDoc,
  registerFrappeModels,
  newFrappeDoc,
  frappeModels,
  loadFrappeDocTypes,
  getFieldsGroupedByTabAndSection,
  Search,
  sortByFuzzyMatch,
  fyo,
  FilterLinkInput,
  FilterValueInput,
  StatusPill,
  Link,
  MultiLabelLink,
  GetStarted,
} = createRequire(import.meta.url)(output);
