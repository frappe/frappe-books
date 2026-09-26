import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'books-load-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'ui.cjs');
const frontend = fileURLToPath(new URL('..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { getDocFromNameIfExistsElseNew } from './src/utils/ui';
      export { fyo } from './src/initFyo';
      export { NotFoundError } from './fyo/utils/errors';
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
        builder.onLoad({ filter: /\.vue$/ }, () => ({
          contents: 'export default {}',
        }));
      },
    },
  ],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
});
globalThis.history = { state: null };
const { getDocFromNameIfExistsElseNew, fyo, NotFoundError } = createRequire(
  import.meta.url
)(output);

test('a missing document opens a new one, but other load errors surface', async () => {
  const newDoc = { name: 'New Invoice 01' };
  fyo.doc.getNewDoc = () => newDoc;

  fyo.doc.getDoc = async () => {
    throw new NotFoundError('Not Found');
  };
  assert.equal(
    await getDocFromNameIfExistsElseNew('SalesInvoice', 'SINV-1'),
    newDoc
  );

  fyo.doc.getDoc = async () => {
    throw new Error('Server unavailable');
  };
  await assert.rejects(
    getDocFromNameIfExistsElseNew('SalesInvoice', 'SINV-1'),
    /Server unavailable/
  );
});
